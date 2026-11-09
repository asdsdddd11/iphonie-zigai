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
    性格: clip(p.性格, 120), 体型: clip(p.体型, 60), 身高: clip(p.身高, 20), 体重: clip(p.体重, 20),
    尺寸描述: clip(p.尺寸描述, 80), 外貌Tag: clip(p.外貌Tag, 300),
  };
}

function normalizeTarget(t = {}) {
  return {
    基础档案: normalizeProfile(t.基础档案),
    配种信息: {
      开发阶段: Math.min(5, Math.max(0, Math.round(num(t.配种信息?.开发阶段, 0)))),
      配种次数: Math.max(0, Math.round(num(t.配种信息?.配种次数, 0))),
      当前配种者: clip(t.配种信息?.当前配种者, 40) || '无',
      经手配种者: {}, 玩法历史: {}, 过往评价: {},
    },
  };
}

function normalizeFeed(rows) {
  return (Array.isArray(rows) ? rows : []).slice(-ROOT_LIMITS.feeds).map(p => ({
    id: clip(p.id, 100) || crypto.randomUUID(),
    猎物ID: clip(p.猎物ID, 100),
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
export const HUNT_PROMPT = `你在为「根源重塑」暗网平台生成猎场帖子。猎物都是高自尊、阳刚、强壮的直男，患有某种男性隐疾，来平台求医或炫耀。

评级从低到高：原矿、粗坯、精雕、宝玉、神物。绝大多数是原矿或粗坯，精雕及以上少见。隐疾从这些里选（写通俗病名）：心理性阳痿、原发性勃起功能障碍、晨勃消失、硬度不足、早泄、逆行射精、射精延迟、勃起疼痛、高潮缺失、小阴茎焦虑、睾丸萎缩恐惧、无精子症、阴囊潮湿焦虑、耻骨脂肪堆积、性唤起不匹配、选择性阳痿、性表现焦虑、运动表现关联性功能障碍、成功人士压力性功能障碍。

每个猎物严格按下面格式输出一个块：

【猎物】
姓名：xx
评级：xx
疾病：xx
年龄：xx
外貌：xx（两到三句，具体到长相、皮肤、眉眼）
外貌tag：英文 danbooru tag，固定外貌：1boy、发型发色、瞳色、体型、显眼的特征；不写衣服、表情、动作
职业：xx
籍贯：xx
性格：xx
体型：xx
身高：xxcm
体重：xxkg
尺寸描述：xx（先写多少cm，再一句话描述）
文案：xx（30字以上，求医/求助/困惑/炫耀雄性魅力，口语直白，符合直男人设，语气各不同）
媒体描述：xx（照片或视频拍到的画面，详细）
标签：#xx #xx #xx #xx #xx
配图：英文 danbooru tag，必须贴合上面写的外貌、体型、职业和穿着（在干什么、在哪），只描述画面本身；拍到人就写人数、动作、地点和构图；露骨画面可以写 nsfw 等成人 tag；不写发色/瞳色/发型，插件会带上存好的外貌
评论1：留言者名：内容
评论2：留言者名：内容

一次生成 4 到 6 个猎场帖子，彼此人设、职业、疾病、语气都不重复。全部新造，不要照搬示例。`;

// ---------- 便器广场生成 ----------
export const SHOW_PROMPT = `你在为「根源重塑」暗网平台生成便器广场帖子。发帖的是已经被配种、正在开发中的便器，展示成果、炫耀、分享或求助。

每个帖子严格按下面格式输出一个块：

【广场】
作者：xx（已配种便器的名字）
文案：xx（30字以上，炫耀/分享/求助，含主人赐予、调教、沦陷、身体变化等，口语，符合该便器的人设）
媒体描述：xx（照片或视频拍到的画面，详细）
标签：#xx #xx #xx #xx
配图：英文 danbooru tag，必须贴合上面写的外貌、体型、职业和穿着（在干什么、在哪），只描述画面本身；拍到人就写人数、动作、地点和构图；露骨画面可以写 nsfw 等成人 tag；不写发色/瞳色/发型，插件会带上存好的外貌
评论1：留言者名：内容
评论2：留言者名：内容

一次生成 2 到 3 个广场帖子，彼此语气、内容不重复。作者必须从提供的已有便器名字里选。`;

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
  return parseBlocks(reply, '广场').filter(f => f['作者']);
}

export function huntToTarget(f) {
  return {
    基础档案: {
      姓名: f['姓名'] || '', 评级: f['评级'] || '原矿', 疾病: f['疾病'] || '', 年龄: Number(f['年龄']) || 20,
      外貌: f['外貌'] || '', 职业: f['职业'] || '', 籍贯: f['籍贯'] || '', 性格: f['性格'] || '',
      体型: f['体型'] || '', 身高: f['身高'] || '', 体重: f['体重'] || '', 尺寸描述: f['尺寸描述'] || '',
      外貌Tag: f['外貌tag'] || '',
    },
    配种信息: { 开发阶段: 0, 配种次数: 0, 当前配种者: '无', 经手配种者: {}, 玩法历史: {}, 过往评价: {} },
  };
}

export function huntToFeed(f, 猎物ID, at) {
  const comments = [];
  for (const k of ['评论1', '评论2', '评论3']) if (f[k]) {
    const [留言者, 内容] = f[k].split(/[：:]/).map(s => (s || '').trim());
    if (留言者 && 内容) comments.push({ 留言者, 内容 });
  }
  return { id: crypto.randomUUID(), 猎物ID, 文案: f['文案'] || '', 媒体类型: 'image', 媒体描述: f['媒体描述'] || '', 标签: f['标签'] || '', 评论区: comments,
    imageTags: f['配图'] || '', photoId: '', imageState: '', imageNote: '', imageVersions: [], at: at || Date.now() };
}
