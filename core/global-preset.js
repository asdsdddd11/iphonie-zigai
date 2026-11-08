// 全局预设: 一键导入/导出/恢复小手机所有功能的生成规范 + 破甲词。
// 预设 JSON 结构:
// {
//   name, version, jailbreak,
//   promptRules: { [blockId]: { enabled?, parts: { [partKey]: text } } },   // 覆盖 core/prompt-rule-defaults.js 的 PROMPT_BLOCKS
//   chatRules: [{ id, title, text, use: ['dm','group',...], enabled }]      // 覆盖 core/chat.js 的聊天预设 entries
// }
import { PROMPT_BLOCKS } from './prompt-rule-defaults.js';
import { normalizePromptRules } from './prompt-rules.js';
import { DEFAULT_CHAT_ENTRIES, defaultChat } from './chat.js';

const MAX = 20000;
const BLOCK_IDS = new Set(PROMPT_BLOCKS.map(b => b.id));

export const GLOBAL_PRESET_VERSION = 1;

/** 校验并规范化一份预设 JSON；无效时抛错。 */
export function validateGlobalPreset(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw Error('全局预设格式无效');
    const name = String(json.name || '').trim().slice(0, 80) || '未命名预设';
    const jailbreak = String(json.jailbreak || '').slice(0, MAX);
    const promptRules = {};
    if (json.promptRules && typeof json.promptRules === 'object' && !Array.isArray(json.promptRules)) {
        for (const [id, rule] of Object.entries(json.promptRules)) {
            if (!BLOCK_IDS.has(id) || !rule || typeof rule !== 'object' || Array.isArray(rule)) continue;
            const parts = {};
            if (rule.parts && typeof rule.parts === 'object') {
                for (const [key, text] of Object.entries(rule.parts)) {
                    if (typeof text === 'string') parts[key] = text.slice(0, MAX);
                }
            }
            const kept = { ...(typeof rule.enabled === 'boolean' ? { enabled: rule.enabled } : {}), ...(Object.keys(parts).length ? { parts } : {}) };
            if (Object.keys(kept).length) promptRules[id] = kept;
        }
    }
    const chatRules = [];
    if (Array.isArray(json.chatRules)) {
        for (const r of json.chatRules) {
            if (!r || typeof r !== 'object') continue;
            const id = String(r.id || '').trim().slice(0, 40);
            const title = String(r.title || '').trim().slice(0, 40);
            const text = String(r.text || '').slice(0, MAX);
            const use = Array.isArray(r.use) ? r.use.filter(u => typeof u === 'string').slice(0, 10) : [];
            if (!id || !text) continue;
            chatRules.push({ id, title, text, use, enabled: r.enabled !== false });
        }
    }
    return { name, version: GLOBAL_PRESET_VERSION, jailbreak, promptRules: normalizePromptRules(promptRules), chatRules };
}

/** 导入：返回一份新的 settings（不改原对象）。 */
export function importGlobalPreset(settings, json) {
    const preset = validateGlobalPreset(json);
    const next = structuredClone(settings);
    next.promptRules = preset.promptRules;
    next.globalPreset = { enabled: next.globalPreset?.enabled !== false, jailbreak: preset.jailbreak };
    if (preset.chatRules.length) {
        if (!next.chat || !Array.isArray(next.chat.presets) || !next.chat.presets.length) next.chat = defaultChat();
        next.chat.presets[0].entries = preset.chatRules;
    }
    return next;
}

/** 导出：把当前 settings 打包成一份可再导入的预设 JSON。 */
export function exportGlobalPreset(settings) {
    const preset = settings?.chat?.presets?.[0];
    return {
        name: '导出的全局预设',
        version: GLOBAL_PRESET_VERSION,
        jailbreak: settings?.globalPreset?.jailbreak || '',
        promptRules: structuredClone(settings?.promptRules || {}),
        chatRules: Array.isArray(preset?.entries) ? preset.entries.map(e => ({ id: e.id, title: e.title, text: e.text, use: e.use, enabled: e.enabled })) : [],
    };
}

/** 恢复默认：清空所有覆盖，聊天规则回到出厂值。 */
export function resetGlobalPreset(settings) {
    const next = structuredClone(settings);
    next.promptRules = {};
    next.globalPreset = { enabled: true, jailbreak: '' };
    if (next.chat && Array.isArray(next.chat.presets) && next.chat.presets.length) {
        next.chat.presets[0].entries = DEFAULT_CHAT_ENTRIES.map(e => ({ ...e, enabled: true }));
    }
    return next;
}
