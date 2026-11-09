// 根源重塑 App 的状态库（线上独立于正文，存本地 apps store）。
// 猎场 / 便器广场是「帖子流」，和朋友圈、论坛一样：刷新追加新帖，旧帖保留。
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
      经手配种者: {}, 玩法历史: {}, 过往评价,
    },
    主页动态,
  };
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
export const HUNT_PROMPT = `你在为「根源重塑」暗网平台生成猎场信息流（HuntFeed）。严格按世界书规则来。

【世界书 · 猎场信息流】
- 数量与状态：每次刷新至少 6 条动态！其中至少 3 条必须是配种次数为 0、完全未接受过调教的直男，注意顺序打乱。绝对禁止出现用户的便器，除非用户特意要求。
- 人群状态：可能包括，刚刚知道 app 的人，已经初步了解并寻求配种的人，已经配种过还需要配种的人，已经食髓知味的人，追求被配种的人，或者完全沉迷于快感的人，这取决于他们的性格和开发程度。
- 同一阶段也有不同表现：例如只是单纯分享生活的动态，暗含吸引别人，或是单纯的自拍、配文也与配种无关；或是嚣张地要求别人来主动求着配种，或者求别人来给他配种。
- 权限限制：搜索和展示出的猎物级别绝对不能超过用户的当前级别。
- 动态构成：媒体类型只能是 image，禁止 video（视频无法生图）。必须包含图片描述。标签至少 5 个（包含身份、职业、身材、行为等）。所有的图片都需要至少两三句话，如果出现外貌和身材需要详细描述。
- 互动性：每条动态下必须生成评论区，包含 2-3 条其他便器或配种者的回复。便器的名字必须为真名，绝对不能写「网友」「路人」「匿名」。

【世界书 · 角色生成指南】
姓名、年龄、外貌、性格、隐藏习惯严格按「角色生成指南」六个模块随机组合，绝对禁止刻板对应（名字、年龄、身材与性格之间不能有刻板对应，籍贯随机，不许地域刻板）。
严禁负面外貌（丑陋、畸形、残缺）。
严禁使用：文质彬彬、斯文败类、优雅、清秀、美丽、妖艳、土、娘、阴沉、精致、柔弱、纤细、苍白、娇弱、魅惑。
眼镜仅允许黑框，禁止金丝眼镜、无框眼镜及推眼镜的动作。

【世界书 · 评级与隐疾】
评级从低到高：原矿、粗坯、精雕、宝玉、神物。绝大多数是原矿或粗坯，精雕及以上少见。
隐疾写通俗病名：心理性阳痿、原发性勃起功能障碍、晨勃消失、硬度不足、早泄、逆行射精、射精延迟、勃起疼痛、高潮缺失、小阴茎焦虑、睾丸萎缩恐惧、无精子症、阴囊潮湿焦虑、耻骨脂肪堆积、性唤起不匹配、选择性阳痿、性表现焦虑、运动表现关联性功能障碍、成功人士压力性功能障碍。

【世界书 · 档案】
- 若疾病为阳痿，勃起长度必须写「无法测量」。
- 过往评价数量需与配种次数一致（最多 5 条），字数 20 到 40 字。配种次数为 0 就留空。
- 过往动态至少 3 条。

每个猎物严格按下面格式输出一个块：

【猎物】
姓名：xx
评级：xx
疾病：xx
年龄：xx
外貌：xx
外貌tag：xx
职业：xx
籍贯：xx
口音：xx
性格：xx
隐藏习惯：xx
体型：xx
身高：xxcm
体重：xxkg
尺寸描述：xx
配种次数：xx
文案：xx
媒体描述：xx
标签：xx
过往动态：xx
过往评价：xx
配图：xx
评论1：留言者名：内容
评论2：留言者名：内容
评论3：留言者名：内容

一次生成 6 个猎场帖子。彼此人设、职业、疾病、语气都不重复。全部新造，不要照搬示例。`;

// ---------- 便器广场生成 ----------
export const SHOW_PROMPT = `你在为「根源重塑」暗网平台生成便器广场（ShowcaseFeed）。严格按世界书规则来。

【世界书 · 便器广场】
- 数量与状态：每次同步刷新至少 6 条成果展示动态！这些动态有可能是炫耀，也有可能是分享，还有可能是求助，注意随机生成，种类不固定。
- 权限限制：用户只能看到同级或更低级别配种者发出的动态。
- 动态构成：媒体类型只能是 image，禁止 video（视频无法生图）。禁止自动生成用户自己的动态（除非明确要求）。附带标签。每条动态必须有其他配种者的回复，禁止自动生成用户自己的评论。图片描述至少两三句话，如果出现外貌和身材需要详细描述。并且配文中必须出现便器的真名。
- 标签至少 5 个。

每个帖子严格按下面格式输出一个块：

【广场】
发布配种者：xx（配种者的网名或代号，像「屠夫李」「暗夜主宰」「黑桃K」「毒蛇」这种，绝对不能是中文真名，也不能是用户本人）
配种者等级：x（2 到 5 之间的整数）
涉及便器：xx（这个便器的真名）
文案：xx（配种者视角，必须出现这个便器自己的真名，炫耀/分享/求助）
媒体描述：xx（一张照片拍到的画面，至少两三句，外貌和身材写细）
标签：xx（至少 5 个）
配图：xx
评论1：留言者名：内容
评论2：留言者名：内容
评论3：留言者名：内容

一次生成 6 个广场帖子。发布配种者和评论者都不能是用户本人，配文必须出现便器真名。`;

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

export function parseShow(reply) {
  return parseBlocks(reply, '广场').filter(f => f['发布配种者'] || f['涉及便器'] || f['作者']);
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
  String(f['过往评价'] || '').split('／').map(s => s.trim()).filter(Boolean).slice(0, 5).forEach((text, i) => { 过往评价['r' + i] = text; });
  const 主页动态 = {};
  String(f['过往动态'] || '').split('／').map(s => s.trim()).filter(Boolean).slice(0, 3).forEach((row, i) => {
    const [文案, 媒体描述, 标签] = row.split(/[｜|]/).map(s => (s || '').trim());
    if (文案) 主页动态['d' + i] = { 文案, 媒体类型: 'image', 媒体描述: 媒体描述 || '', 标签: 标签 || '' };
  });
  return {
    基础档案: {
      姓名: f['姓名'] || '', 评级: f['评级'] || '原矿', 疾病: f['疾病'] || '', 年龄: Number(f['年龄']) || 20,
      外貌: f['外貌'] || '', 职业: f['职业'] || '', 籍贯: f['籍贯'] || '', 口音: f['口音'] || '', 隐藏习惯: f['隐藏习惯'] || '',
      性格: f['性格'] || '',
      体型: f['体型'] || '', 身高: f['身高'] || '', 体重: f['体重'] || '', 尺寸描述: f['尺寸描述'] || '',
      外貌Tag: f['外貌tag'] || '',
    },
    配种信息: {
      开发阶段: stageOf(count),
      配种次数: count,
      当前配种者: '无',
      经手配种者: {}, 玩法历史: {}, 过往评价,
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
