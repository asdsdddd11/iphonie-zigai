// 根源重塑 App 的状态库（线上独立于正文，存本地 apps store）。
// 猎场 / 便器广场是「帖子流」，和朋友圈、论坛一样：刷新追加新帖，旧帖保留。
// 规范与设定来自内置世界书 core/root-lore.js，不再读小手机外部世界书。
import {HUNT_LORE, SHOW_LORE} from './root-lore.js';

export const ROOT_LIMITS = Object.freeze({targets: 80, feeds: 200, messages: 200, comments: 4, trophies: 100, text: 2000, line: 60, tags: 200});

const clip = (v, max) => String(v ?? '').slice(0, max);
const num = (v, fallback) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

export function defaultRootState() {
  return {
    用户: { 名称: '', 等级: 1, 资金: 100000, 积分: 100 },
    猎物库: {},   // {id: {基础档案:{...}, 配种信息:{...}}}  帖子作者的完整档案
    猎场流: [],    // [{id, 猎物ID, 文案, 媒体类型, 媒体描述, 标签, 评论区:[{留言者,内容}], at}]
    广场流: [],    // 同上（成果展示动态）
    马厩: [],      // [id]（引用猎物库）
    消息: {},      // {id: [{from:'me'|'ta', text, at}]}
    奖杯: [],      // [{at, 地点, 内容, 纪念品}]
    持仓: { 地点: [], 道具: [] },
  };
}

function normalizeProfile(p = {}) {
  return {
    姓名: clip(p.姓名, ROOT_LIMITS.line), 评级: clip(p.评级, 20) || '原矿', 疾病: clip(p.疾病, 60),
    身材水平: clip(p.身材水平, 200), 颜值水平: clip(p.颜值水平, 200),
    身份反差感: clip(p.身份反差感, 200), 潜在开发价值: clip(p.潜在开发价值, 300),
    年龄: num(p.年龄, 18), 外貌: clip(p.外貌, 200), 职业: clip(p.职业, 60), 籍贯: clip(p.籍贯, 40),
    口音: clip(p.口音, 60), 隐藏习惯: clip(p.隐藏习惯, 200),
    性格: clip(p.性格, 120), 体型: clip(p.体型, 60), 身高: clip(p.身高, 20), 体重: clip(p.体重, 20),
    尺寸描述: clip(p.尺寸描述, 80), 外貌Tag: clip(p.外貌Tag, 300),
  };
}

function normalizeTarget(t = {}) {
  const 配种信息 = t.配种信息 || {};
  const count = Math.max(0, Math.round(num(配种信息.配种次数, 0)));
  const 过往评价 = {};
  for (const [k, v] of Object.entries(配种信息.过往评价 || {}).slice(0, 5)) if (String(v || '').trim()) 过往评价[clip(k, 20)] = clip(v, 200);
  const 主页动态 = {};
  for (const [k, d] of Object.entries(t.主页动态 || {}).slice(0, 10)) {
    if (!d || !d.文案) continue;
    主页动态[clip(k, 20)] = { 文案: clip(d.文案, ROOT_LIMITS.text), 媒体类型: d.媒体类型 === 'video' ? 'video' : 'image', 媒体描述: clip(d.媒体描述, ROOT_LIMITS.text), 标签: clip(d.标签, ROOT_LIMITS.tags) };
  }
  return {
    基础档案: normalizeProfile(t.基础档案),
    配种信息: {
      开发阶段: count > 0 ? stageOf(count) : Math.min(5, Math.max(0, Math.round(num(配种信息.开发阶段, 0)))),
      配种次数: count,
      当前配种者: clip(配种信息.当前配种者, 40) || '无',
      经手配种者: record(配种信息.经手配种者, 40),
      玩法历史: record(配种信息.玩法历史, 200),
      过往评价,
    },
    主页动态,
  };
}

/** [12] 那种 {H_1: 名字} / {P_1: 内容} 的结构：保留成对象，最多 20 条。 */
function record(value, max) {
  const out = {};
  for (const [k, v] of Object.entries(value || {}).slice(0, 20)) {
    const text = clip(v, max);
    if (text) out[clip(k, 20) || ('r' + Object.keys(out).length)] = text;
  }
  return out;
}

