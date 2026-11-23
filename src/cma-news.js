// 每日选题参考：抓取中国气象报社 / 中国气象局「基层台站」栏目近期县区级报道
// 只借鉴选题由头与切入角度，不照抄事实、人名和数字。

import fs from 'node:fs';
import path from 'node:path';
import { isFresh, isSensitive } from './filters.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const USED_FILE = path.join(ROOT, 'data', 'used-references.json');

// 中国气象局「基层台站」栏目大量转载中国气象报社的县区级报道，
// 且与中国气象新闻网内容基本同步，作为每日主要参考源。
const SOURCES = [
  { name: '中国气象报社·中国气象新闻网', url: 'https://www.zgqxb.com.cn/zx/zh/', optional: true },
  { name: '中国气象局·基层台站', url: 'https://www.cma.gov.cn/2011xwzx/2011xqxxw/2011xjctz/' },
];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  Referer: 'https://www.cma.gov.cn/',
};

// 用户归纳的高价值题材：文件下发执行、业务培训、重大活动保障、科普宣传、
// 时间节点、重大气象事件、多部门联合检查、党建引领。
const ANGLE_WORDS = /(文件|方案|通知|印发|贯彻|落实|培训|演练|保障|护航|科普|宣传|检查|联动|联合|党建|支部|党员|节气|寒潮|低温|雨雪|冰冻|大风|暴雨|强对流|赛事|活动|会议|应急|预警|服务|保险|康养|文旅|农业|供电|供热|生态|科普基地|信息员|叫应)/;

function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cleanText(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function readUsed() {
  try {
    const value = JSON.parse(fs.readFileSync(USED_FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeUsed(list) {
  fs.mkdirSync(path.dirname(USED_FILE), { recursive: true });
  fs.writeFileSync(USED_FILE, JSON.stringify(list, null, 2), 'utf8');
}

async function fetchListing(source) {
  const response = await fetch(source.url, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`${source.name} HTTP ${response.status}`);
  const html = await response.text();

  const items = [];
  const seen = new Set();
  const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRe.exec(html)) !== null) {
    const href = match[1];
    const title = cleanText(match[2]);
    if (!/\/t20\d{6}_\d+\.html/.test(href)) continue;
    if (title.length < 8 || title.length > 80) continue;
    if (!ANGLE_WORDS.test(title)) continue;
    if (seen.has(title)) continue;
    seen.add(title);

    const dateMatch = href.match(/t(20\d{2})(\d{2})(\d{2})_/);
    const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : '';
    if (!isFresh(date) || isSensitive(title)) continue;
    items.push({
      title,
      url: new URL(href, source.url).href,
      date,
      source: source.name,
    });
  }
  return items;
}

export async function fetchDailyReference({ limit = 8 } = {}) {
  const results = await Promise.allSettled(SOURCES.map(fetchListing));
  const items = [];
  const reasons = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') items.push(...result.value);
    else if (!SOURCES[index].optional) reasons.push(`${SOURCES[index].name}: ${result.reason?.message || result.reason}`);
  });

  // 跨来源去重（同一篇文章常同时出现在两个站点），按日期倒序
  const unique = [];
  const seen = new Set();
  items
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((item) => {
      const key = item.title.replace(/\s/g, '');
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(item);
    });

  return {
    ok: unique.length > 0,
    items: unique.slice(0, limit),
    reason: unique.length ? '' : reasons.join('；') || '未获取到可用条目',
  };
}

// 从近期参考报道中选一个尚未用过的选题由头，改写成新邵县本地化主题
export function pickReferenceTopic(items) {
  const pool = items.length ? items : [];
  if (!pool.length) return null;
  const used = readUsed();
  const fresh = pool.filter((item) => !used.includes(item.url));
  // 全部已用过时返回 null，让选题链转向下一个来源，避免重复同一由头
  if (!fresh.length) return null;
  const picked = fresh[Math.floor(Math.random() * fresh.length)];
  writeUsed([...used.filter((u) => u !== picked.url), picked.url].slice(-30));
  return {
    item: picked,
    input: `参考中国气象报社/中国气象局基层台站近期报道《${picked.title}》的选题由头和切入角度，结合新邵县气象工作实际撰写一篇市县动态稿件。只借鉴题材方向，不要照抄原文的事实、人名、数字和地名。`,
  };
}

export function formatReference(reference) {
  if (!reference?.items?.length) return '';
  const lines = reference.items.map(
    (item) => `- ${item.date} ${item.title}（来源：${item.source}）`,
  );
  return [
    '【今日中国气象报/中国气象局基层台站选题参考】',
    ...lines,
    '以上是近期县区级气象报道的选题由头，只借鉴题材方向和切入角度，不要照抄其中的事实、人名、数字和地名。',
  ].join('\n');
}
