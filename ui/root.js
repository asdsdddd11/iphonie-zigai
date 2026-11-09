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
.rt-root { position: absolute; inset: 0; display: flex; flex-direction: column; background: #0a0a0a; overflow: hidden; color: #e8e8e8; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; padding: 0; box-sizing: border-box; }
.rt-root * { box-sizing: border-box; }
.rt-root .rt-top { flex: none; padding: calc(38px + env(safe-area-inset-top, 0px)) 12px 8px; background: #0a0a0a; border-bottom: 1px solid #2a2a2a; }
.rt-root .rt-bar { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
.rt-root .rt-bar input { flex: 1; min-width: 0; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #2a2a2a; background: #141414; color: #e8e8e8; font-size: 12.5px; outline: none; }
.rt-root .rt-bar button { height: 30px; padding: 0 11px; border-radius: 8px; border: 1px solid #c5a47e; background: #1f1f1f; color: #c5a47e; font-size: 12.5px; white-space: nowrap; font-family: inherit; }
.rt-root .rt-bar .rt-sq { width: 30px; padding: 0; display: grid; place-items: center; }
.rt-root .rt-backbar { display: flex; align-items: center; gap: 10px; }
.rt-root .rt-back { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; border: 1px solid #2a2a2a; background: #1f1f1f; color: #c5a47e; }
.rt-root .rt-backbar b { font-size: 14px; color: #e8e8e8; }
.rt-root .rt-tabs { display: flex; gap: 6px; border-bottom: 1px solid #2a2a2a; }
.rt-root .rt-tab { flex: 1; padding: 7px 0; border: none; background: none; color: #666; font-size: 12.5px; white-space: nowrap; font-family: inherit; text-align: center; position: relative; }
.rt-root .rt-tab[data-on] { color: #c5a47e; font-weight: 700; }
.rt-root .rt-tab[data-on]::after { content: ''; position: absolute; left: 22%; right: 22%; bottom: -1px; height: 2px; border-radius: 1px; background: #c5a47e; }
.rt-root .rt-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 10px 12px 16px; scrollbar-width: none; }
.rt-root .rt-scroll::-webkit-scrollbar { display: none; }
.rt-root .rt-dock { flex: none; display: flex; border-top: 1px solid #2a2a2a; background: #0a0a0a; padding: 9px 0 calc(22px + env(safe-area-inset-bottom, 0px)); }
.rt-root .rt-dock button { flex: 1; padding: 4px 0; background: none; border: none; color: #666; font-size: 12px; font-family: inherit; }
.rt-root .rt-dock button[data-on] { color: #c5a47e; font-weight: 700; }
.rt-root .rt-post { background: #141414; border: 1px solid #2a2a2a; border-radius: 13px; padding: 12px; margin: 10px 0; }
.rt-root .rt-post-head { display: flex; align-items: center; gap: 10px; }
.rt-root .rt-face { display: inline-flex; align-items: center; justify-content: center; flex: none; border-radius: 50%; border: 2px solid #c5a47e; background: #1f1f1f; color: #c5a47e; font-weight: 800; overflow: hidden; }
.rt-root .rt-face img { width: 100%; height: 100%; object-fit: cover; }
.rt-root .rt-name { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; }
.rt-root .rt-name b { color: #e8e8e8; font-size: 14px; }
.rt-root .rt-rating { color: #c5a47e; border: 1px solid #c5a47e; border-radius: 4px; padding: 0 4px; font-size: 10px; }
.rt-root .rt-stage { color: #666; font-size: 11px; }
.rt-root .rt-text { color: #e8e8e8; margin: 10px 0; line-height: 1.65; font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.rt-root .rt-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.rt-root .rt-tag { padding: 2px 9px; border-radius: 999px; border: 1px solid #2a2a2a; background: #1f1f1f; color: #c5a47e; font-size: 11px; font-family: inherit; }
.rt-root .rt-comments { background: #1f1f1f; border-radius: 8px; padding: 8px 10px; margin-top: 8px; }
.rt-root .rt-comments p { color: #a0a0a0; margin: 3px 0; font-size: 12.5px; line-height: 1.5; }
.rt-root .rt-comments b { color: #c5a47e; }
.rt-root .rt-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.rt-root .rt-btn2 { padding: 5px 12px; border-radius: 8px; border: 1px solid #2a2a2a; background: #1f1f1f; color: #e8e8e8; font-size: 12px; font-family: inherit; }
.rt-root .rt-btn2.gold { border-color: #c5a47e; color: #c5a47e; }
.rt-root .rt-btn2.primary { background: #c5a47e; color: #0a0a0a; border-color: #c5a47e; font-weight: 700; }
.rt-root .rt-photo img { border: 1px solid #2a2a2a; border-radius: 10px; display: block; max-width: 100%; max-height: 320px; object-fit: cover; margin: 8px 0; }
.rt-root .rt-note { color: #a0a0a0; font-size: 12px; padding: 6px 0; font-family: inherit; }
.rt-root .rt-empty { text-align: center; color: #666; padding: 40px 12px; font-size: 13px; }
.rt-root .rt-empty b { display: block; color: #a0a0a0; font-size: 15px; margin-bottom: 6px; }
.rt-root .rt-sec { color: #c5a47e; font-size: 12px; letter-spacing: .1em; margin: 14px 0 6px; font-weight: 700; }
.rt-root .rt-profile-head { text-align: center; padding: 16px 0 10px; }
.rt-root .rt-profile-avatar { margin: 0 auto 10px; }
.rt-root .rt-profile-name { margin: 0; font-size: 21px; color: #e8e8e8; }
.rt-root .rt-profile-meta { color: #a0a0a0; font-size: 12.5px; margin-top: 4px; }
.rt-root .rt-grid { display: grid; grid-template-columns: auto 1fr; gap: 9px 14px; padding: 14px; background: #141414; border: 1px solid #2a2a2a; border-radius: 11px; margin: 12px 0; }
.rt-root .rt-grid .k { color: #666; font-size: 11.5px; }
.rt-root .rt-grid .v { color: #e8e8e8; font-size: 13px; }
.rt-root .rt-review { color: #a0a0a0; border-left: 2px solid #c5a47e; padding-left: 10px; margin: 8px 0; font-size: 12.5px; line-height: 1.6; }
.rt-root .rt-row { display: flex; justify-content: space-between; align-items: center; padding: 11px 12px; background: #141414; border: 1px solid #2a2a2a; border-radius: 10px; margin: 6px 0; width: 100%; text-align: left; font-family: inherit; }
.rt-root .rt-row strong { color: #e8e8e8; font-size: 14px; display: block; }
.rt-root .rt-row small { color: #a0a0a0; font-size: 11.5px; display: block; margin-top: 2px; }
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

  function topBar(showSearch) {
    if (profileId) {
      return `<div class="rt-top"><div class="rt-backbar"><button type="button" class="rt-back" data-action="root-back" aria-label="返回">${icon('back')}</button><b>档案</b></div></div>`;
    }
    const bar = showSearch
      ? `<div class="rt-bar"><input type="search" data-field="root-search" aria-label="搜索" placeholder="搜名字或标签，AI 生成"><button type="button" data-action="root-do-search">搜索</button><button type="button" class="rt-sq" data-action="root-refresh" aria-label="刷新">${icon('refresh')}</button></div>`
      : '';
    const tabs = `<div class="rt-tabs">${tabDef()[2].map(([id, name]) => `<button type="button" class="rt-tab" data-action="root-sub" data-sub="${id}"${sub === id ? ' data-on' : ''}>${name}</button>`).join('')}</div>`;
    return `<div class="rt-top">${tabs}${bar}</div>`;
  }

  function dock() {
    return `<div class="rt-dock">${TABS.map(([id, name]) => `<button type="button" data-action="root-tab" data-tab="${id}"${tab === id ? ' data-on' : ''}>${name}</button>`).join('')}</div>`;
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

  function post(p, state, allowApply) {
    const t = state.猎物库?.[p.猎物ID];
    const name = t?.基础档案?.姓名 || '未知';
    const rating = t?.基础档案?.评级 || '原矿';
    const stage = t?.配种信息?.开发阶段;
    const tags = String(p.标签 || '').split(/\s+/).filter(Boolean);
    return `<div class="rt-post">
      <div class="rt-post-head">
        <button type="button" style="border:none;background:none;padding:0" data-action="root-profile" data-id="${esc(p.猎物ID)}" aria-label="看 ${esc(name)} 的档案">${face(name, 38)}</button>
        <div class="rt-name"><b>${esc(name)}</b><span class="rt-rating">${esc(rating)}</span>${stage !== undefined ? `<span class="rt-stage">${esc(STAGES[stage] || '')}</span>` : ''}</div>
      </div>
      <p class="rt-text">${esc(p.文案)}</p>
      ${photo(p)}
      ${tags.length ? `<div class="rt-tags">${tags.map(tag => `<button type="button" class="rt-tag" data-action="root-search" data-tag="${esc(tag)}">${esc(tag)}</button>`).join('')}</div>` : ''}
      ${p.评论区?.length ? `<div class="rt-comments">${p.评论区.map(c => `<p><b>${esc(c.留言者)}</b>：${esc(c.内容)}</p>`).join('')}</div>` : ''}
      <div class="rt-actions"><button type="button" class="rt-btn2" data-action="root-profile" data-id="${esc(p.猎物ID)}">看档案</button><button type="button" class="rt-btn2" data-action="root-chat" data-id="${esc(p.猎物ID)}">私聊</button>${allowApply ? `<button type="button" class="rt-btn2 gold" data-action="root-apply" data-id="${esc(p.猎物ID)}">申请配种</button>` : ''}</div>
    </div>`;
  }

  function feedBody(state, feed, title, hint, allowApply) {
    const q = search.trim().toLowerCase();
    const rows = feed.filter(p => {
      const t = state.猎物库?.[p.猎物ID];
      if (!q) return true;
      return (p.文案 || '').toLowerCase().includes(q) || (p.标签 || '').toLowerCase().includes(q) || (t?.基础档案?.姓名 || '').toLowerCase().includes(q);
    });
    return `<div class="rt-sec">${esc(title)}</div>`
      + (q ? `<p class="rt-note">搜索「${esc(search)}」<button type="button" class="rt-btn2" data-action="root-clear-search">清除</button></p>` : '')
      + (rows.length ? rows.map(p => post(p, state, allowApply)).join('')
        : `<div class="rt-empty"><b>${esc(q ? '没有匹配的帖子' : '还没有帖子')}</b>${esc(q ? '换个关键词试试。' : '点右上角刷新，刷出新猎物。')}</div>`)
      + (hint ? `<p class="rt-note">${esc(hint)}</p>` : '');
  }

  function profileBody(state) {
    const t = state.猎物库?.[profileId];
    if (!t) return '<div class="rt-empty"><b>找不到这个人</b></div>';
    const p = t.基础档案, b = t.配种信息;
    const posts = [...(state.猎场流 || []), ...(state.广场流 || [])].filter(x => x.猎物ID === profileId);
    return `<div class="rt-profile-head">
        <div class="rt-profile-avatar">${face(p.姓名, 68)}</div>
        <h2 class="rt-profile-name">${esc(p.姓名)}</h2>
        <div class="rt-profile-meta"><span class="rt-rating">${esc(p.评级 || '原矿')}</span> · ${esc(p.职业 || '未知')}${p.籍贯 ? ' · ' + esc(p.籍贯) : ''}</div>
      </div>
      <div class="rt-grid">
        <span class="k">病理档案</span><span class="v" style="color:#c96b6b">${esc(p.疾病 || '未知')}</span>
        <span class="k">基础参数</span><span class="v">${esc(p.年龄 || '?')}岁 · ${esc(p.身高 || '?')} · ${esc(p.体重 || '?')}</span>
        <span class="k">肉体维度</span><span class="v">${esc(p.体型 || '?')}</span>
        <span class="k">精神刻写</span><span class="v">${esc(p.性格 || '?')}</span>
        <span class="k">外貌</span><span class="v">${esc(p.外貌 || '?')}</span>
        <span class="k">性器规格</span><span class="v">${esc(p.尺寸描述 || '?')}</span>
        <span class="k">开发记录</span><span class="v" style="color:#c5a47e;font-weight:700">已配种 ${esc(b.配种次数 || 0)} 次 · Lv.${esc(b.开发阶段 || 0)} ${esc(STAGES[b.开发阶段] || '')}</span>
      </div>
      <button type="button" class="rt-btn2 primary" style="width:100%" data-action="root-chat" data-id="${esc(profileId)}">调出加密通讯</button>
      <div class="rt-sec">主页动态</div>
      ${posts.length ? posts.map(x => `<div class="rt-review">${esc(x.文案)}</div>`).join('') : '<p class="rt-note">还没有帖子。</p>'}`;
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
    v.draw(`${topBar(showSearch)}<div class="rt-scroll">${body(state)}</div>${dock()}`);
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
      gallery: {items: versions.map(x => ({src: x.src, alt: cap, info: x.photo.info})), index: Math.max(0, versions.findIndex(x => x.photoId === p.photoId))},
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
