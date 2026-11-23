// 本地与省内上下文：抓取新邵县近期重大事件、湖南气象「市县动态」最新报道
// 用途：每日选题优先找与气象强相关的本地由头，同时掌握省内气象宣传动向。

import fs from 'node:fs';
import path from 'node:path';
import { formatReference } from './cma-news.js';
import { isFresh, isSensitive } from './filters.js';
import { getConfig } from './config.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const USED_FILE = path.join(ROOT, 'data', 'used-local-events.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

const LOCAL_SOURCES = [
  { name: '新邵要闻', url: 'https://www.xinshao.gov.cn/xinshao/xgzdt/2020nlist.shtml' },
  { name: '部门资讯', url: 'https://www.xinshao.gov.cn/xinshao/xbmdt/2020nlist.shtml' },
  { name: '乡镇动态', url: 'https://www.xinshao.gov.cn/xinshao/xxzdt/2020nlist.shtml' },
  { name: '通知公告', url: 'https://www.xinshao.gov.cn/xinshao/xtzgg/2020nlist.shtml' },
];

const HUNAN_SOURCE = {
  name: '湖南气象·市县动态',
  url: 'http://hn.cma.gov.cn/xwzx/sxdt/',
};

// 与气象强相关：发现这类本地事件时优先作为稿件由头
const STRONG_WEATHER = /(气象|天气|暴雨|强降雨|降雨|大风|寒潮|低温|冰冻|冰雪|霜冻|雷电|防雷|防汛|防洪|山洪|内涝|干旱|高温|预警|防灾|减灾|地质灾害|森林防灭火|森林防火|应急演练|抢险|气象灾害|人工影响天气|文旅|旅游|农业|农事|种植|养殖|采摘|节庆|节会|赛事|音乐会|展销|丰收|民俗)/;
// 可与气象服务关联：水利、交通、安全生产、科普培训等
const RELATED_WEATHER = /(水利|水库|交通|公路|安全生产|项目|生态环境|林业|应急|消防|住建|校园|科普|培训|会议|部署|印发|方案|森林)/;

function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;|&ensp;|&emsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"');
}

function cleanText(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

// 线索文字去除具体人名，避免把领导姓名带入生成稿件
function sanitize(text) {
  return String(text || '')
    .replace(/[\u4e00-\u9fa5]{2,3}(?=专题调研|调研督导|调研|主持召开|出席|参加|讲话|授课|督导)/g, '')
    .replace(/(书记|主席|县长|副县长|局长|主任|会长|董事长|总经理)[\u4e00-\u9fa5]{2,4}/g, '$1')
    .replace(/县领导[\u4e00-\u9fa5、，,]+/g, '')
    .replace(/[（(][^）)]{0,60}(参加|出席|主持)[^）)]*[）)]/g, '')
    .replace(/^[\s、，,]+/, '')
    .trim();
}

