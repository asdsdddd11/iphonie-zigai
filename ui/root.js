// 根源重塑 App：线上独立于正文。阶段 1 —— 读真实状态库（api.rootState），假数据换成真数据。
// 底部 4 个主栏目：猎场 / 马厩 / 工坊 / 我的；每个主栏目内上栏切子页。
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
  let tab = 'hunt', sub = 'hunt-feed';

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

  function targetRow(id, t) {
    const p = t.基础档案, b = t.配种信息;
    return `<button class="list-row" data-action="root-open" data-id="${esc(id)}"><span><strong>${esc(p.姓名 || '未命名')}</strong><small>${esc(p.评级 || '原矿')} · ${esc(STAGES[b.开发阶段] || '未调教')} · ${esc(p.职业 || '')}</small><small>${esc(p.疾病 || '')} · ${esc(p.尺寸描述 || '')}</small></span>${icon('next')}</button>`;
  }

  function renderPage(state) {
    if (sub === 'hunt-feed') {
      const list = Object.entries(state.猎物库 || {});
      return groupTitle('猎场信息流')
        + (list.length ? `<div class="group">${list.map(([id, t]) => targetRow(id, t)).join('')}</div>`
          : `<div class="group pad">${empty('还没有猎物', '刷新功能下一阶段接入，先把状态库跑通。', 'compass')}</div>`);
    }
    if (sub === 'my-stable') {
      const ids = state.马厩 || [];
      const list = ids.map(id => [id, state.猎物库?.[id]]).filter(([, t]) => t);
      return groupTitle('我的便器')
        + (list.length ? `<div class="group">${list.map(([id, t]) => targetRow(id, t)).join('')}</div>`
          : `<div class="group pad">${empty('还没有收下的便器', '猎场里锁定的目标，线下调教后会进马厩。', 'house')}</div>`);
    }
    if (sub === 'account') {
      const u = state.用户 || {};
      return groupTitle('账号与晋升')
        + `<div class="group pad">
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
    v.draw(heading('根源重塑', btn('root-refresh', icon('refresh'), 'round-button', 'aria-label="刷新（后续接入）"'), 'Root Rebirth')
      + subTabs()
      + renderPage(state)
      + bottomTabs());
  }

  v.on('click', '[data-action]', el => {
    const action = el.dataset.action;
    if (action === 'root-tab') { tab = el.dataset.tab; sub = tabDef()[2][0][0]; render(); }
    else if (action === 'root-sub') { sub = el.dataset.sub; render(); }
    else if (action === 'root-refresh') ctx.notify('猎场刷新下一阶段接入');
    else if (action === 'root-open') ctx.notify('目标档案后续接入');
  });

  render();
  return v;
}
