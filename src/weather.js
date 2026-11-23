// 新邵真实天气事实源：写稿时作为唯一可信的天气依据，防止模型编造天气过程。
// 数据源：中国天气网（官方）实况接口 + 7 天预报页。

const CITY_CODE = '101250904'; // 新邵
const SK_URL = `http://d1.weather.com.cn/sk_2d/${CITY_CODE}.html`;
const FC_URL = `https://www.weather.com.cn/weather/${CITY_CODE}.shtml`;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: `https://www.weather.com.cn/weather/${CITY_CODE}.shtml`,
};

function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;|&ensp;|&emsp;/g, ' ')
    .replace(/&deg;/g, '°')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseLive(text) {
  const m = text.match(/var dataSK\s*=\s*(\{[\s\S]*?\})\s*;?\s*$/);
  if (!m) return null;
  try {
    const d = JSON.parse(m[1]);
    if (d.cityname !== '新邵') return null;
    return {
      city: '新邵',
      obsTime: d.date || '',
      time: d.time || '',
      weather: d.weather || '',
      temp: d.temp || '',
      wind: `${d.WD || ''}${d.WS || ''}`.trim(),
      humidity: d.SD || '',
      rain24h: d.rain24h || '',
    };
  } catch {
    return null;
  }
}

function parseForecast(html) {
  const items = [];
  const re = /<li class="sky[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const block = m[1];
    const day = decodeEntities((block.match(/<h1>([^<]*)<\/h1>/) || [])[1] || '');
    const cond = decodeEntities((block.match(/class="wea"[^>]*>([^<]*)</) || [])[1] || '');
    const tem = (block.match(/class="tem"[\s\S]*?<span>([^<]*)<\/span>/) || [])[1] || '';
    const hi = decodeEntities((block.match(/<span>([^<]*)<\/span>/) || [])[1] || '');
    const lo = decodeEntities((block.match(/<i>([^<]*)<\/i>/) || [])[1] || '');
    if (!day || !cond) continue;
    items.push({ day, cond, high: hi, low: lo });
  }
  return items.slice(0, 3);
}

export async function fetchRealWeather() {
  const result = {
    ok: false,
    city: '新邵',
    live: null,
    forecast: [],
    reason: '',
  };
  const [liveRes, fcRes] = await Promise.allSettled([
    fetchText(SK_URL).then(parseLive),
    fetchText(FC_URL).then(parseForecast),
  ]);
  if (liveRes.status === 'fulfilled' && liveRes.value) result.live = liveRes.value;
  if (fcRes.status === 'fulfilled' && fcRes.value?.length) result.forecast = fcRes.value;
  result.ok = Boolean(result.live || result.forecast.length);
  if (!result.ok) {
    result.reason = [liveRes.status === 'rejected' ? liveRes.reason?.message : '实况为空',
      fcRes.status === 'rejected' ? fcRes.reason?.message : '预报为空'].join('；');
  }
  return result;
}

// 供提示词使用的紧凑事实块
export function formatWeather(weather) {
  if (!weather?.ok) return '';
  const lines = ['【新邵真实天气实况（权威数据源，稿件中的天气表述必须与此一致，不得编造）】'];
  if (weather.live) {
    const l = weather.live;
    lines.push(`实况（${l.obsTime} ${l.time}）：${l.city}，天气${l.weather}，气温${l.temp}℃，${l.wind}，湿度${l.humidity}，24小时降水${l.rain24h}mm。`);
  }
  if (weather.forecast?.length) {
    lines.push('未来预报：' + weather.forecast.map((f) => `${f.day} ${f.cond} ${f.low}~${f.high}℃`).join('；') + '。');
  }
  lines.push('严禁写出上述实况/预报中没有的天气现象（尤其是雨雪、冰冻、寒潮、冷空气逼近、暴雨、大风预警等）；不得把外地由头里的天气移植到新邵。若由头天气与新邵实况不符，只借鉴其工作做法（如提前部署、会商、联动），天气背景一律以本实况为准或干脆不写具体天气。');
  return lines.join('\n');
}