function normalizeFeed(rows) {
  return (Array.isArray(rows) ? rows : []).slice(-ROOT_LIMITS.feeds).map(p => ({
    id: clip(p.id, 100) || crypto.randomUUID(),
    归属便器ID: clip(p.归属便器ID || p.猎物ID, 100), 涉及便器ID: clip(p.涉及便器ID || p.猎物ID, 100),
    猎物ID: clip(p.猎物ID, 100),
    发布配种者: clip(p.发布配种者, 40), 配种者等级: Math.min(5, Math.max(0, num(p.配种者等级, 0))),
    文案: clip(p.文案, ROOT_LIMITS.text), 媒体类型: p.媒体类型 === 'video' ? 'video' : 'image',
    媒体描述: clip(p.媒体描述, ROOT_LIMITS.text), 标签: clip(p.标签, ROOT_LIMITS.tags),
    评论区: (Array.isArray(p.评论区) ? p.评论区 : []).slice(0, ROOT_LIMITS.comments).map(c => ({ 留言者: clip(c.留言者, 40), 内容: clip(c.内容, 200) })).filter(c => c.内容),
    imageTags: clip(p.imageTags, 600), photoId: clip(p.photoId, 100), imageState: clip(p.imageState, 20), imageNote: clip(p.imageNote, 200),
    imageVersions: (Array.isArray(p.imageVersions) ? p.imageVersions : []).map(x => clip(x, 100)).filter(Boolean),
    at: num(p.at, Date.now()),
  })).filter(p => p.文案);
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
  const 猎场流 = normalizeFeed(value.猎场流).filter(p => 猎物库[p.猎物ID]);
  const 广场流 = normalizeFeed(value.广场流).filter(p => 猎物库[p.猎物ID]);
  const 马厩 = (Array.isArray(value.马厩) ? value.马厩 : []).map(id => clip(id, 100)).filter(id => 猎物库[id]).slice(0, ROOT_LIMITS.targets);
  const 消息 = {};
  for (const [id, list] of Object.entries(value.消息 || {}).slice(0, ROOT_LIMITS.targets)) {
    if (!猎物库[id]) continue;
    消息[id] = (Array.isArray(list) ? list : []).slice(-ROOT_LIMITS.messages).map(m => ({
      from: m.from === 'ta' ? 'ta' : 'me', text: clip(m.text, ROOT_LIMITS.text), at: num(m.at, Date.now()),
    })).filter(m => m.text);
  }
  return {
    用户, 猎物库, 猎场流, 广场流, 马厩, 消息,
    奖杯: (Array.isArray(value.奖杯) ? value.奖杯 : []).slice(-ROOT_LIMITS.trophies).map(t => ({
      at: num(t.at, Date.now()), 地点: clip(t.地点, 60), 内容: clip(t.内容, ROOT_LIMITS.text), 纪念品: clip(t.纪念品, 120),
    })).filter(t => t.内容),
    持仓: {
      地点: (Array.isArray(value.持仓?.地点) ? value.持仓.地点 : []).map(x => clip(x, 60)).filter(Boolean).slice(0, 50),
      道具: (Array.isArray(value.持仓?.道具) ? value.持仓.道具 : []).map(x => clip(x, 60)).filter(Boolean).slice(0, 50),
    },
  };
}

// ---------- 猎场生成 ----------
export const HUNT_PROMPT = `${HUNT_LORE}

## 输出格式
严格按下面的排版输出，缩进一律用两个空格，不许用 Tab，不许加别的标题。一次输出 6 个便器档案和 6 条猎场帖子。

便器数据库:
  T1:
    基础档案:
      姓名: xx
      评级: xx
      疾病: xx
      年龄: xx
      外貌: 2-4 个短词，逗号分隔
      外貌tag: 英文 danbooru tag，1boy、发型发色、瞳色、体型、显眼特征
      职业: xx
      籍贯: xx
      性格: 2-3 个短词，逗号分隔
      体型: 短词
      身高: xxcm
      体重: xxkg
      尺寸描述: 正常长度/勃起长度，阳痿的勃起长度写「无法测量」
    配种信息:
      开发阶段: 0 到 5，由配种次数决定
      配种次数: 0 到 15，一批里至少 3 个是 0，剩下必须大于 0
      当前配种者: 没被收写「无」，否则写配种者网名
      经手配种者: 0 次写「无」，否则写名字，多个用 ／ 分隔
      玩法历史: 0 次写「无」，否则写玩法与次数，多个用 ／ 分隔
      过往评价: 条数等于配种次数，最多 5 条，每条 20-40 字，多个用 ／ 分隔；0 次写「无」
    主页动态:
      Post_1:
        文案: 以前的动态，口语
        媒体类型: image
        媒体描述: 画面两三句
        标签: "#xx #xx #xx #xx #xx"
      Post_2:
        文案: 以前的动态
        媒体类型: image
        媒体描述: 画面两三句
        标签: "#xx #xx #xx #xx #xx"
      Post_3:
        文案: 以前的动态
        媒体类型: image
        媒体描述: 画面两三句
        标签: "#xx #xx #xx #xx #xx"

猎场信息流:
  Hunt_1:
    归属便器ID: T1
    文案: 帖子正文，30 字以上，口语直白，要有硬货不能全是求医焦虑
    媒体类型: image
    媒体描述: 照片拍到的画面，两三句，外貌和身材写细
    标签: "#xx #xx #xx #xx #xx"
    配图: 英文 danbooru tag，贴合外貌体型职业穿着
    评论区:
      C1:
        留言者: 配种者网名
        内容: 猎手口吻，点评身体或直接约
      C2:
        留言者: 配种者网名
        内容: 猎手口吻
      C3:
        留言者: 配种者网名
        内容: 猎手口吻

T1 到 T6、Hunt_1 到 Hunt_6 依次对应，归属便器ID 必须对上。`;