function relevanceOf(title) {
  if (STRONG_WEATHER.test(title)) return 'strong';
  if (RELATED_WEATHER.test(title)) return 'related';
  return 'context';
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function parseLocalList(html, source) {
  const items = [];
  const seen = new Set();
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = liRe.exec(html)) !== null) {
    const block = match[1];
    const link = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const title = cleanText(link[2]);
    const dateMatch = block.match(/(20\d{2}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : '';
    if (title.length < 6 || title.length > 90 || seen.has(title)) continue;
    if (!isFresh(date) || isSensitive(title)) continue;
    seen.add(title);
    items.push({
      title,
      date,
      url: new URL(link[1], source.url).href,
      source: source.name,
      relevance: relevanceOf(title),
    });
  }
  return items;
}

function parseHunanList(html, source) {
  const items = [];
  const seen = new Set();
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = liRe.exec(html)) !== null) {
    const block = match[1];
    const link = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const title = cleanText(link[2]);
    const dateMatch = block.match(/(20\d{2}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : '';
    if (!/\/(t20\d{6})_\d+\.html/.test(link[1])) continue;
    if (title.length < 6 || title.length > 90 || seen.has(title)) continue;
    if (!isFresh(date) || isSensitive(title)) continue;
    seen.add(title);
    items.push({
      title,
      date,
      url: new URL(link[1], source.url).href,
      source: source.name,
      relevance: 'weather',
    });
  }
  return items;
}

// 读取正文中是否出现足够强的气象线索（标题没写「气象」的重要会议也要识别）
async function enrichWithBody(item) {
  try {
    const text = cleanText(await fetchHtml(item.url));
    const matches = text.match(new RegExp(STRONG_WEATHER.source, 'g')) || [];
    if (matches.length >= 2) {
      const first = text.search(STRONG_WEATHER);
      const excerpt = text.slice(first, first + 140).slice(0, 140);
      if (!isSensitive(excerpt)) return { ...item, relevance: 'strong', excerpt };
    }
  } catch {
    // 正文抓取失败不影响列表结果
  }
  return item;
}

export async function fetchLocalEvents({ limit = 12 } = {}) {
  const results = await Promise.allSettled(LOCAL_SOURCES.map(async (source) =>
    parseLocalList(await fetchHtml(source.url), source)));
  const items = [];
  const reasons = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') items.push(...result.value);
    else reasons.push(`${LOCAL_SOURCES[index].name}: ${result.reason?.message || result.reason}`);
  });
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

  // 对近期要闻/部门资讯/乡镇动态读取正文，识别标题里看不出的气象相关内容
  const toScan = unique.filter((item) => item.source !== '通知公告').slice(0, 16);
  const scanned = await Promise.all(toScan.map(enrichWithBody));
  const scannedUrls = new Set(scanned.map((item) => item.url));
  const combined = [...scanned, ...unique.filter((item) => !scannedUrls.has(item.url))];
  const rank = { strong: 0, related: 1, context: 2 };
  combined.sort((a, b) => (rank[a.relevance] - rank[b.relevance]) || b.date.localeCompare(a.date));

  return {
    ok: combined.length > 0,
    items: combined.slice(0, limit),
    reason: combined.length ? '' : reasons.join('；') || '未获取到本地新闻',
  };
}

export async function fetchHunanWeather({ limit = 8 } = {}) {
  try {
    const items = parseHunanList(await fetchHtml(HUNAN_SOURCE.url), HUNAN_SOURCE);
    return { ok: items.length > 0, items: items.slice(0, limit), reason: '' };
  } catch (error) {
    return { ok: false, items: [], reason: error.message || '湖南气象抓取失败' };
  }
}

