// 论坛 and 查手机, tavern side. Like 朋友圈, they are generated apart from the story with the tavern's connected model (or
// the phone's own text model) and nothing is written into the story. One model request per app at a time.
import {currentDm} from './core/chats.js';
import {buildForumRequest, parseForum, postLines} from './core/forum.js';
import {buildPeekRequest, parsePeek, peekId, mergePeek} from './core/peek.js';
import {storyLines, pickCrowd, activityNames} from './core/moments.js';
import {inSpace, activeChatPreset, cleanTagged} from './core/chat.js';
import {worldInfoFor, loreOptions} from './host-lore.js';
import {pictureInputs, sizeFor, photoPicture} from './core/draw.js';
import {HUNT_PROMPT, SHOW_PROMPT, parseHunt, parseShow, parseHuntYaml, huntToTarget, huntToTargetYaml, huntToFeed, huntToFeedYaml, stageOf} from './core/root.js';

const PEOPLE = 12;

export function createAppsHost({context, settings, backend, memory = null}) {
  const busy = {forum: null, peek: null};
  const userName = () => context()?.name1 || '我';
  const userPersona = () => String(context()?.powerUserSettings?.persona_description || '').slice(0, 1500);
  function card(name) {
    const c = context()?.characters?.find(ch => ch?.name === name);
    if (!c) return '';
    return [c.description, c.personality && '性格：' + c.personality].filter(Boolean).join('\n')
      .replaceAll('{{char}}', name).replaceAll('{{user}}', userName()).slice(0, 1500);
  }
  /** Everyone who can post here; a forum request names at most PEOPLE of them (pick). */
  const people = () => backend.crowd().map(c => ({name: c.name, persona: c.persona, card: c.persona ? '' : card(c.name)}));
  /** The forum's posts here, newest first. */
  const feed = async () => (await backend.apps.list('forum')).filter(p => inSpace(p, backend.here()));
  /** Who this request names: everyone when they fit, else a turn of them (core/moments.js pickCrowd). */
  const pick = (everyone, story, posts, must = []) => pickCrowd(everyone, {limit: PEOPLE, must: must.filter(n => n && n !== 'me'), story, active: activityNames(posts.slice(0, 40))});
  const lore = (preset, crowd, story, texts) => preset.lore === false ? Promise.resolve('') : worldInfoFor(context, {...loreOptions(preset), report: (...args) => backend.reportDiagnostic?.(...args), persona: userPersona(), characters: crowd.map(p => p.persona || p.card).join('\n'),
    texts: [...story.map(r => `${r.name}: ${r.text}`), ...texts], always: [crowd.map(p => p.name).join('、')]});
  async function ask(ctx, prompt, preset, use) {
    return cleanTagged(String(await backend.generateText(ctx, {prompt, trimNames: false, use}) || ''), preset.cleanTags);
  }
  /** One request per app at a time; the phone shows it as busy. */
  function run(app, task) {
    if (busy[app]) return busy[app];
    busy[app] = (async () => { backend.emit(app, {busy: true}); return task(context()); })().finally(() => { busy[app] = null; backend.emit(app, {busy: false}); });
    return busy[app];
  }
  const base = () => {
    const s = settings(), preset = activeChatPreset(s.chat);
    return {s, preset, everyone: people(), user: userName()};
  };

  // ---------- 论坛 ----------
  /** 网名 on the forum: {me: the user's, name: a character's}. */
  const netNames = () => ({...(settings().chat?.netNames || {})});
  /** Screen names the model made up for characters who had none: kept, so they stay the same. */
  async function keepNames(names, crowd) {
    const have = netNames(), fresh = Object.fromEntries(Object.entries(names || {}).filter(([name]) => name !== 'me' && !have[name] && crowd.some(c => c.name === name)));
    if (Object.keys(fresh).length) try { backend.saveChatOptions({netNames: fresh}); } catch { /* made up again next time */ }
  }
  /** New posts and the 热搜. */
  function forumRefresh() {
    return run('forum', async ctx => {
      // The card asked for: the tavern may move to another one while the model writes.
      const space = backend.cardKey(), save = backend.saveKey(), hotId = backend.hotId(), {preset, everyone, user} = base(), handles = netNames();
      const posts = await feed(), recent = posts.slice(0, 8), hot = (await backend.apps.get(hotId))?.topics || [];
      const story = storyLines(ctx.chat, preset, user), crowd = pick(everyone, story, posts);
      const prompt = buildForumRequest({prompts: settings().promptRules, preset, handles, earlier: memory?.storyMemory() || '', mode: 'posts', people: crowd, story, user, userPersona: userPersona(), recent, hot, lore: await lore(preset, crowd, story, [...hot, ...recent.map(p => p.title)]), images: settings().moments.images !== false});
      const found = parseForum(await ask(ctx, prompt, preset, 'forum'), {user, mode: 'posts', handles});
      await keepNames(found.names, crowd);
      if (!found.posts.length) throw Error('这次没有刷出新帖子，可以再刷新一次');
      if (found.hot.length) await backend.setForumHot(found.hot, hotId);
      const added = await backend.addForumPosts(found.posts, {space, save});
      forumDrawNew(added);
      // 生活记忆：论坛刷新后，只把已有角色的发帖压缩进生活摘要（路人不是角色，跳过，别浪费 token）。
      try { for (const author of new Set(added.map(p => p.author))) if (author && author !== 'me' && everyone.some(c => c.name === author)) memory?.tidyLife?.(author).catch(() => {}); } catch {}
      return added;
    });
  }
  /** Replies to the user's new post. */
  function forumReact(postId) {
    return run('forum', async ctx => {
      const {preset, everyone, user} = base(), handles = netNames();
      const post = await backend.apps.get(postId);
      if (!post) throw Error('这个帖子已经不在了');
      const story = storyLines(ctx.chat, preset, user), crowd = pick(everyone, story, await feed());
      const prompt = buildForumRequest({prompts: settings().promptRules, preset, handles, earlier: memory?.storyMemory() || '', mode: 'react', people: crowd, story, user, userPersona: userPersona(), post, lore: await lore(preset, crowd, story, [postLines(post, user)])});
      const found = parseForum(await ask(ctx, prompt, preset, 'forum'), {user, mode: 'react', handles});
      await keepNames(found.names, crowd);
      if (!found.replies.length) throw Error('这次没有人回复，可以再试一次');
      const added = await backend.addForumReplies(postId, found.replies);
      try { for (const from of new Set(found.replies.map(r => r.from))) if (from && from !== 'me' && everyone.some(c => c.name === from)) memory?.tidyLife?.(from).catch(() => {}); } catch {}
      return added;
    });
  }
  /** Answers to the user's reply. */
  function forumReply(postId, replyId) {
    return run('forum', async ctx => {
      const {preset, everyone, user} = base(), handles = netNames();
      const post = await backend.apps.get(postId), mine = post?.replies.find(r => r.id === replyId);
      if (!post || !mine) throw Error('这条回复已经不在了');
      // The post's author, whom the reply answers and who already spoke under it are in the answer's list.
      const story = storyLines(ctx.chat, preset, user), crowd = pick(everyone, story, await feed(), [post.author, mine.to, ...post.replies.map(r => r.from)]);
      // Keep the topic in one scan unit: even a shallow scan needs the original question and recent discussion.
      const discussion = postLines(post, user) + `\n本次回复${mine.to ? '（回复 ' + mine.to + '）' : ''}：${mine.text}`;
      const prompt = buildForumRequest({prompts: settings().promptRules, preset, handles, earlier: memory?.storyMemory() || '', mode: 'reply', people: crowd, story, user, userPersona: userPersona(), post, reply: mine, lore: await lore(preset, crowd, story, [discussion])});
      const found = parseForum(await ask(ctx, prompt, preset, 'forum'), {user, mode: 'reply', handles});
      await keepNames(found.names, crowd);
      if (!found.replies.length) throw Error('这次没有人接话，可以再试一次');
      const added = await backend.addForumReplies(postId, found.replies);
      try { for (const from of new Set(found.replies.map(r => r.from))) if (from && from !== 'me' && everyone.some(c => c.name === from)) memory?.tidyLife?.(from).catch(() => {}); } catch {}
      return added;
    });
  }

  // ---------- 查手机 ----------
  /** Looks into a character's phone: a new snapshot, or (keep) what is new since last time put onto the old one. */
  function peekLook(name, {keep = false} = {}) {
    return run('peek', async ctx => {
      const key = backend.spaceKey(), {preset, user} = base(), contact = backend.contacts().find(c => c.name === name);
      if (!contact) throw Error(`联系人里没有「${name}」`);
      const person = {name, persona: contact.persona, card: contact.persona ? '' : card(name)};
      const thread = currentDm(await backend.threads(), name);
      const history = thread ? (await backend.chats.get(thread.id)).messages.filter(m => m.kind !== 'system').slice(-20) : [];
      const story = storyLines(ctx.chat, preset, user);
      const remembered = memory ? await memory.aboutPeople([name]).catch(() => '') : '';
      const before = keep ? (await backend.apps.get(peekId(name, key))) || (key ? await backend.apps.get(peekId(name)) : null) : null;
      const prompt = buildPeekRequest({prompts: settings().promptRules, preset, before, earlier: memory?.storyMemory() || '', person, story, user, userPersona: userPersona(), history, memory: remembered, images: !!backend.drawReady(), lore: await lore(preset, [person], story, history.map(m => m.text || ''))});
      const found = parsePeek(await ask(ctx, prompt, preset, 'peek'), {name, user});
      const snap = mergePeek(before, found);
      const saved = await backend.savePeek({name, ...snap}, key);
      // 生活记忆：查手机后压缩成摘要，角色之后聊天时记得自己的生活。
      memory?.tidyLife?.(name).catch(() => {});
      return saved;
    });
  }

  /** Draws one photo of a character's album (index 'wallpaper': their wallpaper, upright). Without allowPaid, only when
   *  the free tier covers it. */
  async function peekDraw(name, index, {allowPaid = false, tags = ''} = {}) {
    // The open card's snapshot of this person, else the shared one from before 分区.
    const key = backend.spaceKey(), snap = (await backend.apps.get(peekId(name, key))) || (key ? await backend.apps.get(peekId(name)) : null), id = snap?.id;
    const wall = index === 'wallpaper', pick = doc => wall ? doc.wallpaper : doc.photos?.[index], photo = snap && pick(snap);
    if (!photo) throw Error(wall ? '没有壁纸，「再看一次」后就有了' : '这张照片已经不在了');
    if (String(tags).trim() && !photo.tags) throw Error((wall ? '壁纸' : '这张照片') + '没有画图用的描述，「再看一次」后就有了');
    if (!photo.tags && !String(tags).trim()) throw Error((wall ? '壁纸' : '这张照片') + '没有画图用的描述，「再看一次」后就有了');
    if (!backend.drawReady()) throw Error(backend.drawMissing() + '，相册只能看文字');
    const set = patch => backend.appsMutate('peek', () => backend.apps.change(id, doc => { const target = pick(doc); Object.assign(target, patch); for (const k of Object.keys(patch)) if (patch[k] === '') delete target[k]; }));
    // 改提示词再画: the tags they wrote replace the saved ones, and the next draw uses them.
    const clean = String(tags).trim();
    if (clean) { await set({tags: clean.slice(0, 600)}); photo.tags = clean.slice(0, 600); }
    // The saved looks of who the photo shows: the people its description names, else the owner (a selfie).
    const names = [...settings().routes.map(r => r.name), userName()], picture = photoPicture(settings(), {text: photo.text, tags: photo.tags, owner: name, names});
    try {
      await set({state: 'waiting', note: ''});
      const input = pictureInputs(settings(), picture, '');
      // A wallpaper stands upright like the phone (a square size becomes 832×1216 for 1024: about as many pixels, so the
      // free tier still holds).
      if (wall) { const up = sizeFor(input.params, '竖'), side = up.width, snap64 = n => Math.max(64, Math.round(n / 64) * 64); input.params = {...input.params, ...(up.width === up.height ? {width: snap64(side * .8125), height: snap64(side * 1.1875)} : up)}; }
      const result = await backend.generateImage({...input, allowPaid, name: `查手机-${name}`, key: `peek:${name}:${index}`, label: `查手机 · ${name}${wall ? ' · 壁纸' : ''}`});
      // 画过的版本都留着（和论坛、朋友圈一样）：点开大图可以左右滑，切了哪版就是哪版。
      const versions = [...new Set([...(photo.versions || []), ...(photo.photoId ? [photo.photoId] : []), result.photoId])].slice(-10);
      await set({photoId: result.photoId, versions, state: 'done', note: ''});
      return result.photoId;
    } catch (error) {
      await set({state: 'failed', note: error.code === 'PAID' ? backend.paidPrompt().note : error.message.slice(0, 200)});
      throw error;
    }
  }

  /** 查手机的相册：换这一张显示哪一版。index is the photo's place, or 'wallpaper'. */
  async function peekPickImage(name, index, photoId) {
    const key = backend.spaceKey(), snap = (await backend.apps.get(peekId(name, key))) || (key ? await backend.apps.get(peekId(name)) : null);
    if (!snap?.id) throw Error('这个手机已经不在了，「再看一次」后才有');
    if (!photoId) throw Error('不知道该换成哪一版');
    return backend.appsMutate('peek', () => backend.apps.change(snap.id, doc => {
      const target = index === 'wallpaper' ? doc.wallpaper : doc.photos?.[index];
      if (target) target.photoId = photoId;
    }));
  }

  // ---------- 论坛配图（和朋友圈一样） ----------
  function forumDrawNew(posts) {
    if (settings().moments.images) for (const post of posts || []) if (post.imageTags && !post.photoId) forumDrawImage(post.id).catch(() => {});
  }
  /** Draws a post's picture. Without allowPaid, only when the free tier covers it. */
  async function forumDrawImage(postId, {allowPaid = false, tags = ''} = {}) {
    const set = patch => backend.appsMutate('forum', () => backend.apps.change(postId, post => Object.assign(post, patch)));
    if (String(tags).trim()) await set({imageTags: String(tags).trim()});
    const post = await backend.apps.get(postId);
    if (!post?.imageTags) throw Error('这条帖子没有配图描述');
    if (!backend.drawReady()) { await set({imageState: 'failed', imageNote: backend.drawMissing()}); return null; }
    try {
      const names = [...settings().routes.map(r => r.name), userName()];
      const input = pictureInputs(settings(), photoPicture(settings(), {text: post.text, tags: post.imageTags, owner: post.author, names}), '');
      await set({imageState: 'waiting', imageNote: ''});
      const result = await backend.generateImage({...input, allowPaid, name: `论坛-${post.author}`, key: `forum:${postId}`, label: `论坛 · ${post.author}`});
      const now = await backend.apps.get(postId);
      await set({photoId: result.photoId, imageVersions: [...(now?.imageVersions || []), now?.photoId, result.photoId].filter(Boolean), imageState: 'done', imageNote: ''});
      return result.photoId;
    } catch (error) {
      await set({imageState: 'failed', imageNote: error.code === 'PAID' ? backend.paidPrompt().note : error.message});
      throw error;
    }
  }

  // ---------- 根源重塑 ----------
  /** 猎场刷新 / 搜索。刷新：覆盖旧帖子；搜索：只生成 1 条，放列表最前。 */
  function rootHunt(query = '') {
    return run('root', async ctx => {
      const {preset} = base();
      const state = await backend.rootState();
      const me = userName();
      const existing = Object.values(state.猎物库 || {}).map(t => t.基础档案?.姓名).filter(Boolean);
      const level = Math.min(5, Math.max(1, Number(state.用户?.等级) || 1));
      const RATINGS = ['原矿', '粗坯', '精雕', '宝玉', '神物'];
      const cap = RATINGS[level - 1];
      const askText = query
        ? `搜索「${query}」：只生成 1 条帖子，就是这个搜索词对应的那一个人（搜名字就生成这个名字的人；搜标签就生成一个符合这个标签的人）。禁止生成多个，禁止生成不相干的人。当前猎物库已有：${existing.join('、') || '（空）'}。用户当前等级是 ${level}，猎物评级绝对不能超过「${cap}」。`
        : `当前猎物库已有：${existing.join('、') || '（空）'}。生成新帖子，猎物不要和已有的重名。用户当前等级是 ${level}，猎物评级绝对不能超过「${cap}」。用户叫「${me}」，绝对不要生成用户已经收下的便器。`;
      const prompt = [
        {role: 'system', content: HUNT_PROMPT},
        {role: 'user', content: askText},
      ];
      const reply = await ask(ctx, prompt, preset, 'root');
      const {targets: tList, hunts: hList} = parseHuntYaml(reply);
      if (!tList.length) throw Error('这次没有刷出新帖子，可以再试一次');
      const useTargets = query ? tList.slice(0, 1) : tList;
      const useIds = new Set(useTargets.map(t => t.id));
      const 猎物库 = { ...state.猎物库 };
      const fresh = [];
      const now = Date.now();
      const idMap = {};
      for (const t of useTargets) {
        const name = String(t.档案['姓名'] || '').trim();
        if (!name || existing.includes(name)) continue;
        const id = crypto.randomUUID();
        idMap[t.id] = id;
        const target = huntToTargetYaml(t);
        const ri = RATINGS.indexOf(target.基础档案.评级);
        if (ri > level - 1) target.基础档案.评级 = cap;
        猎物库[id] = target;
      }
      for (const h of hList) {
        const ref = String(h.帖子['归属便器ID'] || '').trim().replace(/^T(\d+)$/, (_, n) => 'T' + n);
        const tid = idMap[ref || useTargets[0]?.id];
        if (!tid) continue;
        fresh.push(huntToFeedYaml(h, tid, now));
      }
      if (!fresh.length) throw Error('帖子没有对上档案，可以再试一次');
      const 猎场流 = query ? [...fresh, ...(state.猎场流 || [])] : fresh;
      await backend.saveRoot({ 猎物库, 猎场流 });
      rootDrawNew(fresh);
      return fresh.length;
    });
  }
  /** 便器广场刷新 / 搜索。刷新：覆盖旧帖子；搜索：只生成 1 条，放列表最前。 */
  function rootShowcase(query = '') {
    return run('root', async ctx => {
      const {preset} = base();
      const state = await backend.rootState();
      const me = userName();
      // 广场的便器必须是「有主」的（当前配种者不是「无」，也不是用户自己）——猎场那些无主求治者不算。
      const 有主 = Object.values(state.猎物库 || {})
        .filter(t => {
          const owner = String(t.配种信息?.当前配种者 || '').trim();
          return t.基础档案?.姓名 && owner && owner !== '无' && owner !== me;
        })
        .map(t => `${t.基础档案.姓名}（主人 ${t.配种信息.当前配种者}）`);
      const askText = query
        ? `搜索「${query}」：只生成 1 条广场帖子，就是这个搜索词对应的配种者或他的便器。禁止生成多个，禁止生成不相干的人。现有有主便器：${有主.join('、') || '（空，可以新造）'}。用户叫「${me}」，发布配种者和评论者都不能是用户本人。`
        : `现有有主便器：${有主.join('、') || '（空，可以新造）'}。生成广场帖子：可以写上面这些配种者的便器，也可以造新的有主便器（必须有主人）。用户叫「${me}」，发布配种者和评论者都不能是用户本人，配文必须出现便器真名。`;
      const prompt = [
        {role: 'system', content: SHOW_PROMPT},
        {role: 'user', content: askText},
      ];
      const reply = await ask(ctx, prompt, preset, 'root');
      const show = parseShow(reply);
      if (!show.length) throw Error('这次没有刷出广场帖子，可以再试一次');
      const targets = query ? show.slice(0, 1) : show;
      const fresh = [];
      const now = Date.now();
      const 猎物库 = { ...state.猎物库 };
      for (const f of targets) {
        const 便器名 = String(f['涉及便器'] || f['作者'] || '').trim();
        const 发布配种者 = String(f['发布配种者'] || '').trim();
        if (!便器名 || !发布配种者 || 发布配种者 === me) continue;
        let id = Object.entries(猎物库).find(([, t]) => t.基础档案?.姓名 === 便器名)?.[0];
        if (!id) {
          // 广场新造的便器：不是猎场的无主求治者，直接就是发布配种者的所有物。
          id = crypto.randomUUID();
          const target = huntToTarget(f);
          const count = Math.max(1, Number(f['配种次数']) || 1);
          target.配种信息.配种次数 = count;
          target.配种信息.开发阶段 = stageOf(count);
          target.配种信息.当前配种者 = 发布配种者;
          target.配种信息.经手配种者 = { H_1: 发布配种者 };
          猎物库[id] = target;
        } else {
          const owner = String(猎物库[id].配种信息?.当前配种者 || '').trim();
          if (!owner || owner === '无') continue; // 猎场的无主求治者不进气广场
        }
        fresh.push(huntToFeed(f, id, now));
      }
      const 广场流 = query ? [...fresh, ...(state.广场流 || [])] : fresh;
      await backend.saveRoot({ 广场流, 猎物库 });
      rootDrawNew(fresh);
      return fresh.length;
    });
  }

  /** 选一版当主图（滑到哪版，帖子上就显示哪版）。 */
  async function rootPickImage(postId, photoId) {
    const state = await backend.rootState();
    const hunt = [...(state.猎场流 || [])], show = [...(state.广场流 || [])];
    const post = [...hunt, ...show].find(p => p.id === postId);
    if (!post) throw Error('找不到这条帖子');
    if (![post.photoId, ...(post.imageVersions || [])].includes(photoId)) throw Error('这张配图已经不在了');
    post.photoId = photoId;
    await backend.saveRoot({猎场流: hunt, 广场流: show});
  }

  /** 画一条根源帖子的配图（帖子和图都存在 rootState 里）。 */
  async function rootDrawImage(postId, {allowPaid = false, tags = ''} = {}) {
    const state = await backend.rootState();
    const hunt = [...(state.猎场流 || [])], show = [...(state.广场流 || [])];
    const post = [...hunt, ...show].find(p => p.id === postId);
    if (!post) throw Error('找不到这条帖子');
    const save = () => backend.saveRoot({猎场流: hunt, 广场流: show});
    if (String(tags).trim()) post.imageTags = String(tags).trim();
    if (!post.imageTags) throw Error('这条帖子没有配图描述');
    if (!backend.drawReady()) { post.imageState = 'failed'; post.imageNote = backend.drawMissing(); await save(); return null; }
    const profile = state.猎物库?.[post.猎物ID]?.基础档案 || {};
    try {
      const s = settings();
      const looks = String(profile.外貌Tag || '').trim();
      const names = [...s.routes.map(r => r.name), userName(), profile.姓名].filter(Boolean);
      // 让 photoPicture 认得出这个人：临时塞一个带固定外貌的角色（不改真实 settings）。
      const fake = looks ? {...s, routes: [...s.routes, {name: profile.姓名 || '猎物', appearance: looks, engine: 'none', voice: '', model: '', language: ''}]} : s;
      const pic = photoPicture(fake, {text: post.文案, tags: post.imageTags, owner: profile.姓名 || '', names});
      const input = pictureInputs(fake, pic, '');
      // 强制带上固定外貌：即使画面 tag 没写人数、photoCast 认为没人，也把这个人画进去。
      if (looks && !input.characters?.length) {
        input.characters = [{prompt: looks, negative: '', position: -1}];
        input.prompt = [input.prompt, '1boy'].filter(Boolean).join(', ');
      } else if (looks && input.characters?.length) {
        input.characters[0] = {...input.characters[0], prompt: [looks, input.characters[0].prompt].filter(Boolean).join(', ')};
      }
      post.imageState = 'waiting'; post.imageNote = '';
      await save();
      const result = await backend.generateImage({...input, allowPaid, name: `根源-${profile.姓名 || '帖子'}`, key: `root:${postId}`, label: `根源 · ${profile.姓名 || '帖子'}`});
      post.photoId = result.photoId;
      post.imageVersions = [...(post.imageVersions || []), post.photoId].filter(Boolean);
      post.imageState = 'done'; post.imageNote = '';
      await save();
      return result.photoId;
    } catch (error) {
      post.imageState = 'failed'; post.imageNote = error.code === 'PAID' ? backend.paidPrompt().note : error.message;
      await save();
      throw error;
    }
  }
  /** 不自动画图：刷新后只显示「点一下画出来」，由用户决定画哪张。 */
  function rootDrawNew() {
    return;
  }
  /** 私聊：按根源里的档案在小手机建一个角色，再放进当前卡的通讯录；和用户对话后这个人归用户，进马厩。 */
  async function rootAddContact(targetId) {
    const state = await backend.rootState();
    const t = state.猎物库?.[targetId];
    if (!t) throw Error('找不到这个人');
    const p = t.基础档案, b = t.配种信息;
    const name = String(p.姓名 || '').trim();
    if (!name) throw Error('这个人没有名字');
    const exists = (backend.contacts?.() || []).some(c => c.name === name);
    if (!exists) {
      const fields = [['姓名', name], ['年龄', p.年龄], ['职业', p.职业], ['籍贯', p.籍贯], ['外貌', p.外貌], ['性格', p.性格], ['体型', p.体型], ['身高', p.身高], ['体重', p.体重], ['疾病', p.疾病], ['尺寸', p.尺寸描述], ['评级', p.评级]];
      const persona = fields.filter(([, v]) => v !== undefined && v !== null && String(v).trim()).map(([k, v]) => `${k}：${v}`).join('\n');
      backend.saveRoute({ name, persona, appearance: String(p.外貌Tag || '').trim() });
      backend.addRoleContact(name);
      memory?.tidyLife?.(name).catch(() => {});
    }
    // 世界书规则：用户和 TA 对话后，当前配种者变更为用户，并更新到我的马厩。
    const 马厩 = [...(state.马厩 || [])];
    const 猎物库 = { ...state.猎物库 };
    const me = userName();
    let changed = false;
    if (!马厩.includes(targetId)) { 马厩.push(targetId); changed = true; }
    if (猎物库[targetId]?.配种信息?.当前配种者 !== me) {
      猎物库[targetId] = { ...猎物库[targetId], 配种信息: { ...猎物库[targetId].配种信息, 当前配种者: me } };
      changed = true;
    }
    if (changed) await backend.saveRoot({ 马厩, 猎物库 });
    return { name, added: !exists, stabled: changed };
  }

  return {forumRefresh, forumReact, forumReply, peekLook, peekDraw, peekPickImage, forumDrawImage, rootHunt, rootShowcase, rootDrawImage, rootPickImage, rootAddContact, busy: app => !!busy[app]};
}
