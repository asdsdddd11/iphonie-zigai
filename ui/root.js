// 根源重塑 App：连容器也自己造——不用 createView、不用小手机任何 widget。
// 自己建 <section class="rt-root">，自己实现 draw / on / busy / refresh / dispose 接口，
// 样式只作用于 .rt-root，和小手机完全隔离。
import {esc} from './common.js';
import {icon} from './icons.js';
import {previewBlob} from './thumbs.js';
import {openImageViewer} from '../image-viewer.js';
import {viewerHeart} from './photo-heart.js';
import {downloadAction, shareAction} from '../download.js';
import {editTags} from '../host-ask.js';
import {pictureInputs, photoTags, photoPicture} from '../core/draw.js';

const TABS = [
  ['hunt', '猎场', [['hunt-feed', '猎场'], ['showcase', '便器广场']]],
  ['stable', '马厩', [['messages', '消息'], ['my-stable', '我的便器'], ['trophy', '战利品']]],
  ['workshop', '工坊', [['locations', '地点'], ['items', '物品']]],
  ['me', '我的', [['account', '账号与晋升'], ['rules', '配种者守则'], ['settings', '设置']]],
];
const LEVELS = {1: '体验者', 2: '播种机', 3: '调教师', 4: '处刑官', 4.5: '准牧场主', 5: '牧场主'};
const STAGES = {0: '未调教', 1: '初诊期', 2: '崩坏期', 3: '成瘾期', 4: '改写期', 5: '重塑期'};

