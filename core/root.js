// 根源重塑 App 的状态库（线上独立于正文，存本地 apps store）。
// 结构参考世界书的 stat_data，但精简成 App 线上需要的最小集。
export const ROOT_LIMITS = Object.freeze({targets: 60, messages: 200, posts: 6, trophies: 100, text: 2000, line: 60});

const clip = (v, max) => String(v ?? '').slice(0, max);
const num = (v, fallback) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

export function defaultRootState() {
  return {
    用户: { 名称: '', 等级: 1, 资金: 100000, 积分: 100 },
    猎物库: {},   // {id: {基础档案:{...}, 配种信息:{...}, 主页动态:[{文案,媒体类型,媒体描述,标签}]}}
    马厩: [],      // [id]（引用猎物库里的目标）
    消息: {},      // {id: [{from:'me'|'ta', text, at}]}
    奖杯: [],      // [{at, 地点, 内容, 纪念品}]
    持仓: { 地点: [], 道具: [] },
  };
}

function normalizeProfile(p = {}) {
  return {
    姓名: clip(p.姓名, ROOT_LIMITS.line), 评级: clip(p.评级, 20) || '原矿', 疾病: clip(p.疾病, 60),
    年龄: num(p.年龄, 18), 外貌: clip(p.外貌, 200), 职业: clip(p.职业, 60), 籍贯: clip(p.籍贯, 40),
    性格: clip(p.性格, 120), 体型: clip(p.体型, 60), 身高: clip(p.身高, 20), 体重: clip(p.体重, 20),
    尺寸描述: clip(p.尺寸描述, 80),
  };
}

function normalizeTarget(t = {}) {
  return {
    基础档案: normalizeProfile(t.基础档案),
    配种信息: {
      开发阶段: Math.min(5, Math.max(0, Math.round(num(t.配种信息?.开发阶段, 0)))),
      配种次数: Math.max(0, Math.round(num(t.配种信息?.配种次数, 0))),
      当前配种者: clip(t.配种信息?.当前配种者, 40) || '无',
      经手配种者: {}, 玩法历史: {}, 过往评价: {},   // 后续阶段填充
    },
    主页动态: (Array.isArray(t.主页动态) ? t.主页动态 : []).slice(0, ROOT_LIMITS.posts).map(p => ({
      文案: clip(p.文案, ROOT_LIMITS.text), 媒体类型: p.媒体类型 === 'video' ? 'video' : 'image',
      媒体描述: clip(p.媒体描述, ROOT_LIMITS.text), 标签: clip(p.标签, 200),
    })).filter(p => p.文案),
  };
}

export function normalizeRootState(value) {
  const base = defaultRootState();
  if (!value || typeof value !== 'object') return base;
  const 用户 = { ...base.用户, ...(value.用户 || {}) };
  用户.等级 = Math.min(5, Math.max(1, num(用户.等级, 1)));
  用户.资金 = Math.max(0, num(用户.资金, 0));
  用户.积分 = Math.max(0, num(用户.积分, 0));
  用户.名称 = clip(用户.名称, 40);
  const 猎物库 = {};
  for (const [id, t] of Object.entries(value.猎物库 || {}).slice(0, ROOT_LIMITS.targets)) {
    猎物库[clip(id, 100)] = normalizeTarget(t);
  }
  const 马厩 = (Array.isArray(value.马厩) ? value.马厩 : []).map(id => clip(id, 100)).filter(id => 猎物库[id]).slice(0, ROOT_LIMITS.targets);
  const 消息 = {};
  for (const [id, list] of Object.entries(value.消息 || {}).slice(0, ROOT_LIMITS.targets)) {
    if (!猎物库[id]) continue;
    消息[id] = (Array.isArray(list) ? list : []).slice(-ROOT_LIMITS.messages).map(m => ({
      from: m.from === 'ta' ? 'ta' : 'me', text: clip(m.text, ROOT_LIMITS.text), at: num(m.at, Date.now()),
    })).filter(m => m.text);
  }
  return {
    用户, 猎物库, 马厩, 消息,
    奖杯: (Array.isArray(value.奖杯) ? value.奖杯 : []).slice(-ROOT_LIMITS.trophies).map(t => ({
      at: num(t.at, Date.now()), 地点: clip(t.地点, 60), 内容: clip(t.内容, ROOT_LIMITS.text), 纪念品: clip(t.纪念品, 120),
    })).filter(t => t.内容),
    持仓: {
      地点: (Array.isArray(value.持仓?.地点) ? value.持仓.地点 : []).map(x => clip(x, 60)).filter(Boolean).slice(0, 50),
      道具: (Array.isArray(value.持仓?.道具) ? value.持仓.道具 : []).map(x => clip(x, 60)).filter(Boolean).slice(0, 50),
    },
  };
}