// 「新邵发布」公众号无法稳定自动翻页抓取（会触发验证码），
// 支持在 config.wechatArticleUrls 中填入近期文章链接作为可选补充源。
export async function fetchWechatArticles({ limit = 5 } = {}) {
  const urls = getConfig().wechatArticleUrls;
  if (!Array.isArray(urls) || !urls.length) {
    return { ok: false, items: [], reason: '未配置公众号文章链接', configured: false };
  }
  const results = await Promise.all(urls.filter((u) => typeof u === 'string' && u.startsWith('https://mp.weixin.qq.com/')).map(async (url) => {
    try {
      const html = await fetchHtml(url);
      const title = decodeEntities((html.match(/property="og:title"\s+content="([^"]+)"/) || [])[1]
        || (html.match(/var msg_title\s*=\s*'([^']+)'/) || [])[1] || '');
      const ct = (html.match(/var ct\s*=\s*"?(\d{10})"?/) || [])[1];
      const published = (html.match(/var publish_time\s*=\s*"([^"]+)"/) || [])[1] || '';
      const date = ct ? new Date(Number(ct) * 1000).toISOString().slice(0, 10) : published.slice(0, 10);
      if (!title || !isFresh(date) || isSensitive(title)) return null;
      const bodyHtml = (html.match(/<div[^>]*id="js_content"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
      const excerpt = cleanText(bodyHtml).slice(0, 160);
      return {
        title, date, url,
        source: '新邵发布（微信公众号）',
        relevance: STRONG_WEATHER.test(title + excerpt) ? 'strong' : 'related',
        excerpt,
      };
    } catch {
      return null;
    }
  }));
  const items = results.filter(Boolean);
  return {
    ok: items.length > 0,
    items: items.slice(0, limit),
    reason: items.length ? '' : '公众号文章抓取失败或已过时效（可能触发验证码）',
    configured: true,
  };
}

export async function fetchLocalContext() {
  const [local, hunan, wechat] = await Promise.all([
    fetchLocalEvents().catch(() => ({ ok: false, items: [], reason: '抓取异常' })),
    fetchHunanWeather().catch(() => ({ ok: false, items: [], reason: '抓取异常' })),
    fetchWechatArticles().catch(() => ({ ok: false, items: [], reason: '抓取异常', configured: false })),
  ]);
  return { local, hunan, wechat };
}

function readUsed() {
  try {
    const value = JSON.parse(fs.readFileSync(USED_FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

// 从本地重大事件中挑一个与气象强相关、尚未用过的由头
export function pickLocalTopic(local) {
  const strong = (local?.items || []).filter((item) => item.relevance === 'strong');
  if (!strong.length) return null;
  const used = readUsed();
  const fresh = strong.filter((item) => !used.includes(item.url));
  // 全部已用过时返回 null，让选题链转向下一个来源，避免重复同一由头
  if (!fresh.length) return null;
  const picked = fresh[Math.floor(Math.random() * fresh.length)];
  fs.mkdirSync(path.dirname(USED_FILE), { recursive: true });
  fs.writeFileSync(USED_FILE, JSON.stringify([...used.filter((u) => u !== picked.url), picked.url].slice(-30), null, 2), 'utf8');
  return {
    item: picked,
    input: `结合新邵县近期重大事件《${picked.title}》的由头，围绕新邵县气象部门可提供的气象服务、预警联动、防范应对等工作撰写一篇市县动态稿件。原文事实、人名和数字仅作背景，不要照抄。`,
  };
}

export function formatLocalContext(context) {
  const local = context?.local;
  const hunan = context?.hunan;
  const wechat = context?.wechat;
  const blocks = [];

  if (local?.items?.length) {
    // 已用作由头的事件不再注入，避免模型反复回到同一线索
    const used = readUsed();
    const candidates = local.items.filter((item) => !used.includes(item.url));
    if (candidates.length) {
      const lines = candidates.map((item) => {
        const tag = item.relevance === 'strong' ? '气象强相关' : item.relevance === 'related' ? '可关联' : '背景';
        const clue = item.excerpt ? ` ｜线索：${sanitize(item.excerpt).slice(0, 100)}` : '';
        return `- [${tag}] ${item.date} ${sanitize(item.title)}（${item.source}）${clue}`;
      });
      blocks.push('【新邵本地近期重大事件（抓取自县政府网站）】', ...lines,
        '以上为背景参考；稿件主体写新邵县气象局的工作，不照抄原文事实、人名和数字。');
    }
  }

  if (wechat?.items?.length) {
    blocks.push('【新邵发布公众号近期文章（可选来源）】',
      ...wechat.items.map((item) => `- [${item.relevance === 'strong' ? '气象强相关' : '可关联'}] ${item.date} ${sanitize(item.title)}${item.excerpt ? ` ｜线索：${sanitize(item.excerpt).slice(0, 100)}` : ''}`));
  }

  if (hunan?.items?.length) {
    blocks.push('【湖南气象市县动态最新报道（文风与省内题材参考）】',
      ...hunan.items.map((item) => `- ${item.date} ${item.title}`),
      '参考省内同行的选题角度和表述方式，不要照抄内容。');
  }

  // 兼容旧调用：context 直接就是中国气象报参考
  const cmaBlock = formatReference(context?.cma || (context?.items ? context : null));
  if (cmaBlock) blocks.push(cmaBlock);

  return blocks.join('\n');
}
