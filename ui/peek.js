// 查手机: pick a contact and pick up their phone — a phone of their own (ui/peek-phone.js) with a lock screen, a home
// screen and their chats with other people, album, notes, searches and shopping cart, made up by the model (host-apps.js)
// from who they are and what they know. One snapshot per contact; looking again replaces it.
import {createView, esc, btn, heading, avatar, empty, help} from './common.js';
import {icon} from './icons.js';
import {openImageViewer} from '../image-viewer.js';
import {peekPhone} from './peek-phone.js';
import {viewerHeart} from './photo-heart.js';
import {downloadAction, shareAction} from '../download.js';
import {editTags} from '../host-ask.js';
import {pictureInputs, photoTags, photoPicture} from '../core/draw.js';

function ago(at) {
  const s = (Date.now() - at) / 1000;
  if (s < 3600) return s < 60 ? '刚刚' : `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  const d = new Date(at);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function peekApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'peek');
  let who = '', epoch = 0, device = null, pickUp = false;
  const busy = () => api.peekBusy?.();
  const face = (name, size) => avatar(name, ctx.engineOf(name), size);

  async function renderList(ticket) {
    const [contacts, peeks] = await Promise.all([api.chatContacts?.() || [], api.listPeeks()]);
    if (v.disposed || ticket !== epoch) return;
    const seen = new Map(peeks.map(p => [p.name, p]));
    v.draw(heading('查手机', help('拿起 TA 的手机：锁屏、桌面，能点开 TA 和别人的聊天、相册、备忘录、浏览器里的搜索记录和购物车。内容由模型按人设、世界书和 TA 知道的剧情编出来：TA 不在场的事、你心里想的，都不会出现在 TA 的手机里。看一次调用一次模型。'), 'Peek')
      + `<p class="hint">选一个人，偷看 TA 的手机。</p>`
      + (contacts.length ? `<div class="peek-people">${contacts.map(c => `<button type="button" class="peek-person" data-action="peek-open" data-name="${esc(c.name)}">${face(c.name, 52)}<b>${esc(c.name)}</b><small>${seen.has(c.name) ? '看过 · ' + ago(seen.get(c.name).at) : '还没看过'}</small></button>`).join('')}</div>`
        : empty('还没有联系人', '先在角色 App 里添加角色，或者在聊天里添加联系人。', 'person')));
  }
  async function renderPerson(ticket) {
    const s = await api.getPeek(who);
    if (v.disposed || ticket !== epoch) return;
    const working = busy();
    if (device) { device.update(s); if (!s) { device.close(); } }
    const counts = s ? [['聊天', s.chats.length], ['照片', s.photos.length], ['备忘录', s.notes.length], ['搜索', s.searches.length], ['购物车', s.cart?.length || 0]].filter(([, n]) => n) : [];
    v.draw(heading(`${who} 的手机`, s ? btn('peek-look', icon('refresh'), 'round-button', `aria-label="再看一次" ${working ? 'disabled' : ''}`) : '', s ? `Peek · ${ago(s.at)}` : 'Peek')
      + `<div class="peek-lock">${face(who, 72)}
        <p>${s ? `${esc(who)} 的手机，上次看到：${counts.map(([k, n]) => `${k} ${n}`).join(' · ')}` : `${esc(who)} 的手机就放在桌上……`}</p>
        ${working ? '<p class="moments-busy" role="status">正在偷看……</p>' : ''}
        ${s ? btn('peek-pick', icon('eye') + '拿起来', 'primary', working ? 'disabled' : '') : btn('peek-look', working ? '正在偷看……' : icon('eye') + '拿起来看看', 'primary', working ? 'disabled' : '')}</div>`
      + (s ? `<div class="actions">${btn('peek-forget', icon('trash') + '忘掉看到的', 'text-button')}</div>` : ''));
    if (s && pickUp && !working) { pickUp = false; pick(s); }
  }
  const urls = new Map();
  async function urlFor(id) {
    if (urls.has(id)) return urls.get(id);
    const photo = await api.getPhoto(id), url = photo ? ctx.win.URL.createObjectURL(photo.blob) : '';
    urls.set(id, url);
    return url;
  }
  async function render() {
    const ticket = ++epoch;
    await (who ? renderPerson(ticket) : renderList(ticket));
  }
  /** Draws album photos (index 'wallpaper': the wallpaper) one after another (the drawing queue spaces them); asks
   *  first when one would cost Anlas. */
  async function draw(indexes) {
    for (const index of indexes) {
      try { await api.peekDraw(who, index, false); }
      catch (error) {
        if (error.code !== 'PAID' && !/扣 Anlas|花钱/.test(error.message)) { ctx.notify(error.message, {error: true}); continue; }
        const ask = api.paidPrompt();
        if (await ctx.confirm(ask.title, ask.text)) await api.peekDraw(who, index, true).catch(e => ctx.notify(e.message, {error: true}));
        else break;
      }
    }
    await render();
  }
  /** 点开相册里的一张：和论坛、朋友圈一样——画过的版本都在，左右滑能看，切了哪版下次就显示哪版。 */
  async function openPicture(s, img) {
    const key = img?.dataset?.key ?? '', at = key === 'wallpaper' ? 'wallpaper' : Number(key);
    const photo = at === 'wallpaper' ? s.wallpaper : s.photos?.[at];
    if (!photo) { if (img?.src) openImageViewer({doc: ctx.doc, src: img.src, alt: img.alt || '', from: img}); return; }
    const ids = (Array.isArray(photo.versions) && photo.versions.length ? photo.versions : photo.photoId ? [photo.photoId] : []).filter(Boolean);
    if (!ids.length) { if (img?.src) openImageViewer({doc: ctx.doc, src: img.src, alt: photo.text || '', from: img}); return; }
    const items = [];
    for (const id of ids) { const src = await urlFor(id); if (src) items.push({src, alt: photo.text || '', info: null}); }
    if (!items.length) return;
    const start = Math.max(0, ids.indexOf(photo.photoId)), label = at === 'wallpaper' ? '壁纸' : '这张照片';
    /** 重画：带着（可能刚改过的）tag 再画一版，旧版都留着。 */
    const redraw = async tags => {
      const paid = api.drawQuote?.().free === false, ask = api.paidPrompt?.();
      if (paid && ask && !await ctx.confirm(ask.title, ask.text)) return false;
      await api.peekDraw(who, at, paid, tags || '');
      await render();
      return true;
    };
    /** 改提示词再画。 */
    const rewrite = async () => {
      const tags = await editTags({doc: ctx.doc, text: photo.tags || '',
        ask: (text, mode, wish) => api.tagText ? api.tagText(text, mode, wish) : Promise.reject(Error('看中文和改要在酒馆里用')),
        about: `${label}用的英文 tag。改了以后重画也用它；之前画的几版还在，可以左右滑着比。`});
      if (!tags?.trim()) return false;
      return redraw(tags.trim());
    };
    /** 在绘图中打开。 */
    const inDraw = async () => {
      if (!ctx.openDraw) return false;
      const state = api.getState(), names = [...state.routes.map(r => r.name), api.userName?.() || '我'];
      const tags = photoTags({text: photo.text || '', tags: photo.tags || '', owner: who, names});
      ctx.openDraw({...pictureInputs(state, photoPicture(state, {text: photo.text || '', tags: photo.tags || '', owner: who, names})), tag: tags, seed: null});
      return true;
    };
    let viewer;
    const safe = fn => async i => { viewer?.close(); try { return await fn(i); } catch (error) { ctx.notify(error.message, {error: true}); return false; } };
    const heart = await viewerHeart(api, i => ids[i], ctx.notify);
    if (v.disposed) return;
    viewer = openImageViewer({doc: ctx.doc, from: img, caption: photo.text || '',
      gallery: {items, index: start, onIndex: i => { const fn = api.peekPickImage; if (fn) fn(who, at, ids[i]).then(() => render(), () => {}); }},
      actions: [heart,
        downloadAction(ctx.doc, async i => { const p = await api.getPhoto(ids[i]); return p ? {source: p.blob, name: `查手机 ${who}`} : null; }, ctx.notify),
        shareAction(ctx.doc, async i => { const p = await api.getPhoto(ids[i]); return p ? {source: p.blob, name: `查手机 ${who}`} : null; }, ctx.notify),
        {label: '重画', run: safe(() => redraw(''))},
        {label: '改提示词再画', run: safe(rewrite)},
        ...(ctx.openDraw ? [{label: '在绘图中打开', run: safe(inDraw)}] : []),
        {label: '删除这版', danger: true, run: safe(async i => {
          if (!await ctx.confirm(`删除${label}？`, items.length > 1 ? '这张换成另一版。' : `${label}就没有了，之后可以再画。`)) return false;
          await api.deletePhoto(ids[i]); const rest = ids.filter(x => x !== ids[i]);
          if (rest.length) await api.peekPickImage?.(who, at, rest[rest.length - 1]).catch(() => {});
          await render(); return true;
        })}
      ].filter(Boolean)});
  }
  /** Picks up the phone: the owner's own phone over the whole screen. */
  function pick(s) {
    device?.close();
    const host = ctx.doc.querySelector('.screen') || v.root;
    // 查手机 × 聊天 (0.9.35): once the phone was unlocked, its owner may notice (told in the next private chat with them).
    const seen = new Set(), name = who;
    let unlocked = false;
    device = peekPhone(ctx, {host, snap: s, canDraw: () => api.drawReady(), draw, photo: urlFor,
      view: img => { openPicture(s, img).catch(error => ctx.notify(error.message, {error: true})); },
      play: song => { ctx.notify(`正在找「${song.title}」……`); api.musicPlay?.({...song, from: 'share'}).catch(error => ctx.notify(error.message, {error: true})); },
      see: part => { if (part === 'home') unlocked = true; else { unlocked = true; seen.add(part); } },
      close: () => { device = null; if (unlocked) { try { api.markPeeked?.(name, [...seen].slice(0, 6).join('、')); } catch { /* not worth a word */ } } if (!v.disposed) render().catch(() => {}); }});
  }
  function look(keep = false) {
    const job = api.peekLook(who, keep), name = who;
    pickUp = true;
    render();
    job.then(() => ctx.notify(`拿到了 ${name} 的手机`)).catch(error => { pickUp = false; ctx.notify(error.message, {error: true}); }).finally(() => render());
  }
  v.back = () => {
    if (device) return device.back();
    if (!who) return false;
    who = ''; pickUp = false; render(); return true;
  };
  v.refresh = () => render();
  const dispose = v.dispose;
  v.dispose = () => { dispose.call(v); device?.close(); device = null; for (const url of urls.values()) if (url) ctx.win.URL.revokeObjectURL(url); };
  v.on('click', '[data-action]', async el => {
    switch (el.dataset.action) {
      case 'peek-open': {
        who = el.dataset.name; await render(); v.root.scrollTop = 0;
        const s = await api.getPeek(who);
        if (s && !busy()) pick(s);
        break;
      }
      case 'peek-pick': { const s = await api.getPeek(who); if (s) pick(s); break; }
      case 'peek-look': {
        if (!await api.getPeek(who)) { look(); break; }
        const d = ctx.dialog('再看一次', `<p class="hint">都会调用一次模型。</p><div class="pick-list">
          <button class="list-row" data-look="keep">${icon('add')}<span><strong>接着上次看</strong><small>上次看到的都留着，只加上这段时间新多出来的聊天、搜索、照片，购物车换成现在的样子</small></span></button>
          <button class="list-row" data-look="new">${icon('refresh')}<span><strong>重新编一份</strong><small>现在看到的会被换掉</small></span></button></div>`);
        d.body.addEventListener('click', e => {
          const b = e.target.closest('[data-look]');
          if (!b) return;
          d.close();
          look(b.dataset.look === 'keep');
        });
        break;
      }
      case 'peek-forget': if (await ctx.confirm('忘掉看到的？', `${who} 手机里的这些内容会删掉。`)) { await api.deletePeek(who); await render(); } break;
    }
  });
  render().catch(error => ctx.notify(error.message));
  return v;
}