// ---------- 便器广场生成 ----------
export const SHOW_PROMPT = `${SHOW_LORE}

## 输出格式
严格按照下面格式输出，一次 6 个：

【广场】
发布配种者：xx（网名或代号，像「屠夫李」「暗夜主宰」「黑桃K」「毒蛇」，绝对不是中文真名）
配种者等级：x（2 到 5）
涉及便器：xx（这个便器的真名）
档案：姓名｜评级｜疾病｜年龄｜外貌｜外貌tag｜职业｜籍贯｜性格｜体型｜身高｜体重｜尺寸描述（13 项，用｜分隔；新便器按世界书角色生成指南写）
文案：xx（必须出现这个便器的真名。要写清具体怎么玩的：用了什么道具或设备、在什么场景、什么手法、便器什么反应、开发到什么程度。不许写「玩得很爽」这种空话。几条帖子的玩法必须各不相同）
媒体描述：xx（一张照片拍到的画面，至少两三句）
标签：xx（至少 5 个，每个带 #）
配图：xx（英文 danbooru tag，贴合上面写的外貌、体型、职业和穿着，描述画面本身；拍到人写人数、动作、地点、构图；露骨可写 nsfw；不写发色/瞳色/发型，插件会带上存好的外貌；必须英文，禁止中文）
评论1：留言者名：内容
评论2：留言者名：内容
评论3：留言者名：内容`;

function parseBlocks(reply, tag) {
  const text = String(reply || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```[a-z]*\n?|```/g, '').trim();
  const out = [];
  for (const block of text.split(new RegExp(`【${tag}】`)).slice(1)) {
    const f = {};
    for (const line of block.split(/\r?\n/)) {
      const m = line.match(/^([^：:]+)[：:]\s*(.*)$/);
      if (m) f[m[1].trim().replace(/[\s_\-]/g, '').toLowerCase()] = m[2].trim();
    }
    out.push(f);
  }
  return out;
}

export function parseHunt(reply) {
  return parseBlocks(reply, '猎物').filter(f => f['姓名']);
}

/** YAML 便器块 → 档案。 */
export function huntToTargetYaml(t) {
  const p = t.档案 || {}, b = t.配种 || {};
  const count = Math.max(0, Number(b['配种次数']) || 0);
  const split = (v, max) => String(v || '').split('／').map(s => s.trim()).filter(s => s && s !== '无' && s !== '{}').slice(0, max);
  const 过往评价 = {};
  split(b['过往评价'], 5).forEach((v, i) => { 过往评价['R_' + (i + 1)] = v; });
  const 经手配种者 = {};
  split(b['经手配种者'], 20).forEach((v, i) => { 经手配种者['H_' + (i + 1)] = v; });
  const 玩法历史 = {};
  split(b['玩法历史'], 20).forEach((v, i) => { 玩法历史['P_' + (i + 1)] = v; });
  const 主页动态 = {};
  (t.动态 || []).slice(0, 3).forEach((d, i) => {
    if (d.文案) 主页动态['Post_' + (i + 1)] = { 文案: d.文案, 媒体类型: d.媒体类型 === 'video' ? 'video' : 'image', 媒体描述: d.媒体描述 || '', 标签: d.标签 || '' };
  });
  return {
    基础档案: {
      姓名: p['姓名'] || '', 评级: p['评级'] || '原矿', 疾病: p['疾病'] || '', 年龄: Number(p['年龄']) || 20,
      外貌: p['外貌'] || '', 外貌Tag: p['外貌tag'] || '',
      职业: p['职业'] || '', 籍贯: p['籍贯'] || '', 性格: p['性格'] || '', 体型: p['体型'] || '',
      身高: p['身高'] || '', 体重: p['体重'] || '', 尺寸描述: p['尺寸描述'] || '',
      身材水平: '', 颜值水平: '', 身份反差感: '', 潜在开发价值: '', 口音: '', 隐藏习惯: '',
    },
    配种信息: {
      开发阶段: count > 0 ? stageOf(count) : Math.min(5, Math.max(0, Math.round(Number(b['开发阶段']) || 0))),
      配种次数: count,
      当前配种者: String(b['当前配种者'] || '无').trim() || '无',
      经手配种者, 玩法历史, 过往评价,
    },
    主页动态,
  };
}

