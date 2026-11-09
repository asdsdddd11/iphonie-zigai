// 根源重塑 App：线上独立于正文。猎场 / 便器广场是帖子流，刷新追加新帖；头像可点进档案，配图可画可看大图。
import {createView, esc, btn, heading, groupTitle, empty, avatar} from './common.js';
import {icon} from './icons.js';
import {previewBlob} from './thumbs.js';
import {openImageViewer} from '../image-viewer.js';

const TABS = [
  ['hunt', '猎场', [['hunt-feed', '猎场'], ['showcase', '便器广场']]],
  ['stable', '马厩', [['messages', '消息'], ['my-stable', '我的便器'], ['trophy', '战利品']]],
  ['workshop', '工坊', [['locations', '地点'], ['items', '物品']]],
  ['me', '我的', [['account', '账号与晋升'], ['rules', '配种者守则'], ['settings', '设置']]],
];
const LEVELS = {1: '体验者', 2: '播种机', 3: '调教师', 4: '处刑官', 4.5: '准牧场主', 5: '牧场主'};
const STAGES = {0: '未调教', 1: '初诊期', 2: '崩坏期', 3: '成瘾期', 4: '改写期', 5: '重塑期'};

// 暗黑 + 鎏金（对齐 mvu 前端的配色）：只作用在根源 App 里，不影响其他 App。
const STYLE = `
.root-app { background: #0a0a0a; min-height: 100%; padding: 0 12px 20px; color: #e8e8e8; }
.root-app .page-heading h1 { color: #e8e8e8; }
.root-app .page-heading .eyebrow { color: #c5a47e; letter-spacing: .18em; }
.root-app .group-title span { color: #c5a47e; letter-spacing: .08em; }
.root-app .hint { color: #a0a0a0; }
.root-app .segmented { background: transparent; gap: 6px; }
.root-app .segmented button { background: #1f1f1f; color: #a0a0a0; border: 1px solid #2a2a2a; border-radius: 8px; }
.root-app .segmented button[aria-pressed="true"] { background: #c5a47e; color: #0a0a0a; border-color: #c5a47e; font-weight: 600; }
.root-app .group { background: transparent; }
.root-app .list-row { background: #141414; border: 1px solid #2a2a2a; border-radius: 10px; margin: 6px 0; color: #e8e8e8; }
.root-app .list-row strong { color: #e8e8e8; }
.root-app .list-row small { color: #a0a0a0; }
.root-app .plate { color: #c5a47e; border: 1px solid #c5a47e; border-radius: 4px; padding: 1px 5px; font-size: 11px; }
.root-app .chip-button { background: #1f1f1f; color: #c5a47e; border: 1px solid #2a2a2a; border-radius: 999px; }
.root-post { background: #141414; border: 1px solid #2a2a2a; border-radius: 12px; padding: 12px; margin: 10px 0; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
.root-post-head { display: flex; align-items: center; gap: 10px; }
.root-avatar { border: 2px solid #c5a47e; border-radius: 50%; padding: 0; background: #0a0a0a; overflow: hidden; }
.root-post-name { display: flex; align-items: center; gap: 6px; }
.root-post-name b { color: #e8e8e8; }
.root-post-text { color: #e8e8e8; margin: 10px 0; line-height: 1.7; }
.root-post-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.root-post-comments { background: #1f1f1f; border-radius: 8px; padding: 8px 10px; margin-top: 8px; }
.root-post-comments p { color: #a0a0a0; margin: 3px 0; font-size: 13px; }
.root-post-comments b { color: #c5a47e; }
.root-post-actions { display: flex; gap: 8px; margin-top: 10px; }
.root-photo img { border: 1px solid #2a2a2a; }
.root-app .empty h2 { color: #e8e8e8; }
.root-app .empty p { color: #a0a0a0; }
`;
function ensureStyle(doc) {
  if (!doc || doc.getElementById('root-app-style')) return;
  const style = doc.createElement('style');
  style.id = 'root-app-style';
  style.textContent = STYLE;
  doc.head.appendChild(style);
}

