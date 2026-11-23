// 内容事实性审查：拦截与权威天气实况不符的天气编造（虚假新闻防线）。
// 只拦截"断言某种天气正在/即将发生"的写法；"防范、易出现、提醒、预警叫应"等
// 常态化防范表述属正常宣传，予以放行。

// 断言型天气造假（命中即拦截，除非实况确实支持该现象）
const ASSERTIONS = [
  { re: /(首场|第一场|今冬首场|入冬首场|今冬第一场)[^。；，]{0,12}(雨雪|降雪|冰冻|寒潮)/, label: '首场雨雪/冰冻', need: 'ice' },
  { re: /(新一轮|一股|本轮|强)?冷空气[^。；，]{0,6}(正)?(逼近|来袭|南下|将影响|抵达|影响湘|影响我市|影响我县)/, label: '冷空气逼近/来袭', need: 'cold' },
  { re: /(今冬|入冬以来|近期)[^。；，]{0,8}(首场|第一轮)[^。；，]{0,8}(低温|雨雪|冰冻|寒潮)/, label: '首轮低温/寒潮', need: 'ice' },
  { re: /(遭遇|迎来|经受|正经历)[^。；，]{0,10}(雨雪冰冻|寒潮|暴雪|冰冻灾害)/, label: '正遭遇雨雪冰冻/寒潮', need: 'ice' },
  { re: /(暴雨预警|特大暴雨|山洪暴发|大面积道路结冰)/, label: '暴雨/严重结冰灾害', need: 'severe' },
];

// 从权威实况里提取可合法断言的现象标记
function supports(weather) {
  const text = JSON.stringify(weather || {});
  return {
    ice: /雪|冰冻|雨夹雪|寒潮/.test(text),
    cold: /寒潮|冷空气/.test(text),
    severe: /暴雨|大风预警|山洪/.test(text),
  };
}

// 检查稿件。返回 { ok, issues: [{label, snippet}] }
export function checkWeatherFacts(content, weather) {
  const issues = [];
  const text = String(content || '');
  const cap = supports(weather);
  for (const { re, label, need } of ASSERTIONS) {
    if (cap[need]) continue; // 实况确实支持该现象，放行
    let m;
    const rx = new RegExp(re.source, 'g');
    while ((m = rx.exec(text)) !== null) {
      const start = Math.max(0, m.index - 25);
      issues.push({ label, snippet: text.slice(start, m.index + m[0].length + 25).replace(/\n/g, ' ') });
      if (issues.length >= 8) break;
    }
  }
  return { ok: issues.length === 0, issues };
}
