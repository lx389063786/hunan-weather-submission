import { complete } from './cloud.js';
import { getConfig } from './config.js';
import { STYLE_SYSTEM_PROMPT, buildUserPrompt, parseDraft } from './style-prompt.js';
import { createDraft } from './store.js';
import { withSignature } from './signature.js';
import { fetchRealWeather, formatWeather } from './weather.js';
import { checkWeatherFacts } from './fact-check.js';

export { DRAFT_SIGNATURE } from './signature.js';

export async function generateDraft({ input, source = 'manual', model, context, reference, weather: weatherArg } = {}) {
  const material = String(input || '').trim();
  if (!material) throw new Error('请提供写稿素材或主题');

  const selectedModel = model || getConfig().model || 'auto';
  // 真实天气作为强制事实锚点：优先复用调用方传入的，否则自行抓取
  const weather = weatherArg || await fetchRealWeather().catch(() => ({ ok: false }));
  const weatherText = formatWeather(weather);

  let parsed = null;
  let lastIssues = [];
  // 事实性审查：最多生成三次，仍含编造天气则拒绝出稿（防止虚假新闻推送）
  for (let attempt = 0; attempt < 3; attempt++) {
    const retryNote = attempt === 0 ? '' :
      `【重写要求】上一稿被事实审查拦截，涉及编造天气：${lastIssues.map((i) => i.label).join('、')}。请删除所有与真实天气实况不符的天气过程描述（尤其雨雪、冰冻、冷空气、寒潮、道路结冰等），只保留真实天气或"冬季天气多变"一类概括表述，其余内容照常。`;
    const raw = await complete({
      model: selectedModel,
      system: STYLE_SYSTEM_PROMPT,
      user: buildUserPrompt(material, source, context || reference, weatherText, retryNote),
      temperature: 0.8,
    });
    parsed = parseDraft(raw);
    if (!parsed.content) throw new Error('模型未返回有效正文，请重试');

    const check = checkWeatherFacts(parsed.content, weather);
    if (check.ok) break;
    lastIssues = check.issues;
    if (attempt === 2) {
      throw new Error(`稿件事实审查未通过（编造天气：${check.issues.map((i) => i.label).join('、')}），已阻止生成，请更换由头后重试`);
    }
  }

  return createDraft({ title: parsed.title, content: withSignature(parsed.content), source, input: material });
}
