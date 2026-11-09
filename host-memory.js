// 记忆, tavern side: writes up the older messages of each phone chat in layers after replies (core/memory.js), and
// gives the chat, call, 查手机, 朋友圈 and (when switched on) story requests what a chat remembers: the written-up
// layers and the older messages that match what is being talked about now. Writing uses the 文字模型 and costs one
// request per summary; searching is local unless a 向量模型 is set up.
import {currentDm} from './core/chats.js';
import {nextBatch, nextMerge, addNode, buildMemoryRequest, parseMemory, memoryText, chunks, chunkTexts, recall, recallText, textKey, transcript, roots, storyMemoryText, unwritten, STORY_MEMORY, STORY_SUMMARY_PROMPT, levelName, span} from './core/memory.js';
import {activeChatPreset, inSpace, plainStory} from './core/chat.js';

// How many requests one go may make: after a reply only a little (a long backlog is caught up over several replies),
// when the user asks for it more.
const AUTO_STEPS = 2, MANUAL_STEPS = 12;

export function createMemoryHost({context, settings, backend, notice = () => {}}) {
  const busy = new Map(), status = new Map();
  let storyText = '', storyTimer = 0, storyRun = 0, storyError = '', storyDone = Promise.resolve(), storyFor = null, closed = false;
  let storyCtx = '', storyBusy = null;
  // Which card the story memory is for (the open character, or the group).
  const cardKey = () => { const ctx = context(); return ctx ? `${ctx.groupId || ''}|${ctx.name2 || ''}` : ''; };
  const userName = () => context()?.name1 || '我';
  const options = () => activeChatPreset(settings().chat).memory;
  const windowSize = () => activeChatPreset(settings().chat).history;
  const who = thread => thread.type === 'group' ? thread.name : thread.members[0] || thread.name;
  const note = (threadId, patch) => { status.set(threadId, {...status.get(threadId), ...patch}); backend.emit('memory', {threadId}); };

  /** Writes up what is due in one chat: batches of older messages, then merges. force: 立即整理. */
  function tidy(threadId, {force = false} = {}) {
    if (busy.has(threadId)) return busy.get(threadId);
    const job = (async () => {
      const o = options();
      if (!o.enabled && !force) return 0;
      let steps = 0, written = 0;
      note(threadId, {busy: true, error: ''});
      try {
        while (steps < (force ? MANUAL_STEPS : AUTO_STEPS) && !closed) {
          const thread = await backend.chats.get(threadId);
          if (!thread) return written;
          const book = await backend.memoryBook(threadId), name = who(thread), user = userName(), group = thread.type === 'group';
          const batch = nextBatch(thread, book, {window: windowSize(), batch: o.batch, force: force && !written});
          const merge = batch.length ? null : nextMerge(book, {stage: o.stage, epic: o.epic});
          if (!batch.length && !merge) break;
          steps++;
          const prompt = buildMemoryRequest(batch.length ? {prompts: settings().promptRules, level: 0, messages: batch, user, who: name, group} : {prompts: settings().promptRules, level: merge.level, nodes: merge.nodes, user, who: name, group});
          const text = parseMemory(await backend.generateText(context(), {use: 'memory', prompt, trimNames: false}));
          await backend.memoryChange(threadId, current => batch.length
            ? addNode(current, {level: 0, text, from: batch[0].at, to: batch.at(-1).at, count: batch.length}, {through: batch.at(-1)})
            // The nodes merged may have been deleted or merged meanwhile: only those still open are covered.
            : addNode(current, {level: merge.level, text, covers: merge.nodes.map(n => n.id).filter(id => roots(current).some(r => r.id === id))}), name, book);
          written++;
        }
        note(threadId, {busy: false, error: '', at: Date.now()});
        if (written) refreshStory();
        return written;
      } catch (error) {
        note(threadId, {busy: false, error: error.message});
        if (force) throw error;
        return written;
      }
    })().finally(() => busy.delete(threadId));
    busy.set(threadId, job);
    return job;
  }
  /** After a reply (or a call) in a chat: write up in the background; failures are kept for the 记忆 page. */
  function after(threadId) { if (options().enabled) tidy(threadId).catch(() => {}); }

  /** Vectors of the pieces and of the query, when a 向量模型 is set up; null otherwise (or when it fails: local only). */
  async function vectors(threadId, pieces, query) {
    if (!backend.embedReady()) return null;
    try {
      const model = settings().embed.model + '@' + settings().embed.url;
      const saved = await backend.memoryVectors(threadId), items = saved?.model === model ? {...saved.items} : {};
      const missing = [...new Set(pieces.map(p => textKey(p.text)))].filter(key => !items[key]), texts = new Map(pieces.map(p => [textKey(p.text), p.text]));
      if (missing.length) {
        const made = await backend.embed(missing.map(key => texts.get(key)));
        missing.forEach((key, i) => { items[key] = made[i]; });
        // Only the pieces there still are.
        const keep = new Set(pieces.map(p => textKey(p.text)));
        for (const key of Object.keys(items)) if (!keep.has(key)) delete items[key];
        await backend.memorySaveVectors(threadId, {model, items});
      }
      const [q] = await backend.embed([query]);
      return new Map([...Object.entries(items), ['query', q]]);
    } catch (error) {
      note(threadId, {vectorError: error.message});
      return null;
    }
  }
  /** 片段向量（生活记忆/正文记忆用）：和聊天记忆同一套 backend.embed + memoryVectors 缓存，key 用 bookId。 */
  async function vectorsFor(key, pieces, query) {
    if (!backend.embedReady() || !pieces.length || !String(query || '').trim()) return null;
    try {
      const model = settings().embed.model + '@' + settings().embed.url;
      const saved = await backend.memoryVectors(key), items = saved?.model === model ? {...saved.items} : {};
      const missing = [...new Set(pieces.map(p => textKey(p.text)))].filter(k => !items[k]);
      const texts = new Map(pieces.map(p => [textKey(p.text), p.text]));
      if (missing.length) {
        const made = await backend.embed(missing.map(k => texts.get(k)));
        missing.forEach((k, i) => { items[k] = made[i]; });
        const keep = new Set(pieces.map(p => textKey(p.text)));
        for (const k of Object.keys(items)) if (!keep.has(k)) delete items[k];
        await backend.memorySaveVectors(key, {model, items});
      }
      const [q] = await backend.embed([query]);
      return new Map([...Object.entries(items), ['query', q]]);
    } catch { return null; }
  }

  /**
   * What a chat remembers, for a request: the written-up layers and, when `query` (the latest messages) is given, the
   * older messages that match it. thread: the chat (with messages). Returns {text, used} — '' when memory is off.
   */
  async function contextFor(thread, {query = '', cap, recallCount, record = true} = {}) {
    const o = options();
    if (!o.enabled || !thread) return {text: '', used: null};
    const name = who(thread), book = await backend.memoryBook(thread.id);
    const kept = memoryText(book, {who: thread.type === 'group' ? `群聊「${name}」` : `和${name}`, ...(cap ? {cap} : {})});
    let found = [];
    const limit = recallCount ?? o.recall;
    if (limit && String(query).trim()) {
      const pieces = chunks(thread, {window: windowSize(), user: userName()});
      if (pieces.length) found = recall(pieces, query, {limit, vectors: await vectors(thread.id, pieces, query)});
    }
    const text = [kept, recallText(found, {who: thread.type === 'group' ? '群里' : `和${name}`})].filter(Boolean).join('\n\n');
    const used = {at: Date.now(), nodes: roots(book).length, recalled: found.map(p => ({from: p.from, to: p.to, score: p.score, text: p.text.slice(0, 300)})), vector: found.some(p => p.semantic !== null)};
    if (record) note(thread.id, {used});
    return {text, used};
  }
  /** The private chat with someone (their memory is what 查手机 and 朋友圈 can draw on). */
  async function privateChat(name) {
    const thread = currentDm(await backend.threads(), name);
    return thread ? backend.chats.get(thread.id) : null;
  }
  /** The memory of private chats with these people, for 查手机 and 朋友圈 (written-up layers only, kept short). */
  async function aboutPeople(names, {cap = 2500} = {}) {
    if (!options().enabled) return '';
    const parts = [];
    for (const name of names) {
      const thread = await privateChat(name);
      if (!thread) continue;
      const {text} = await contextFor(thread, {cap: Math.max(600, Math.floor(cap / Math.max(1, names.length))), recallCount: 0, record: false});
      if (text) parts.push(text);
    }
    return parts.join('\n\n');
  }

  // 正文: the phone chats with the people of the open card (their memory and the last messages), ready before inject()
  // asks, since the story's prompt is put together without waiting.
  function refreshStory(delay = 300) {
    clearTimeout(storyTimer);
    storyFor = cardKey();
    // Only the latest run writes: an older one still reading (for the card open before) would put back its answer.
    const run = ++storyRun, put = text => { if (run === storyRun) storyText = text; };
    let finish;
    storyDone = new Promise(resolve => { finish = resolve; });
    storyTimer = setTimeout(async () => {
      try {
        const o = options(), ctx = context();
        if (!ctx) { put(''); return; }
        if (o.story) await moveOldSwitch(ctx);
        // 正文摘要：先拿现成的，再后台把新正文补进摘要。
        if (o.story) { storyCtx = await storyContext().catch(() => '') || ''; tidyStory().catch(() => {}); }
        // 一直带着: the chats (of the card open now) the user marked, each with its written-up memory and every message
        // not written up yet, so nothing in between is missed; too many of those: the newest, and a write-up now.
        // Only the chats of the card open now: made in it, or with one of its characters.
        const key = backend.cardKey?.() || '', names = cardNames(ctx);
        const marked = (await backend.threads()).filter(t => t.story && ((key && t.space === key) || t.members.some(n => names.has(n))));
        const parts = [], user = userName(), budget = Math.max(1200, Math.floor(6000 / Math.max(1, marked.length)));
        for (const row of marked) {
          const thread = await backend.chats.get(row.id);
          if (!thread) continue;
          const name = who(thread), group = thread.type === 'group';
          const {text} = await contextFor(thread, {cap: budget, recallCount: 0, record: false});
          const fresh = unwritten(thread, o.enabled ? await backend.memoryBook(thread.id) : null).filter(m => m.kind !== 'system');
          const kept = [];
          for (let i = fresh.length - 1, size = 0; i >= 0; i--) {
            const line = transcript([fresh[i]], user);
            if (kept.length && size + line.length > budget) break;
            kept.unshift(fresh[i]); size += line.length;
          }
          if (o.enabled && kept.length < fresh.length) tidy(thread.id, {force: true}).catch(() => {});
          const recent = kept.length ? `【${user}和${group ? `群聊「${name}」` : name}在手机上${text ? '后来' : ''}的聊天${kept.length < fresh.length ? `（最近 ${kept.length} 条）` : ''}】\n${transcript(kept, user)}` : '';
          if (text || recent) parts.push([text, recent].filter(Boolean).join('\n'));
        }
        put(parts.length ? `【小手机】（${user}和角色们在手机上聊过的事，角色都记得；剧情里自然提起就好，不用复述）\n${parts.join('\n\n')}` : '');
        if (run === storyRun) storyError = '';
      } catch (error) { put(''); if (run === storyRun) storyError = error.message; }
      finish();
    }, delay);
  }
  /** The characters of the card open now (the character, or the group's members). */
  function cardNames(ctx) {
    const names = new Set([ctx.name2].filter(Boolean));
    if (ctx.groupId) for (const member of ctx.groups?.find(g => g.id === ctx.groupId)?.members || []) { const n = ctx.characters?.find(c => c.avatar === member)?.name; if (n) names.add(n); }
    return names;
  }
  /**
   * Before 0.7.52 one switch (预设 → 聊天 → 记忆「正文也带上」) brought the open card's private chats; now each chat
   * has its own (带进剧情 → 一直带着). Those chats are marked once and the old switch is put off.
   */
  async function moveOldSwitch(ctx) {
    for (const name of cardNames(ctx)) {
      const thread = await privateChat(name);
      if (thread && !thread.story) await backend.chatMutate(thread.id, () => backend.chats.update(thread.id, {story: true})).catch(() => {});
    }
    const preset = activeChatPreset(settings().chat);
    try { backend.saveChatPreset({...preset, memory: {...preset.memory, story: false}}); } catch { /* tried again next time */ }
  }
  /** Waits (a little) for the story memory being worked out, so a story request right after changing cards has it. */
  function storyReady(limit = 1500) {
    // Worked out for another card (the card changed and the tavern has not said so yet): again, now.
    if (storyFor !== cardKey()) refreshStory(0);
    return Promise.race([storyDone, new Promise(r => setTimeout(r, limit))]);
  }
  /** Prompt entries for inject(): the phone memory for the story, placed like 带进剧情. */
  function storyPlan() {
    if (!storyText) return [];
    const i = activeChatPreset(settings().chat).injection, inChat = i.position === 'in_chat';
    return [{key: 'sttts.entry.memory', text: storyText, position: {in_chat: 1, in_prompt: 0, before_prompt: 2}[i.position], depth: inChat ? i.depth : 0, role: inChat ? {system: 0, user: 1, assistant: 2}[i.role] : 0}];
  }
  // The phone's chats change: worked out again (the tavern side calls refreshStory once the phone's data is open, and
  // when the open card or the settings change).
  const unsubscribe = backend.subscribe?.(event => { if (event.type === 'chat' && !event.typing || event.type === 'memory' && event.reset) refreshStory(); });

  // ---------- 正文记忆：小手机自己把正文做成分层摘要，更早的剧情不丢（不依赖记忆插件） ----------
  // 正文记忆：整张卡一本（空间 key），所有角色共享，不按角色分。
  const storyBookId = () => 'story:' + (backend.spaceKey?.() || cardKey());
  /** 正文里能读的消息（跳过系统消息），清理掉数据块，每条 {name, text}。 */
  function storyEntries() {
    const user = userName();
    return (context()?.chat || []).filter(m => m && !m.is_system && String(m.mes ?? '').trim())
      .map(m => ({name: m.name || (m.is_user ? user : '旁白'), text: plainStory(m.mes)}))
      .filter(e => e.text);
  }
  /** 把还没摘要的正文分批写成 level-0 摘要，再分层合并；最近 keep 条保留原文。 */
  function tidyStory({force = false} = {}) {
    if (storyBusy) return storyBusy;
    const job = (async () => {
      const o = options();
      if (!o.enabled) return 0;
      const entries = storyEntries();
      const keep = Math.max(2, activeChatPreset(settings().chat).context || 2), batch = 20;
      let written = 0;
      // 分批把积压的正文写进摘要：只要超出保留窗口就整理（一条也行），单批最多 20 条。
      for (let step = 0; step < (force ? 8 : 4); step++) {
        const book = await backend.memoryBook(storyBookId());
        const done = Number(book.throughAt) || 0;
        const available = Math.max(0, entries.length - keep);
        if (available <= done) break;
        const slice = entries.slice(done, Math.min(available, done + batch));
        const lines = slice.map(e => `${e.name}：${e.text}`);
        if (!lines.length) break;
        const summary = parseMemory(await backend.generateText(context(), {use: 'memory', prompt: [
          {role: 'system', content: STORY_SUMMARY_PROMPT},
          {role: 'user', content: `正文：\n${lines.join('\n')}`},
        ], trimNames: false}));
        await backend.memoryChange(storyBookId(), cur => {
          const next = addNode(cur, {level: 0, text: summary, from: Date.now(), to: Date.now(), count: slice.length});
          next.throughAt = done + slice.length;
          return next;
        }, 'story', book);
        written++;
      }
      for (let step = 0; step < 2; step++) {
        const current = await backend.memoryBook(storyBookId());
        const merge = nextMerge(current, {stage: 3, epic: 4});
        if (!merge) break;
        const mtext = parseMemory(await backend.generateText(context(), {use: 'memory', prompt: [
          {role: 'system', content: `你在整理正文剧情：把下面几段按时间排好的${levelName(merge.level - 1)}合成一份「${levelName(merge.level)}」。先按时间说清主线和转折，再写关系的变化、承诺、没解决的事；前后矛盾以后面的为准。只根据下面内容写，不编造。直接写正文，不要标题。`},
          {role: 'user', content: merge.nodes.map(n => `【${levelName(n.level)} · ${span(n.from, n.to)}】\n${n.text}`).join('\n\n')},
        ], trimNames: false}));
        await backend.memoryChange(storyBookId(), cur => addNode(cur, {level: merge.level, text: mtext, covers: merge.nodes.map(n => n.id)}), 'story', current);
        written++;
      }
      return written;
    })().finally(() => { storyBusy = null; });
    storyBusy = job;
    return job;
  }
  /** 正文摘要文本，放进「更早的剧情」。query（默认最近正文）：向量/关键词召回相关的更早正文。 */
  async function storyContext(cap = 3000, query = '') {
    if (!options().enabled) return '';
    const book = await backend.memoryBook(storyBookId());
    const kept = memoryText(book, {who: '剧情', cap});
    let found = [];
    const entries = storyEntries();
    const q = String(query || '').trim() || entries.slice(-4).map(e => e.text).join('\n');
    if (q) {
      const pieces = chunkTexts(entries);
      if (pieces.length) found = recall(pieces, q, {limit: 2, vectors: await vectorsFor(storyBookId(), pieces, q)});
    }
    return [kept, recallText(found, {who: '剧情'})].filter(Boolean).join('\n\n');
  }

  /** 更早的剧情: 小手机自己的正文摘要优先，没有再读记忆插件放进 extension prompt 的。 */
  function storyMemory() { return storyCtx || storyMemoryText(context()?.extensionPrompts, options().storyKeys); }
  /** Every extension prompt there is now (not the phone's own), for picking which hold story memory. */
  function storySources() {
    const prompts = context()?.extensionPrompts || {}, picked = new Set(options().storyKeys);
    const found = Object.entries(prompts).filter(([key, p]) => !key.startsWith('sttts.') && typeof p?.value === 'string' && p.value.trim())
      .map(([key, p]) => ({key, name: STORY_MEMORY[key] || '', chars: p.value.trim().length, preview: p.value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 90), picked: picked.has(key)}));
    // Picked keys that have nothing in them right now are listed too, so they can be unpicked.
    for (const key of picked) if (!found.some(x => x.key === key)) found.push({key, name: STORY_MEMORY[key] || '', chars: 0, preview: '', picked: true});
    return found;
  }

  // ---------- 生活记忆：朋友圈动态 + 论坛发言 + 查手机快照，压缩成摘要存进 life book（threadId = 'life:名字'） ----------
  const lifeBook = name => 'life:' + name;
  /** 拉一个角色的生活条目（朋友圈/查手机/论坛），每条 {text, at}。 */
  async function lifeItems(name) {
    const items = [];
    try {
      const here = backend.here?.();
      const moments = (await backend.moments.list()).filter(p => p.author === name && p.text && (!here || inSpace(p, here)));
      for (const p of moments.slice(-20)) items.push({text: `朋友圈：${p.text}`, at: p.at || 0});
    } catch {}
    try {
      const peek = (await backend.apps.list('peek')).find(p => p.name === name);
      if (peek) {
        const at = peek.at || 0;
        for (const n of peek.notes || []) items.push({text: `备忘录：${n.title ? n.title + '：' : ''}${n.text}`, at});
        for (const x of peek.photos || []) items.push({text: `相册：${x.text}${x.tags ? '（' + x.tags + '）' : ''}`, at});
        if (peek.cart?.length) items.push({text: `购物车：${peek.cart.map(c => `${c.name}${c.note ? '（' + c.note + '）' : ''}`).join('、')}`, at});
        if (peek.searches?.length) items.push({text: `搜过：${peek.searches.join('、')}`, at});
        if (peek.calls?.length) items.push({text: `通话记录：${peek.calls.map(c => `${c.with}（${c.dir === 'missed' ? '未接' : c.dir === 'out' ? '打出去' : '打进来'}${c.long ? ' ' + c.long : ''}）`).join('、')}`, at});
        if (peek.events?.length) items.push({text: `日历：${peek.events.map(e => `${e.when || ''}${e.what}`).join('、')}`, at});
        if (peek.songs?.length) items.push({text: `听歌：${peek.songs.map(s => `${s.title}${s.artist ? ' - ' + s.artist : ''}`).join('、')}`, at});
        if (peek.wallpaper?.text) items.push({text: `壁纸：${peek.wallpaper.text}`, at});
        for (const c of peek.chats || []) items.push({text: `和别人聊（${c.with}）：${c.lines.slice(-2).map(l => `${l.from}：${l.text}`).join('；')}`, at});
      }
    } catch {}
    try {
      const here = backend.here?.();
      const forum = (await backend.apps.list('forum')).filter(p => !here || inSpace(p, here));
      for (const p of forum) {
        if (p.author === name) items.push({text: `论坛发帖「${p.title || '（无标题）'}」：${p.text}`, at: p.at || 0});
        for (const r of (p.replies || [])) if (r.from === name) items.push({text: `论坛回复「${p.title || '（无标题）'}」：${r.text}`, at: r.at || p.at || 0});
      }
    } catch {}
    return items;
  }
  /** 拉取一个角色的全部生活内容（朋友圈、论坛发言、查手机快照），拼成待压缩的文本。 */
  async function lifeSource(name) {
    return (await lifeItems(name)).map(i => `- ${i.text}`).join('\n');
  }
  async function tidyLife(name) {
    if (!options().enabled) return 0;
    const text = await lifeSource(name);
    if (!text) return 0;
    const book = await backend.memoryBook(lifeBook(name));
    // 1. 新的 level 0 生活摘要（累积，不覆盖旧摘要）
    const prompt0 = [
      {role: 'system', content: `你在把${name}的生活记录整理成一段生活摘要（200 到 350 字），以后能直接拿来接着聊。只根据下面给的记录写，没提到的内容一律不补、不编造。写主线和关键：TA 最近在忙什么、心情和处境、和谁关系有变化、许过什么承诺、有什么没解决的事。具体细节（相册里每张照片、购物车每件货、每条搜索）不用逐条列，一两句带过就好，翻旧账时按原文查。直接写正文，不要标题。`},
      {role: 'user', content: `生活记录：\n${text.slice(0, 6000)}`},
    ];
    const summary = parseMemory(await backend.generateText(context(), {use: 'memory', prompt: prompt0, trimNames: false}));
    await backend.memoryChange(lifeBook(name), current => addNode(current, {level: 0, text: summary, from: Date.now(), to: Date.now(), count: 1}), name, book);
    let written = 1;
    // 2. 攒够了就向上合并（3 条 level 0 → 1 条 level 1，更高层 4 条 → 下一层），和聊天记忆同一套逻辑。
    for (let step = 0; step < 2 && !closed; step++) {
      const current = await backend.memoryBook(lifeBook(name));
      const merge = nextMerge(current, {stage: 3, epic: 4});
      if (!merge) break;
      const mprompt = [
        {role: 'system', content: `你在整理${name}的生活记忆：把下面几段按时间排好的${levelName(merge.level - 1)}合成一份「${levelName(merge.level)}」（${merge.level === 1 ? '300 到 500 字' : '400 到 700 字'}）。先按时间说清这段时间里的主线、转折和关系变化，再写：TA 的近况、喜好、习惯、没解决的事。细节不用逐条堆，抓主干和关键点；具体细节按原文召回。前后矛盾时以后面的为准。只根据下面的内容写，不编造。直接写正文，不要标题。`},
        {role: 'user', content: merge.nodes.map(n => `【${levelName(n.level)} · ${span(n.from, n.to)}】\n${n.text}`).join('\n\n')},
      ];
      const mtext = parseMemory(await backend.generateText(context(), {use: 'memory', prompt: mprompt, trimNames: false}));
      await backend.memoryChange(lifeBook(name), cur => addNode(cur, {level: merge.level, text: mtext, covers: merge.nodes.map(n => n.id)}), name, current);
      written++;
    }
    return written;
  }
  async function lifeContext(name, {cap = 1000, query = ''} = {}) {
    const book = await backend.memoryBook(lifeBook(name));
    const list = roots(book);
    let kept = '';
    if (list.length) {
      const keep = new Set();
      let used = 0;
      for (const n of list.slice().sort((a, b) => b.level - a.level || a.from - b.from)) {
        const cost = n.text.length + 30;
        if (used + cost > cap && keep.size) continue;
        keep.add(n.id); used += cost;
      }
      kept = `【${name}的生活】（朋友圈、论坛和手机里的事，按时间整理成的）\n` + list.filter(n => keep.has(n.id)).map(n => `- ${levelName(n.level)}（${span(n.from, n.to)}）：${n.text}`).join('\n');
    }
    let found = [];
    if (String(query || '').trim()) {
      const pieces = chunkTexts(await lifeItems(name));
      if (pieces.length) found = recall(pieces, query, {limit: 2, vectors: await vectorsFor(lifeBook(name), pieces, query)});
    }
    return [kept, recallText(found, {who: name})].filter(Boolean).join('\n\n');
  }
  return {
    storyMemory, storySources, storyContext, tidyStory,
    tidy, after, contextFor, aboutPeople, storyPlan, storyReady, refreshStory, tidyLife, lifeContext,
    status: threadId => ({...status.get(threadId), busy: busy.has(threadId), ...(storyError ? {storyError} : {})}),
    close() { closed = true; clearTimeout(storyTimer); unsubscribe?.(); }
  };
}
