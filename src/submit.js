import { getConfig } from './config.js';

/**
 * 审核通过后提交到投稿平台。
 * 未配置平台接口时返回 manual=true，由前端引导复制稿件手动提交。
 */
export async function submitDraft(draft) {
  const platform = getConfig().submitPlatform || {};
  if (!platform.url) {
    return {
      ok: false,
      manual: true,
      reason: '尚未配置投稿平台接口地址，请复制稿件后手动提交；配置后即可一键投稿',
    };
  }

  const payload = {
    title: draft.title,
    content: draft.content,
    source: draft.source,
    submittedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(platform.url, {
      method: platform.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) return { ok: false, reason: `投稿平台返回 HTTP ${res.status}：${text.slice(0, 160)}` };
    return { ok: true, detail: text.slice(0, 200) };
  } catch (error) {
    return { ok: false, reason: `无法连接投稿平台：${error.message}` };
  }
}
