// 抓取内容的时效性与保密性过滤

export const MAX_AGE_DAYS = 3;

// 只保留最近三天（含当天）的报道；无日期或未来日期一律不用
export function isFresh(dateStr) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(dateStr || '')) return false;
  const then = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today - then) / 86400000);
  return days >= 0 && days <= MAX_AGE_DAYS;
}

// 涉密、敏感或不宜对外投稿引用的内容直接排除
// 注意：党建引领（党支部、党员、主题党日）属于正常宣传题材，不在排除范围
const SENSITIVE = /(常委会|常务会议|财经委员会|议军|军事日|人事|任免|干部调整|信访|纪检|纪委|巡察|巡视|审计|案件|涉案|侦查|审查调查|通报批评|警示片|涉密|保密|机密|内部|敏感|事故|伤亡|遇难|失联)/;

export function isSensitive(text) {
  return SENSITIVE.test(String(text || ''));
}
