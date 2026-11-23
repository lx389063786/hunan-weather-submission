import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from './config.js';
import { generateDraft } from './generate.js';
import { pickTopic, hasDraftToday } from './store.js';
import { pushDraft } from './pushplus.js';
import { fetchDailyReference, pickReferenceTopic } from './cma-news.js';
import { fetchLocalContext, pickLocalTopic } from './local-context.js';
import { fetchRealWeather } from './weather.js';

const LOG_FILE = path.resolve(import.meta.dirname, '..', 'data', 'daily.log');

function log(line) {
  const stamp = new Date().toISOString();
  const message = `[${stamp}] ${line}\n`;
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, message, 'utf8');
  console.log(message.trim());
}

export async function runDaily(explicitTopic, { force = false } = {}) {
  const cfg = getConfig();
  if (cfg.daily?.enabled === false) {
    log('每日写稿已在配置中关闭，跳过。');
    return { skipped: true, reason: '每日写稿已关闭' };
  }
  if (!force && hasDraftToday('daily')) {
    log('今天已生成过每日稿件，跳过，避免重复写稿和二次推送。');
    return { skipped: true, reason: '今天已生成过每日稿件' };
  }

  const [reference, localContext, weather] = await Promise.all([
    fetchDailyReference().catch(() => ({ ok: false, items: [], reason: '抓取异常' })),
    fetchLocalContext(),
    fetchRealWeather().catch(() => ({ ok: false })),
  ]);
  const context = { cma: reference, ...localContext };
  log(weather.ok
    ? `新邵真实天气：${weather.live ? `${weather.live.weather} ${weather.live.temp}℃，` : ''}未来3天 ${weather.forecast.map((f) => `${f.day}${f.cond}${f.low}~${f.high}℃`).join('、')}`
    : `新邵天气数据获取失败：${weather.reason || '未知'}，写稿将不引用具体天气`);
  const explicit = String(explicitTopic || '').trim();

  log(reference.ok
    ? `已参考中国气象报/基层台站 ${reference.items.length} 条选题`
    : `中国气象报参考获取失败：${reference.reason}，改用其他来源`);
  log(localContext.local.ok
    ? `已抓取新邵本地事件 ${localContext.local.items.length} 条，其中气象强相关 ${localContext.local.items.filter((i) => i.relevance === 'strong').length} 条`
    : `新邵本地事件抓取失败：${localContext.local.reason}`);
  log(localContext.hunan.ok
    ? `已抓取湖南气象市县动态 ${localContext.hunan.items.length} 条`
    : `湖南气象抓取失败：${localContext.hunan.reason}`);

  if (localContext.wechat?.configured) {
    log(localContext.wechat.ok
      ? `已抓取新邵发布公众号文章 ${localContext.wechat.items.length} 篇`
      : `公众号文章未取到：${localContext.wechat.reason}`);
  }
  const allLocal = { items: [...localContext.local.items, ...(localContext.wechat?.items || [])] };
  const localPicked = explicit ? null : pickLocalTopic(allLocal);
  const cmaPicked = explicit || localPicked ? null : pickReferenceTopic(reference.items);
  const topic = explicit || localPicked?.input || cmaPicked?.input || pickTopic();
  if (localPicked) log(`今日本地强相关由头：${localPicked.item.title}`);
  else if (cmaPicked) log(`今日选题由头：${cmaPicked.item.title}`);
  log(`开始每日写稿，主题：${topic}`);

  try {
    const draft = await generateDraft({ input: topic, source: 'daily', context, weather });
    log(`稿件生成成功：${draft.title}（${draft.id}）`);

    let pushResult = null;
    if (cfg.daily?.autoPush !== false) {
      pushResult = await pushDraft(draft);
      log(pushResult.ok
        ? '微信推送成功。'
        : pushResult.duplicate ? `微信推送跳过：${pushResult.reason}` : `微信推送失败：${pushResult.reason}`);
    }
    return { ok: true, draft, push: pushResult };
  } catch (error) {
    log(`每日写稿失败：${error.message}`);
    return { ok: false, error: error.message };
  }
}

// 直接执行文件时运行一次；作为模块导入时不自动执行
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const topic = process.argv.slice(2).join(' ').trim();
  const result = await runDaily(topic);
  process.exitCode = result.ok === false ? 1 : 0;
}