const STYLE = `
.rt-root { position: absolute; inset: 0; display: flex; flex-direction: column; background: #000; overflow: hidden; color: #e8e8e8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
.rt-root * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
.rt-root { --bg-primary: #0a0a0a; --bg-secondary: #141414; --bg-tertiary: #1f1f1f; --text-primary: #e8e8e8; --text-secondary: #a0a0a0; --text-muted: #666; --accent-gold: #c5a47e; --accent-gold-hover: #e3bf9b; --border-color: #2a2a2a; --error-red: #993333; }

/* 状态栏与屏幕 */
.rt-root .rt-status { flex: none; height: 35px; display: flex; justify-content: space-between; align-items: center; padding: 0 20px; font-size: 13px; color: #fff; position: relative; }
.rt-root .rt-notch { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 130px; height: 25px; background: #000; border-bottom-left-radius: 18px; border-bottom-right-radius: 18px; z-index: 100; }
.rt-root .rt-screen { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; position: relative; background: var(--bg-primary); }
.rt-root .rt-page { display: flex; flex-direction: column; height: 100%; background: var(--bg-primary); width: 100%; position: relative; }

/* 头部与子导航 */
.rt-root .rt-header { flex: none; display: flex; align-items: center; justify-content: center; height: 50px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); font-size: 17px; font-weight: 600; position: relative; width: 100%; }
.rt-root .rt-subnav { display: flex; justify-content: center; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); flex: none; padding: 0 10px; width: 100%; }
.rt-root .rt-subnav-item { padding: 12px 16px; font-size: 15px; font-weight: 500; color: var(--text-secondary); cursor: pointer; position: relative; border: none; border-bottom: 3px solid transparent; background: none; white-space: nowrap; font-family: inherit; }
.rt-root .rt-subnav-item[data-on] { color: var(--text-primary); border-bottom-color: var(--accent-gold); }
.rt-root .rt-refresh { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); cursor: pointer; font-size: 18px; padding: 5px; background: none; border: none; font-family: inherit; }
.rt-root .rt-back { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); font-size: 20px; cursor: pointer; padding: 5px; color: var(--text-primary); background: none; border: none; font-family: inherit; }

/* 内容区 */
.rt-root .rt-content { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; width: 100%; position: relative; }
.rt-root .rt-content::-webkit-scrollbar { width: 4px; }
.rt-root .rt-content::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

/* 搜索栏 */
.rt-root .rt-search-wrap { padding: 10px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); width: 100%; }
.rt-root .rt-search { display: flex; align-items: center; background: var(--bg-tertiary); border-radius: 8px; padding: 4px; gap: 8px; }
.rt-root .rt-search input { flex: 1; min-width: 0; background: transparent; border: none; color: var(--text-primary); outline: none; font-size: 14px; padding-left: 8px; font-family: inherit; }
.rt-root .rt-search-btn { background: var(--accent-gold); color: #000; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; border: none; flex: none; font-family: inherit; }

/* 帖子 */
.rt-root .rt-feed { border-bottom: 8px solid var(--bg-secondary); padding: 15px; display: flex; gap: 12px; width: 100%; }
.rt-root .rt-feed-avatar { width: 40px; height: 40px; border-radius: 50%; background: #333; flex: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; color: #fff; border: none; padding: 0; overflow: hidden; font-family: inherit; }
.rt-root .rt-feed-avatar[data-breeder] { background: var(--accent-gold); color: #000; border-radius: 8px; }
.rt-root .rt-feed-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rt-root .rt-feed-body { flex: 1; min-width: 0; }
.rt-root .rt-feed-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; flex-wrap: wrap; }
.rt-root .rt-feed-name { font-weight: 600; font-size: 15px; }
.rt-root .rt-feed-sub { font-size: 12px; color: var(--text-muted); }
.rt-root .rt-feed-text { line-height: 1.5; margin-bottom: 10px; white-space: pre-wrap; font-size: 14px; word-break: break-word; }
.rt-root .rt-feed-media { border-radius: 12px; border: 1px solid var(--border-color); background: #111; padding: 15px; color: var(--text-secondary); font-style: italic; margin-bottom: 10px; font-size: 13px; word-break: break-word; line-height: 1.7; white-space: pre-wrap; }
.rt-root .rt-feed-tags { display: flex; flex-wrap: wrap; gap: 8px; font-size: 13px; color: var(--accent-gold); margin-bottom: 12px; }
.rt-root .rt-feed-tag { cursor: pointer; background: none; border: none; color: inherit; font-size: inherit; padding: 0; font-family: inherit; }
.rt-root .rt-feed-comments { background: var(--bg-tertiary); border-radius: 8px; padding: 10px; margin-top: 10px; font-size: 13px; }
.rt-root .rt-feed-comment { margin-bottom: 8px; line-height: 1.4; word-break: break-word; }
.rt-root .rt-feed-comment:last-child { margin-bottom: 0; }
.rt-root .rt-feed-comment b { font-weight: 600; color: var(--text-secondary); margin-right: 5px; }
.rt-root .rt-feed-actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.rt-root .rt-feed-btn { background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 6px 12px; border-radius: 15px; font-weight: 600; font-size: 13px; cursor: pointer; font-family: inherit; }
.rt-root .rt-feed-btn.gold { background: var(--accent-gold); color: #000; border-color: var(--accent-gold); }

/* 等级色彩 */
.rt-root .rt-rating { font-size: 12px; color: var(--text-muted); }
.rt-root .rt-rate-r1 { color: #8a8a8a !important; font-weight: normal; }
.rt-root .rt-rate-r2 { color: #6b8577 !important; font-weight: 500; }
.rt-root .rt-rate-r3 { color: #849bac !important; font-weight: 600; }
.rt-root .rt-rate-r4 { color: #9471ab !important; font-weight: 700; }
.rt-root .rt-rate-r5 { color: #c44747 !important; font-weight: 800; }

/* 个人主页 */
.rt-root .rt-profile-head { padding: 15px; text-align: center; border-bottom: 8px solid var(--bg-secondary); }
.rt-root .rt-profile-avatar { width: 80px; height: 80px; border-radius: 50%; background: #444; margin: 0 auto 15px auto; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: bold; color: #fff; overflow: hidden; }
.rt-root .rt-profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rt-root .rt-profile-name { font-size: 22px; font-weight: 700; }
.rt-root .rt-profile-meta { display: flex; justify-content: center; gap: 10px; color: var(--text-muted); margin-top: 5px; font-size: 14px; flex-wrap: wrap; }
.rt-root .rt-profile-actions { display: flex; justify-content: center; gap: 10px; padding: 15px; }
.rt-root .rt-profile-btn { flex: 1; text-align: center; padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; background: var(--bg-tertiary); font-size: 14px; border: none; color: var(--text-primary); font-family: inherit; }
.rt-root .rt-profile-btn.gold { background: var(--accent-gold); color: #000; }
.rt-root .rt-grid { display: grid; grid-template-columns: 1fr 2.5fr; gap: 12px 5px; padding: 15px; font-size: 14px; }
.rt-root .rt-grid .k { color: var(--text-secondary); }
.rt-root .rt-grid .v { font-weight: 500; word-break: break-word; }
.rt-root .rt-reviews { padding: 15px; border-top: 8px solid var(--bg-secondary); }
.rt-root .rt-reviews-title { font-weight: 600; margin-bottom: 10px; font-size: 16px; }
.rt-root .rt-review { background: var(--bg-secondary); padding: 10px; border-radius: 8px; margin-bottom: 8px; font-size: 14px; line-height: 1.5; word-break: break-word; }
.rt-root .rt-dyn { padding: 15px; border-bottom: 1px solid var(--border-color); }
.rt-root .rt-dyn-text { line-height: 1.5; margin-bottom: 8px; font-size: 14px; white-space: pre-wrap; word-break: break-word; }
.rt-root .rt-dyn-media { border-radius: 12px; border: 1px solid var(--border-color); background: #111; padding: 15px; color: var(--text-secondary); font-style: italic; margin-bottom: 8px; font-size: 13px; line-height: 1.7; }
.rt-root .rt-dyn-tags { display: flex; flex-wrap: wrap; gap: 8px; font-size: 13px; color: var(--accent-gold); }

/* 底部导航 */
.rt-root .rt-dock { display: flex; height: 60px; background: var(--bg-secondary); border-top: 1px solid var(--border-color); flex: none; width: 100%; z-index: 10; position: relative; padding-bottom: env(safe-area-inset-bottom, 0px); box-sizing: content-box; }
.rt-root .rt-dock-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 10px; color: var(--text-secondary); cursor: pointer; background: none; border: none; padding: 0; font-family: inherit; }
.rt-root .rt-dock-item[data-on] { color: var(--accent-gold); }
.rt-root .rt-dock-icon { font-size: 20px; line-height: 1; }

/* 通用 */
.rt-root .rt-empty { padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 14px; }
.rt-root .rt-empty b { display: block; color: var(--text-secondary); margin-bottom: 6px; font-size: 15px; }
.rt-root .rt-note { color: var(--text-secondary); font-size: 13px; padding: 6px 0; }
.rt-root .rt-sec { font-weight: 600; margin: 15px 0 8px; font-size: 15px; color: var(--text-primary); }
.rt-root .rt-row { display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid var(--border-color); width: 100%; text-align: left; background: none; border-left: none; border-right: none; border-top: none; color: var(--text-primary); font-family: inherit; cursor: pointer; }
.rt-root .rt-row strong { font-size: 16px; display: block; font-weight: 600; }
.rt-root .rt-row small { color: var(--text-secondary); font-size: 13px; display: block; margin-top: 2px; }
.rt-root .rt-photo img { border: 1px solid var(--border-color); border-radius: 12px; display: block; max-width: 100%; max-height: 320px; object-fit: cover; margin-bottom: 10px; }
`;
function ensureStyle(doc) {
  if (!doc) return;
  let style = doc.getElementById('rt-style');
  if (!style) { style = doc.createElement('style'); style.id = 'rt-style'; doc.head.appendChild(style); }
  if (style.textContent !== STYLE) style.textContent = STYLE;
}

