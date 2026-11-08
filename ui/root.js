// 根源重塑 App：壳子（复现阶段——两级导航骨架 + 假数据占位）。
// 底部 4 个主栏目：猎场 / 马厩 / 工坊 / 我的；每个主栏目内上栏切子页。
import {createView, esc, btn, heading, groupTitle, empty} from './common.js';
import {icon} from './icons.js';

const TABS = [
  ['hunt', '猎场', [['hunt-feed', '猎场'], ['showcase', '便器广场']]],
  ['stable', '马厩', [['messages', '消息'], ['my-stable', '我的便器'], ['trophy', '战利品']]],
  ['workshop', '工坊', [['locations', '地点'], ['items', '物品']]],
  ['me', '我的', [['account', '账号与晋升'], ['rules', '配种者守则'], ['settings', '设置']]],
];

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

  // 假数据占位
  function huntFeed() {
    const rows = [
      {name: '林奕川', rating: '原矿', tags: '#体育生 #19岁 #阳痿', text: '大一体育生，最近总觉得自己不行，求大佬指点。'},
      {name: '萧战', rating: '精雕', tags: '#退役特种兵 #精雕 #傲娇', text: '退役特种兵，肌肉能夹死你，但前列腺比谁都敏感。'},
      {name: '阿尔法', rating: '宝玉', tags: '#兽人 #Alpha #指挥官', text: '军团指挥官，信息素暴走，求二次觉醒。'},
    ];
    return `<div class="group">${rows.map(r => `<button class="list-row" data-action="root-open" data-name="${esc(r.name)}"><span><strong>${esc(r.name)}</strong><small>${esc(r.rating)} · ${esc(r.tags)}</small><small>${esc(r.text)}</small></span>${icon('next')}</button>`).join('')}</div>`;
  }

  function locations() {
    const rows = [
      {name: '隔音私人诊室', cost: 20, level: 1},
      {name: '深夜体育馆更衣室', cost: 100, level: 2},
      {name: '双面镜审讯室', cost: 800, level: 3},
      {name: '商场无性别公厕', cost: 5000, level: 4},
      {name: '活体家具展示厅', cost: 0, level: 5},
    ];
    return `<div class="group">${rows.map(r => `<button class="list-row" data-action="root-open" data-name="${esc(r.name)}"><span><strong>${esc(r.name)}</strong><small>Lv.${r.level} · ${r.cost === 0 ? '免费' : r.cost + ' 积分'}</small></span>${icon('next')}</button>`).join('')}</div>`;
  }

  function items() {
    const rows = [
      {name: '医用级冷钢扩肛器', cost: 10, dev: 1},
      {name: '高频电击共振跳蛋', cost: 50, dev: 2},
      {name: '前列腺高潮电击仪', cost: 400, dev: 3},
      {name: '工业级全自动抽插机', cost: 2500, dev: 4},
      {name: '脑神经快感重塑头盔', cost: 0, dev: 5},
    ];
    return `<div class="group">${rows.map(r => `<button class="list-row" data-action="root-open" data-name="${esc(r.name)}"><span><strong>${esc(r.name)}</strong><small>开发 Lv.${r.dev} · ${r.cost === 0 ? '免费' : r.cost + ' 积分'}</small></span>${icon('next')}</button>`).join('')}</div>`;
  }

  function account() {
    return `<div class="group pad">
      <p class="hint">假数据占位：账户与晋升、资金、积分后续接入。</p>
      <div class="list-row"><span><strong>等级</strong><small>体验者</small></span></div>
      <div class="list-row"><span><strong>资金</strong><small>¥0</small></span></div>
      <div class="list-row"><span><strong>积分</strong><small>0</small></span></div>
    </div>`;
  }

  function renderPage() {
    if (sub === 'hunt-feed') return groupTitle('猎场信息流') + huntFeed() + `<p class="hint" style="margin:8px">壳子阶段：假数据，刷新 / 搜索 / 聊天后续接入。</p>`;
    if (sub === 'locations') return groupTitle('工坊 · 地点') + locations();
    if (sub === 'items') return groupTitle('工坊 · 物品') + items();
    if (sub === 'account') return groupTitle('账号与晋升') + account();
    if (sub === 'rules') return groupTitle('配种者守则') + `<div class="group pad"><p class="hint">行为保密、开发原则、积分系统、便器评级、开发程度、晋升条例——后续从世界书同步。</p></div>`;
    return groupTitle(subName(sub)) + `<div class="group pad">${empty('还在搭壳子', '这个页面先占位，功能后续逐个接入。', 'bubble')}</div>`;
  }

  function render() {
    v.draw(heading('根源重塑', btn('root-refresh', icon('refresh'), 'round-button', 'aria-label="刷新（占位）"'), 'Root Rebirth')
      + subTabs()
      + renderPage()
      + bottomTabs());
  }

  v.on('click', '[data-action]', el => {
    const action = el.dataset.action;
    if (action === 'root-tab') { tab = el.dataset.tab; sub = tabDef()[2][0][0]; render(); }
    else if (action === 'root-sub') { sub = el.dataset.sub; render(); }
    else if (action === 'root-refresh') ctx.notify('刷新功能后续接入');
    else if (action === 'root-open') ctx.notify(`「${el.dataset.name}」的详情后续接入`);
  });

  render();
  return v;
}