/** YAML 猎场帖子块 → 帖子。 */
export function huntToFeedYaml(h, 猎物ID, at) {
  const p = h.帖子 || {};
  return {
    id: crypto.randomUUID(),
    归属便器ID: 猎物ID, 猎物ID, 涉及便器ID: 猎物ID,
    发布配种者: String(p['发布配种者'] || '').trim(),
    配种者等级: Math.min(5, Math.max(0, Number(p['配种者等级']) || 0)),
    文案: p['文案'] || '', 媒体类型: p['媒体类型'] === 'video' ? 'video' : 'image',
    媒体描述: p['媒体描述'] || '', 标签: p['标签'] || '',
    评论区: (h.评论区 || []).filter(c => c.内容).map(c => ({ 留言者: c.留言者 || '', 内容: c.内容 })),
    imageTags: p['配图'] || '', photoId: '', imageState: '', imageNote: '', imageVersions: [], at: at || Date.now(),
  };
}

/** 解析 [12] 那种 YAML 风格输出：便器数据库 + 猎场信息流。 */
export function parseHuntYaml(reply) {
  const text = String(reply || '')
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/```[a-z]*\n?|```/g, '');
  const lines = text.split(/\r?\n/);
  const targets = [], hunts = [];
  let cur = null, section = '', post = null, comment = null;
  const strip = s => String(s || '').trim().replace(/^["'"']|["'"']$/g, '');
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^ */)[0].length;
    const m = raw.match(/^\s*([^:：]+)[：:]\s*(.*)$/);
    if (!m) continue;
    const key = strip(m[1]);
    const val = strip(m[2]);

    if (/^T\d+$/.test(key) && indent <= 2) {
      cur = {kind: 'target', id: key, 档案: {}, 配种: {}, 动态: []};
      targets.push(cur); section = ''; post = null; comment = null; continue;
    }
    if (/^Hunt_\d+$/.test(key) && indent <= 2) {
      cur = {kind: 'hunt', id: key, 帖子: {}, 评论区: []};
      hunts.push(cur); section = ''; post = null; comment = null; continue;
    }
    if (!cur) continue;

    if (['基础档案', '配种信息', '主页动态', '评论区'].includes(key) && indent <= 4) {
      section = key; post = null; comment = null; continue;
    }

    if (cur.kind === 'target') {
      if (section === '基础档案') { cur.档案[key] = val; continue; }
      if (section === '配种信息') { cur.配种[key] = val; continue; }
      if (section === '主页动态') {
        if (/^Post_\d+$/.test(key)) { post = {文案: '', 媒体类型: 'image', 媒体描述: '', 标签: ''}; cur.动态.push(post); continue; }
        if (post) {
          if (key === '文案') post.文案 = val;
          else if (key === '媒体类型') post.媒体类型 = val;
          else if (key === '媒体描述') post.媒体描述 = val;
          else if (key === '标签') post.标签 = val;
        }
        continue;
      }
    } else {
      if (section === '评论区') {
        if (/^C\d+$/.test(key)) { comment = {留言者: '', 内容: ''}; cur.评论区.push(comment); continue; }
        if (comment) {
          if (key === '留言者') comment.留言者 = val;
          else if (key === '内容') comment.内容 = val;
        }
        continue;
      }
      cur.帖子[key] = val;
      continue;
    }
  }
  return {targets, hunts};
}

/** 广场帖子里「档案」那一行（姓名｜评级｜疾病…）按顺序填回字段，用于新造有主便器。 */
const SHOW_KEYS = ['姓名', '评级', '疾病', '年龄', '外貌', '外貌tag', '职业', '籍贯', '性格', '体型', '身高', '体重', '尺寸描述'];
function expandArchive(f, keys) {
  const raw = String(f['档案'] || '').trim();
  if (!raw) return f;
  const parts = raw.split(/[｜|]/).map(s => s.trim());
  const out = { ...f };
  keys.forEach((k, i) => { if (parts[i]) out[k] = parts[i]; });
  return out;
}