/** 自己造的容器：和小手机 createView 无关，只提供 phone.js 需要的 root / refresh / dispose 和 App 自己的 draw / on / busy。 */
function rootView(ctx) {
  const doc = ctx.doc, win = ctx.win;
  const root = doc.createElement('section');
  root.className = 'rt-root';
  const controller = new win.AbortController();
  let disposed = false;
  return {
    root,
    draw(html) { root.innerHTML = html; },
    on(event, selector, handler) {
      root.addEventListener(event, e => {
        const el = e.target?.closest?.(selector);
        if (el && root.contains(el)) handler(el, e);
      }, {signal: controller.signal});
    },
    async busy(el, fn) {
      if (el && 'disabled' in el) el.disabled = true;
      try { return await fn(); } finally { if (el && 'disabled' in el) el.disabled = false; }
    },
    refresh() {},
    dispose() { disposed = true; controller.abort(); },
    get disposed() { return disposed; },
  };
}

export function rootApp(ctx) {
  const {api} = ctx, v = rootView(ctx);
  let tab = 'hunt', sub = 'hunt-feed', search = '', profileId = '';
  const urls = new Map();

  const tabDef = () => TABS.find(t => t[0] === tab);
  const subName = id => tabDef()[2].find(s => s[0] === id)?.[1] || id;
  const face = (name, size) => `<span class="rt-face" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px">${esc(String(name || '?').charAt(0))}</span>`;

  const urlFor = async id => {
    if (urls.has(id)) return urls.get(id);
    const photo = await api.getPhoto(id);
    if (!photo?.blob) throw Error('配图找不到了');
    const url = ctx.win.URL.createObjectURL(photo.blob);
    urls.set(id, url);
    return url;
  };
  async function loadPhotos(root = v.root) {
    for (const img of root.querySelectorAll('img[data-photo]')) {
      const id = img.dataset.photo;
      if (!id || img.src || urls.has(id)) continue;
      try {
        const blob = await previewBlob(api, id);
        const src = blob ? ctx.win.URL.createObjectURL(blob) : await urlFor(id);
        urls.set(id, src);
        if (img.isConnected) img.src = src;
      } catch {}
    }
  }

  function clock() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function topBar(showSearch) {
    const status = `<div class="rt-status"><span>${clock()}</span><div class="rt-notch"></div><span>5G ▮</span></div>`;
    if (profileId) {
      return status + `<div class="rt-header"><button type="button" class="rt-back" data-action="root-back" aria-label="返回">‹</button><span>目标档案</span></div>`;
    }
    const tabs = `<div class="rt-subnav">${tabDef()[2].map(([id, name]) => `<button type="button" class="rt-subnav-item" data-action="root-sub" data-sub="${id}"${sub === id ? ' data-on' : ''}>${name}</button>`).join('')}</div>`;
    const refresh = `<button type="button" class="rt-refresh" data-action="root-refresh" aria-label="刷新">⟳</button>`;
    const search = showSearch
      ? `<div class="rt-search-wrap"><div class="rt-search"><input type="search" data-field="root-search" aria-label="搜索" placeholder="输入关键词..."><button type="button" class="rt-search-btn" data-action="root-do-search">搜索</button></div></div>`
      : '';
    return status + `<div class="rt-header">${tabs}${refresh}</div>` + search;
  }

  const DOCK_ICONS = {hunt: '🔍', stable: '🐴', workshop: '🔧', me: '👤'};

  function dock() {
    return `<div class="rt-dock">${TABS.map(([id, name]) => `<button type="button" class="rt-dock-item" data-action="root-tab" data-tab="${id}"${tab === id ? ' data-on' : ''}><span class="rt-dock-icon">${DOCK_ICONS[id] || '·'}</span><span>${name}</span></button>`).join('')}</div>`;
  }

  function photo(p) {
    if (p.photoId) {
      const url = urls.get(p.photoId);
      return `<button type="button" class="rt-photo" data-action="root-view-photo" data-id="${esc(p.id)}"><img data-photo="${esc(p.photoId)}"${url ? ` src="${esc(url)}"` : ''} alt="配图"></button>`;
    }
    if (!p.imageTags) return '';
    if (p.imageState === 'waiting') return '<p class="rt-note">配图正在画……</p>';
    if (p.imageState === 'failed') return `<button type="button" class="rt-note" data-action="root-draw" data-id="${esc(p.id)}">${esc(p.imageNote || '配图没画出来')} · 点一下重画</button>`;
    return `<button type="button" class="rt-note" data-action="root-draw" data-id="${esc(p.id)}">这条帖子有配图 · 点一下画出来</button>`;
  }

  const RATE_CLS = {'原矿': 'rt-rate-r1', '粗坯': 'rt-rate-r2', '精雕': 'rt-rate-r3', '宝玉': 'rt-rate-r4', '神物': 'rt-rate-r5'};

  function post(p, state, allowApply) {
    const t = state.猎物库?.[p.猎物ID];
    const isBreeder = !!p.发布配种者;
    const name = isBreeder ? p.发布配种者 : (t?.基础档案?.姓名 || '未知');
    const rating = isBreeder ? ('Lv.' + (p.配种者等级 || 1)) : (t?.基础档案?.评级 || '原矿');
    const rateCls = isBreeder ? '' : (RATE_CLS[rating] || '');
    const stage = isBreeder ? undefined : t?.配种信息?.开发阶段;
    const tags = String(p.标签 || '').split(/\s+/).filter(Boolean);
    return `<div class="rt-feed">
      <button type="button" class="rt-feed-avatar"${isBreeder ? ' data-breeder' : ''} data-action="root-profile" data-id="${esc(p.猎物ID)}" aria-label="看 ${esc(name)} 的档案">${face(name, 40)}</button>
      <div class="rt-feed-body">
        <div class="rt-feed-head"><span class="rt-feed-name">${esc(name)}</span><span class="rt-feed-sub ${rateCls}">${esc(rating)}</span>${stage !== undefined ? `<span class="rt-feed-sub">${esc(STAGES[stage] || '')}</span>` : ''}${isBreeder && t ? `<span class="rt-feed-sub">涉及 ${esc(t.基础档案?.姓名 || '')}</span>` : ''}</div>
        <div class="rt-feed-text">${esc(p.文案)}</div>
        ${p.媒体描述 ? `<div class="rt-feed-media">${esc(p.媒体描述)}</div>` : ''}
        ${photo(p)}
        ${tags.length ? `<div class="rt-feed-tags">${tags.map(tag => `<button type="button" class="rt-feed-tag" data-action="root-search" data-tag="${esc(tag)}">${esc(tag)}</button>`).join('')}</div>` : ''}
        ${p.评论区?.length ? `<div class="rt-feed-comments">${p.评论区.map(c => `<div class="rt-feed-comment"><b>${esc(c.留言者)}</b>${esc(c.内容)}</div>`).join('')}</div>` : ''}
        <div class="rt-feed-actions"><button type="button" class="rt-feed-btn" data-action="root-profile" data-id="${esc(p.猎物ID)}">看档案</button><button type="button" class="rt-feed-btn" data-action="root-chat" data-id="${esc(p.猎物ID)}">私聊</button>${allowApply ? `<button type="button" class="rt-feed-btn gold" data-action="root-apply" data-id="${esc(p.猎物ID)}">申请配种</button>` : ''}</div>
      </div>
    </div>`;
  }

  function feedBody(state, feed, title, hint, allowApply) {
    const q = search.trim().toLowerCase();
    const rows = feed.filter(p => {
      const t = state.猎物库?.[p.猎物ID];
      if (!q) return true;
      return (p.文案 || '').toLowerCase().includes(q) || (p.标签 || '').toLowerCase().includes(q) || (t?.基础档案?.姓名 || '').toLowerCase().includes(q);
    });
    return `<div class="rt-search-wrap" style="background:none;border:none;padding:10px 15px 0"><p class="rt-note" style="padding:0">${esc(title)}${q ? ` · 搜索「${esc(search)}」` : ''}</p></div>`
      + (q ? `<div class="rt-search-wrap" style="background:none;border:none;padding:0 15px 10px"><button type="button" class="rt-feed-btn" data-action="root-clear-search">清除搜索</button></div>` : '')
      + (rows.length ? rows.map(p => post(p, state, allowApply)).join('')
        : `<div class="rt-empty"><b>${esc(q ? '没有匹配的帖子' : '还没有帖子')}</b>${esc(q ? '换个关键词试试。' : '点右上角刷新，刷出新猎物。')}</div>`)
      + (hint ? `<p class="rt-note">${esc(hint)}</p>` : '');
  }

  function profileBody(state) {
    const t = state.猎物库?.[profileId];
    if (!t) return '<div class="rt-empty"><b>找不到这个人</b></div>';
    const p = t.基础档案, b = t.配种信息;
    const dyn = Object.values(t.主页动态 || {}).filter(d => d && d.文案);
    const owners = Object.values(b.经手配种者 || {}).filter(Boolean);
    const plays = Object.values(b.玩法历史 || {}).filter(Boolean);
    const reviews = Object.values(b.过往评价 || {}).filter(Boolean);
    const rateCls = RATE_CLS[p.评级] || '';
    return `<div class="rt-profile-head">
        <div class="rt-profile-avatar">${face(p.姓名, 80)}</div>
        <div class="rt-profile-name">${esc(p.姓名)}</div>
        <div class="rt-profile-meta"><span class="${rateCls}">${esc(p.评级 || '原矿')}</span><span>${esc(p.职业 || '未知')}</span>${p.籍贯 ? `<span>${esc(p.籍贯)}</span>` : ''}</div>
      </div>
      <div class="rt-grid">
        <span class="k">病理档案</span><span class="v" style="color:#993333">${esc(p.疾病 || '未知')}</span>
        <span class="k">基础参数</span><span class="v">${esc(p.年龄 || '?')}岁 · ${esc(p.身高 || '?')} · ${esc(p.体重 || '?')}</span>
        <span class="k">肉体维度</span><span class="v">${esc(p.体型 || '?')}</span>
        <span class="k">精神刻写</span><span class="v">${esc(p.性格 || '?')}</span>
        <span class="k">外貌</span><span class="v">${esc(p.外貌 || '?')}</span>
        <span class="k">性器规格</span><span class="v">${esc(p.尺寸描述 || '?')}</span>
        <span class="k">开发记录</span><span class="v" style="color:#c5a47e;font-weight:700">已配种 ${esc(b.配种次数 || 0)} 次 · Lv.${esc(b.开发阶段 || 0)} ${esc(STAGES[b.开发阶段] || '')}</span>
        ${b.当前配种者 && b.当前配种者 !== '无' ? `<span class="k">当前配种者</span><span class="v">${esc(b.当前配种者)}</span>` : ''}
        ${owners.length ? `<span class="k">经手配种者</span><span class="v">${esc(owners.join('、'))}</span>` : ''}
        ${plays.length ? `<span class="k">玩法历史</span><span class="v">${esc(plays.join(' ｜ '))}</span>` : ''}
      </div>
      <div class="rt-profile-actions"><button type="button" class="rt-profile-btn gold" data-action="root-chat" data-id="${esc(profileId)}">调出加密通讯</button></div>
      ${reviews.length ? `<div class="rt-reviews"><div class="rt-reviews-title">过往评价</div>${reviews.map(x => `<div class="rt-review">${esc(x)}</div>`).join('')}</div>` : ''}
      <div class="rt-reviews"><div class="rt-reviews-title">主页动态</div></div>
      ${dyn.length ? dyn.map(d => `<div class="rt-dyn"><div class="rt-dyn-text">${esc(d.文案)}</div>${d.媒体描述 ? `<div class="rt-dyn-media">${esc(d.媒体描述)}</div>` : ''}${d.标签 ? `<div class="rt-dyn-tags">${esc(d.标签)}</div>` : ''}</div>`).join('') : '<p class="rt-note" style="padding:0 15px 15px">还没有动态。</p>'}`;
  }

  function body(state) {
    if (profileId) return profileBody(state);
    if (sub === 'hunt-feed') return feedBody(state, state.猎场流 || [], '猎场信息流', '刷新覆盖旧帖，搜索把新帖放最前。', false);
    if (sub === 'showcase') return feedBody(state, state.广场流 || [], '便器广场', '配种成果展示。', true);
    if (sub === 'my-stable') {
      const rows = (state.马厩 || []).map(id => [id, state.猎物库?.[id]]).filter(([, t]) => t);
      return `<div class="rt-sec">我的便器</div>` + (rows.length ? rows.map(([id, t]) => `<button type="button" class="rt-row" data-action="root-profile" data-id="${esc(id)}"><span><strong>${esc(t.基础档案.姓名)}</strong><small>${esc(t.基础档案.评级)} · ${esc(STAGES[t.配种信息.开发阶段] || '')}</small></span><span>›</span></button>`).join('') : '<div class="rt-empty"><b>还没有收下的便器</b>申请配种、线下调教后进马厩。</div>');
    }
    if (sub === 'account') {
      const u = state.用户 || {};
      const row = (k, val) => `<div class="rt-row"><span><strong>${esc(k)}</strong><small>${esc(val)}</small></span></div>`;
      return `<div class="rt-sec">账号与晋升</div>` + row('名称', u.名称 || '未设置') + row('等级', LEVELS[u.等级] || u.等级 || '') + row('资金', '¥' + (u.资金 ?? 0)) + row('积分', u.积分 ?? 0);
    }
    if (sub === 'rules') return `<div class="rt-sec">配种者守则</div><div class="rt-note">行为保密、开发原则、积分系统、便器评级、开发程度、晋升条例——后续从世界书同步。</div>`;
    if (sub === 'locations' || sub === 'items') return `<div class="rt-sec">${esc(subName(sub))}</div><div class="rt-empty"><b>工坊待接入</b>地点和物品后续阶段接进来。</div>`;
    return `<div class="rt-sec">${esc(subName(sub))}</div><div class="rt-empty"><b>还在搭</b>这个页面先占位。</div>`;
  }

  async function render() {
    ensureStyle(ctx.doc);
    const state = await api.rootState().catch(() => null) || {};
    const showSearch = !profileId && (sub === 'hunt-feed' || sub === 'showcase');
    v.draw(`${topBar(showSearch)}<div class="rt-screen"><div class="rt-page"><div class="rt-content">${body(state)}</div></div></div>${dock()}`);
    loadPhotos();
  }

  /** 帖子配图，点开看大图：多版左右滑、看参数、下载、分享、收藏、重画、改提示词、删除，和朋友圈一样。 */
  async function viewPhoto(postId, img) {
    const state = await api.rootState().catch(() => null) || {};
    const p = [...(state.猎场流 || []), ...(state.广场流 || [])].find(x => x.id === postId);
    if (!p?.photoId) return;
    const versions = [];
    for (const photoId of [...new Set([...(p.imageVersions || []), p.photoId].filter(Boolean))]) {
      try { const photo = await api.getPhoto(photoId); if (photo) versions.push({photoId, photo, src: await urlFor(photoId)}); } catch {}
    }
    if (v.disposed || !versions.length) return;
    const cap = p.文案 || '', owner = state.猎物库?.[p.猎物ID]?.基础档案?.姓名 || '';
    const name = '根源 · ' + (owner || '帖子'), drawn = !!p.imageTags;
    const current = async () => {
      const now = await api.rootState().catch(() => null) || {};
      const post = [...(now.猎场流 || []), ...(now.广场流 || [])].find(x => x.id === postId);
      if (!post) throw Error('这条帖子已经不在了');
      return {post, state: now};
    };
    const redraw = async tags => {
      const paid = api.drawQuote?.().free === false, ask = api.paidPrompt?.();
      if (paid && ask && !await ctx.confirm(ask.title, ask.text)) return false;
      await api.rootDrawImage(postId, paid, tags);
      render();
    };
    const rewrite = async () => {
      const {post} = await current();
      const tags = await editTags({doc: ctx.doc, text: post.imageTags || '', ask: (text, mode, wish) => api.tagText ? api.tagText(text, mode, wish) : Promise.reject(Error('看中文和改要在酒馆里用')),
        about: '这张配图用的英文 tag。改了以后重画也用它；之前画的几版还在，可以左右滑着比。'});
      if (!tags?.trim()) return false;
      return redraw(tags.trim());
    };
    const inDraw = async i => {
      const {post, state: now} = await current();
      const profile = now.猎物库?.[post.猎物ID]?.基础档案 || {}, looks = String(profile.外貌Tag || '').trim(), s = api.getState();
      const names = [...s.routes.map(r => r.name), api.userName?.() || '我', profile.姓名].filter(Boolean);
      const fake = looks ? {...s, routes: [...s.routes, {name: profile.姓名 || '猎物', appearance: looks, engine: 'none', voice: '', model: '', language: ''}]} : s;
      const tags = photoTags({text: post.文案, tags: post.imageTags, owner: profile.姓名 || '', names});
      ctx.openDraw({...pictureInputs(fake, photoPicture(fake, {text: post.文案, tags: post.imageTags, owner: profile.姓名 || '', names})), tag: tags, seed: Number(versions[i].photo.info?.find(row => row[0] === '种子')?.[1])});
    };
    let viewer;
    const safe = fn => async i => { viewer?.close(); try { return await fn(i); } catch (error) { ctx.notify(error.message, {error: true}); return false; } };
    const heart = await viewerHeart(api, i => versions[i].photoId, ctx.notify);
    if (v.disposed) return;
    viewer = openImageViewer({doc: ctx.doc, from: img, caption: cap,
      gallery: {items: versions.map(x => ({src: x.src, alt: cap, info: x.photo.info})), index: Math.max(0, versions.findIndex(x => x.photoId === p.photoId)),
        onIndex: i => { const fn = api.rootPickImage; if (fn) fn(postId, versions[i].photoId).then(() => render(), () => {}); }},
      actions: [heart, downloadAction(ctx.doc, i => ({source: versions[i].photo.blob, name}), ctx.notify), shareAction(ctx.doc, i => ({source: versions[i].photo.blob, name}), ctx.notify),
        ...(drawn ? [
          {label: '重画', run: safe(() => redraw())},
          {label: '改提示词再画', run: safe(rewrite)},
          ...(ctx.openDraw ? [{label: '在绘图中打开', run: safe(inDraw)}] : []),
          {label: '删除这版', danger: true, run: safe(async i => { if (!await ctx.confirm('删除这版配图？', versions.length > 1 ? '这条帖子换成别的一版。' : '这条帖子就没有配图了，之后可以再画。')) return false; await api.deletePhoto(versions[i].photoId); render(); })}
        ] : [])].filter(Boolean)});
  }

  v.on('click', '[data-action]', async el => {
    const action = el.dataset.action;
    if (action === 'root-tab') { tab = el.dataset.tab; sub = tabDef()[2][0][0]; search = ''; profileId = ''; render(); }
    else if (action === 'root-sub') { sub = el.dataset.sub; search = ''; profileId = ''; render(); }
    else if (action === 'root-profile') { profileId = el.dataset.id; render(); }
    else if (action === 'root-back') { profileId = ''; render(); }
    else if (action === 'root-refresh') {
      await v.busy(el, async () => {
        const n = sub === 'showcase' ? await api.rootShowcase() : await api.rootHunt();
        ctx.notify(`刷出 ${n} 条（覆盖）`);
        render();
      });
    }
    else if (action === 'root-search') { search = el.dataset.tag; render(); }
    else if (action === 'root-clear-search') { search = ''; render(); }
    else if (action === 'root-draw') { await v.busy(el, async () => { await api.rootDrawImage(el.dataset.id); render(); }); }
    else if (action === 'root-view-photo') viewPhoto(el.dataset.id, el.querySelector('img'));
    else if (action === 'root-do-search') {
      const box = v.root.querySelector('[data-field=root-search]');
      const q = (box?.value || '').trim();
      if (!q) { ctx.notify('先输入搜索词'); return; }
      await v.busy(el, async () => { const n = sub === 'showcase' ? await api.rootShowcase(q) : await api.rootHunt(q); ctx.notify(`搜出 ${n} 条，已放最前`); render(); });
    }
    else if (action === 'root-chat') {
      await v.busy(el, async () => {
        const r = await api.rootAddContact(el.dataset.id);
        ctx.notify(r.stabled ? `「${r.name}」已加进通讯录，也归你了（进马厩）` : (r.added ? `已把「${r.name}」加进通讯录` : `「${r.name}」已经在通讯录里了`));
      });
    }
    else if (action === 'root-apply') ctx.notify('申请配种后续接入（在便器广场）');
  });

  render();
  return v;
}
