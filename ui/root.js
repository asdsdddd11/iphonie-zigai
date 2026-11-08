// 根源重塑 App：线上独立于正文。猎场 / 便器广场是帖子流，刷新追加新帖。
import {createView, esc, btn, heading, groupTitle, empty} from './common.js';
import {icon} from './icons.js';

const TABS = [
  ['hunt', '猎场', [['hunt-feed', '猎场'], ['showcase', '便器广场']]],
  ['stable', '马厩', [['messages', '消息'], ['my-stable', '我的便器'], ['trophy', '战利品']]],
  ['workshop', '工坊', [['locations', '地点'], ['items', '物品']]],
  ['me', '我的', [['account', '账号与晋升'], ['rules', '配种者守则'], ['settings', '设置']]],
];
const LEVELS = {1: '体验者', 2: '播种机', 3: '调教师', 4: '处刑官', 4.5: '准牧场主', 5: '牧场主'};
const STAGES = {0: '未调教', 1: '初诊期', 2: '崩坏期', 3: '成瘾期', 4: '改写期', 5: '重塑期'};

export function rootApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'root');
  let tab = 'hunt', sub = 'hunt-feed', search = '';

  const tabDef = () => TABS.find(t => t[0] === tab);
  const subName = id => tabDef()[2].find(s => s[0] === id)?.[1] || id;

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

  function feedRow(p, state) {
    const t = state.猎物库?.[p.猎物ID];
    const name = t?.基础档案?.姓名 || '未知';
    const rating = t?.基础档案?.评级 || '原矿';
    const stage = t?.配种信息?.开发阶段;
    const tags = String(p.标签 || '').split(/\s+/).filter(Boolean);
    return `<div class="root-post">
      <div class="root-post-head"><b>${esc(name)}</b><span class="plate">${esc(rating)}</span>${stage ? `<span class="hint">${esc(STAGES[stage] || '')}</span>` : ''}</div>
      <p class="root-post-text">${esc(p.文案)}</p>
      ${p.媒体描述 ? `<p class="root-post-media">${esc(p.媒体描述)}</p>` : ''}
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

  function stableRows(state) {
    const rows = (state.马厩 || []).map(id => [id, state.猎物库?.[id]]).filter(([, t]) => t);
    return rows.length ? `<div class="group">${rows.map(([id, t]) => {
      const p = t.基础档案, b = t.配种信息;
      return `<button class="list-row" data-action="root-profile" data-id="${esc(id)}"><span><strong>${esc(p.姓名)}</strong><small>${esc(p.评级)} · ${esc(STAGES[b.开发阶段] || '')}</small></span>${icon('next')}</button>`;
    }).join('')}</div>` : `<div class="group pad">${empty('还没有收下的便器', '申请配种、线下调教后进马厩。', 'house')}</div>`;
  }

  function renderPage(state) {
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
    const state = await api.rootState().catch(() => null) || {};
    v.draw(heading('根源重塑', '', 'Root Rebirth') + subTabs() + renderPage(state) + bottomTabs());
  }

  v.on('click', '[data-action]', async el => {
    const action = el.dataset.action;
    if (action === 'root-tab') { tab = el.dataset.tab; sub = tabDef()[2][0][0]; search = ''; render(); }
    else if (action === 'root-sub') { sub = el.dataset.sub; search = ''; render(); }
    else if (action === 'root-refresh') {
      await v.busy(el, async () => {
        const n = sub === 'showcase' ? await api.rootShowcase() : await api.rootHunt();
        ctx.notify(`刷出 ${n} 条${sub === 'showcase' ? '广场' : '猎场'}帖子`);
        render();
      });
    }
    else if (action === 'root-search') { search = el.dataset.tag; render(); }
    else if (action === 'root-clear-search') { search = ''; render(); }
    else if (action === 'root-profile') ctx.notify('档案后续接入');
    else if (action === 'root-apply') ctx.notify('申请配种后续接入');
  });

  render();
  return v;
}