export function parseShow(reply) {
  return parseBlocks(reply, '广场').map(f => expandArchive(f, SHOW_KEYS)).filter(f => f['发布配种者'] || f['涉及便器'] || f['作者']);
}

// 世界书 [4]：开发阶段由配种次数决定。
export function stageOf(count) {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 0) return 0;
  if (n <= 2) return 1;
  if (n <= 5) return 2;
  if (n <= 10) return 3;
  if (n <= 20) return 4;
  return 5;
}

export function huntToTarget(f) {
  const count = Math.max(0, Number(f['配种次数']) || 0);
  const 过往评价 = {};
  String(f['过往评价'] || '').split('／').map(s => s.trim()).filter(Boolean).slice(0, 5).forEach((text, i) => { 过往评价['R_' + (i + 1)] = text; });
  const 经手配种者 = {};
  String(f['经手配种者'] || '').split('／').map(s => s.trim()).filter(Boolean).slice(0, 20).forEach((text, i) => { 经手配种者['H_' + (i + 1)] = text; });
  const 玩法历史 = {};
  String(f['玩法历史'] || '').split('／').map(s => s.trim()).filter(Boolean).slice(0, 20).forEach((text, i) => { 玩法历史['P_' + (i + 1)] = text; });
  const 主页动态 = {};
  for (let i = 1; i <= 3; i++) {
    const row = String(f['主页动态' + i] || '').trim();
    if (!row) continue;
    const [文案, 媒体描述, 标签] = row.split(/[｜|]/).map(s => (s || '').trim());
    if (文案) 主页动态['Post_' + i] = { 文案, 媒体类型: 'image', 媒体描述: 媒体描述 || '', 标签: 标签 || '' };
  }
  if (!Object.keys(主页动态).length) {
    let dynRows = String(f['过往动态'] || '').split('／').map(s => s.trim()).filter(Boolean);
    if (dynRows.length <= 1) dynRows = String(f['过往动态'] || '').split(/\s*\d+[.、．]\s*/).map(s => s.trim()).filter(Boolean);
    dynRows.slice(0, 3).forEach((row, i) => {
      const [文案, 媒体描述, 标签] = row.split(/[｜|]/).map(s => (s || '').trim());
      if (文案) 主页动态['Post_' + (i + 1)] = { 文案, 媒体类型: 'image', 媒体描述: 媒体描述 || '', 标签: 标签 || '' };
    });
  }
  return {
    基础档案: {
      姓名: f['姓名'] || '', 评级: f['评级'] || '原矿', 疾病: f['疾病'] || '', 年龄: Number(f['年龄']) || 20,
      身材水平: f['身材水平'] || '', 颜值水平: f['颜值水平'] || '', 身份反差感: f['身份反差感'] || '', 潜在开发价值: f['潜在开发价值'] || '',
      外貌: f['外貌'] || '', 职业: f['职业'] || '', 籍贯: f['籍贯'] || '', 口音: f['口音'] || '', 隐藏习惯: f['隐藏习惯'] || '',
      性格: f['性格'] || '',
      体型: f['体型'] || '', 身高: f['身高'] || '', 体重: f['体重'] || '', 尺寸描述: f['尺寸描述'] || '',
      外貌Tag: f['外貌tag'] || '',
    },
    配种信息: {
      开发阶段: count > 0 ? stageOf(count) : Math.min(5, Math.max(0, Math.round(Number(f['开发阶段']) || 0))),
      配种次数: count,
      当前配种者: String(f['当前配种者'] || f['主人'] || '无').trim() || '无',
      经手配种者, 玩法历史, 过往评价,
    },
    主页动态,
  };
}

export function huntToFeed(f, 猎物ID, at) {
  const comments = [];
  for (const k of ['评论1', '评论2', '评论3']) if (f[k]) {
    const [留言者, 内容] = f[k].split(/[：:]/).map(s => (s || '').trim());
    if (留言者 && 内容) comments.push({ 留言者, 内容 });
  }
  return {
    id: crypto.randomUUID(),
    归属便器ID: 猎物ID, 猎物ID, 涉及便器ID: 猎物ID,
    发布配种者: String(f['发布配种者'] || '').trim(),
    配种者等级: Math.min(5, Math.max(0, Number(f['配种者等级']) || 0)),
    文案: f['文案'] || '', 媒体类型: 'image', 媒体描述: f['媒体描述'] || '', 标签: f['标签'] || '', 评论区: comments,
    imageTags: f['配图'] || '', photoId: '', imageState: '', imageNote: '', imageVersions: [], at: at || Date.now(),
  };
}