export function rootApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'root');
  let tab = 'hunt', sub = 'hunt-feed', search = '', profileId = '';
  const urls = new Map();

  const tabDef = () => TABS.find(t => t[0] === tab);
  const subName = id => tabDef()[2].find(s => s[0] === id)?.[1] || id;
  const face = (name, size) => avatar(name, ctx.engineOf(name), size);

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

  function bottomTabs() {
    return `<nav class="segmented" style="margin:8px 0 0;flex-wrap:nowrap">${TABS.map(([id, name]) =>
      `<button type="button" data-action="root-tab" data-tab="${id}" aria-pressed="${tab === id}">${name}</button>`).join('')}</nav>`;
  }
  function subTabs() {
    const subs = tabDef()[2];
    return `<div class="segmented" style="margin:0 0 8px">${subs.map(([id, name]) =>
      `<button type="button" data-action="root-sub" data-sub="${id}" aria-pressed="${sub === id}">${name}</button>`).join('')}</div>`;
  }
  const refreshBtn = () => btn('root-refresh', icon('refresh'), 'round-button', 'aria-label="刷新"');

  function photo(p) {
    if (p.photoId) {
      const url = urls.get(p.photoId);
      return `<button type="button" class="root-photo" data-action="root-view-photo" data-id="${esc(p.id)}"><img data-photo="${esc(p.photoId)}"${url ? ` src="${esc(url)}"` : ''} alt="配图" style="max-width:100%;max-height:320px;object-fit:cover;border-radius:10px;display:block;margin:8px 0"></button>`;
    }
    if (!p.imageTags) return '';
    if (p.imageState === 'waiting') return '<p class="moment-note">配图正在画……</p>';
    if (p.imageState === 'failed') return `<button type="button" class="moment-note" data-action="root-draw" data-id="${esc(p.id)}">${esc(p.imageNote || '配图没画出来')} · 点一下重画</button>`;
    return `<button type="button" class="moment-note" data-action="root-draw" data-id="${esc(p.id)}">这条帖子有配图 · 点一下画出来</button>`;
  }

  function feedRow(p, state) {
    const t = state.猎物库?.[p.猎物ID];
    const name = t?.基础档案?.姓名 || '未知';
    const rating = t?.基础档案?.评级 || '原矿';
    const stage = t?.配种信息?.开发阶段;
    const tags = String(p.标签 || '').split(/\s+/).filter(Boolean);
    return `<div class="root-post">
      <div class="root-post-head">
        <button type="button" class="root-avatar" data-action="root-profile" data-id="${esc(p.猎物ID)}" aria-label="看 ${esc(name)} 的档案">${face(name, 36)}</button>
        <span class="root-post-name"><b>${esc(name)}</b><span class="plate">${esc(rating)}</span>${stage ? `<span class="hint">${esc(STAGES[stage] || '')}</span>` : ''}</span>
      </div>
      <p class="root-post-text">${esc(p.文案)}</p>
      ${photo(p)}
      <div class="root-post-tags">${tags.map(tag => `<button type="button" class="chip-button" data-action="root-search" data-tag="${esc(tag)}">${esc(tag)}</button>`).join('')}</div>
      ${p.评论区?.length ? `<div class="root-post-comments">${p.评论区.map(c => `<p><b>${esc(c.留言者)}</b>：${esc(c.内容)}</p>`).join('')}</div>` : ''}
      <div class="root-post-actions">${btn('root-profile', '看档案', 'text-button', `data-id="${esc(p.猎物ID)}"`)}${btn('root-apply', '申请配种', 'chip-button', `data-id="${esc(p.猎物ID)}"`)}</div>
    </div>`;
  }

  function feedPage(state, feed, title, hint) {
    const q = search.toLowerCase();
    const rows = feed.filter(p => {
      const t = state.猎物库?.[p.猎物ID];
      if (!q) return true;
      return (p.文案 || '').toLowerCase().includes(q) || (p.标签 || '').toLowerCase().includes(q) || (t?.基础档案?.姓名 || '').toLowerCase().includes(q);
    });
    return groupTitle(title, refreshBtn())
      + (search ? `<p class="hint" style="margin:0 8px">搜索「${esc(search)}」<button type="button" class="text-button" data-action="root-clear-search">清除</button></p>` : '')
      + (rows.length ? `<div class="group root-feed">${rows.map(p => feedRow(p, state)).join('')}</div>`
        : `<div class="group pad">${empty(search ? '没有匹配的帖子' : '还没有帖子', search ? '换个关键词试试。' : '点右上角刷新，刷出新猎物。', 'compass')}</div>`)
      + (hint ? `<p class="hint" style="margin:8px">${esc(hint)}</p>` : '');
  }

  function profilePage(state) {
    const t = state.猎物库?.[profileId];
    if (!t) return groupTitle('档案') + `<div class="group pad">${empty('找不到这个人', '', 'person')}</div>`;
    const p = t.基础档案, b = t.配种信息;
    const row = (k, v) => `<div class="list-row"><span><strong>${esc(k)}</strong><small>${esc(v || '—')}</small></span></div>`;
    return groupTitle('档案', btn('root-back', icon('back'), 'round-button', 'aria-label="返回"'))
      + `<div class="group pad">
        <p style="text-align:center;margin:8px 0">${face(p.姓名, 72)}</p>
        ${row('姓名', p.姓名)}${row('评级', p.评级)}${row('疾病', p.疾病)}${row('年龄', p.年龄)}${row('外貌', p.外貌)}${row('职业', p.职业)}${row('籍贯', p.籍贯)}${row('性格', p.性格)}${row('体型', p.体型)}${row('身高', p.身高)}${row('体重', p.体重)}${row('尺寸', p.尺寸描述)}${row('开发阶段', STAGES[b.开发阶段] || '')}${row('配种次数', b.配种次数)}
      </div>`
      + `<div class="actions">${btn('root-apply', '申请配种', 'primary', `data-id="${esc(profileId)}"`)}</div>`;
  }

  function stableRows(state) {
    const rows = (state.马厩 || []).map(id => [id, state.猎物库?.[id]]).filter(([, t]) => t);
    return rows.length ? `<div class="group">${rows.map(([id, t]) => {
      const p = t.基础档案, b = t.配种信息;
      return `<button class="list-row" data-action="root-profile" data-id="${esc(id)}"><span><strong>${esc(p.姓名)}</strong><small>${esc(p.评级)} · ${esc(STAGES[b.开发阶段] || '')}</small></span>${icon('next')}</button>`;
    }).join('')}</div>` : `<div class="group pad">${empty('还没有收下的便器', '申请配种、线下调教后进马厩。', 'house')}</div>`;
  }

  function renderPage(state) {
    if (profileId) return profilePage(state);
    if (sub === 'hunt-feed') return feedPage(state, state.猎场流 || [], '猎场信息流', '帖子累积保留，刷新追加新帖。');
    if (sub === 'showcase') return feedPage(state, state.广场流 || [], '便器广场', '配种成果展示。');
    if (sub === 'my-stable') return groupTitle('我的便器') + stableRows(state);
    if (sub === 'account') {
      const u = state.用户 || {};
      return groupTitle('账号与晋升') + `<div class="group pad">
        <div class="list-row"><span><strong>名称</strong><small>${esc(u.名称 || '未设置')}</small></span></div>
        <div class="list-row"><span><strong>等级</strong><small>${esc(LEVELS[u.等级] || u.等级 || '')}</small></span></div>
        <div class="list-row"><span><strong>资金</strong><small>¥${esc(u.资金 ?? 0)}</small></span></div>
        <div class="list-row"><span><strong>积分</strong><small>${esc(u.积分 ?? 0)}</small></span></div>
      </div>`;
    }
    if (sub === 'rules') return groupTitle('配种者守则') + `<div class="group pad"><p class="hint">行为保密、开发原则、积分系统、便器评级、开发程度、晋升条例——后续从世界书同步。</p></div>`;
    if (sub === 'locations' || sub === 'items') return groupTitle(subName(sub)) + `<div class="group pad">${empty('工坊待接入', '地点和物品后续阶段接进来。', 'wrench')}</div>`;
    return groupTitle(subName(sub)) + `<div class="group pad">${empty('还在搭', '这个页面先占位。', 'bubble')}</div>`;
  }

  async function render() {
    ensureStyle(ctx.doc);
    const state = await api.rootState().catch(() => null) || {};
    v.draw(`<div class="root-app">${heading('根源重塑', '', 'Root Rebirth') + subTabs() + renderPage(state) + bottomTabs()}</div>`);
    loadPhotos();
  }

  /** 帖子配图：点开看大图（多版左右滑、看参数、下载、分享、收藏，和朋友圈一样）。 */
  async function viewPhoto(postId) {
    const state = await api.rootState().catch(() => null) || {};
    const post = [...(state.猎场流 || []), ...(state.广场流 || [])].find(p => p.id === postId);
    if (!post?.photoId) return;
    const versions = [];
    for (const photoId of [...new Set([...(post.imageVersions || []), post.photoId].filter(Boolean))]) {
      try { const photo = await api.getPhoto(photoId); if (photo) versions.push({photoId, photo, src: await urlFor(photoId)}); } catch {}
    }
    if (!versions.length) return;
    openImageViewer({doc: ctx.doc, caption: post.文案 || '', gallery: {items: versions.map(x => ({src: x.src, alt: post.文案 || '', info: x.photo.info})), index: Math.max(0, versions.findIndex(x => x.photoId === post.photoId))}});
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
        ctx.notify(`刷出 ${n} 条${sub === 'showcase' ? '广场' : '猎场'}帖子`);
        render();
      });
    }
    else if (action === 'root-search') { search = el.dataset.tag; render(); }
    else if (action === 'root-clear-search') { search = ''; render(); }
    else if (action === 'root-draw') {
      await v.busy(el, async () => { await api.rootDrawImage(el.dataset.id); render(); });
    }
    else if (action === 'root-view-photo') viewPhoto(el.dataset.id);
    else if (action === 'root-apply') ctx.notify('申请配种后续接入');
  });

  render();
  return v;
}
