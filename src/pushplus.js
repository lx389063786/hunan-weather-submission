import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from './config.js';

const PUSHPLUS_API = 'https://www.pushplus.plus/send';
const PUSH_LOG = path.resolve(import.meta.dirname, '..', 'data', 'push-log.json');

function readPushLog() {
  try {
    const value = JSON.parse(fs.readFileSync(PUSH_LOG, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writePushLog(log) {
  fs.mkdirSync(path.dirname(PUSH_LOG), { recursive: true });
  fs.writeFileSync(PUSH_LOG, JSON.stringify(log, null, 2), 'utf8');
}

// 查询某篇稿件是否已成功推送过
export function getPushRecord(id) {
  return readPushLog()[id] || null;
}

const CODE_MESSAGES = {
  900: '请求次数过多被限制，请明天再试',
  903: 'PushPlus token 无效，请检查设置中的 token',
  905: 'PushPlus 账号未实名认证，请先到 pushplus.plus 完成实名认证（免费）',
  888: 'PushPlus 积分不足，请充值',
  302: 'PushPlus 未登录，请重新登录官网',
  401: 'PushPlus 请求未授权',
  403: 'PushPlus 请求 IP 未授权',
};

function parseResponse(data, status) {
  if (data?.code === 200) return { ok: true, shortCode: data.data };
  const reason = CODE_MESSAGES[data?.code] || data?.msg || `PushPlus 返回 HTTP ${status}`;
  return { ok: false, reason };
}

function htmlEscape(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function pushDraft(draft, { reviewUrl, force = false } = {}) {
  const cfg = getConfig();
  const token = cfg.pushplusToken;
  if (!token) return { ok: false, reason: '尚未配置 PushPlus token，请在「设置」中填写' };

  // 同一篇稿件默认只推送一次，避免网页重复点击 / 每日任务重跑造成二次推送
  const log = readPushLog();
  const previous = log[draft.id];
  if (previous?.ok && !force) {
    return {
      ok: false,
      duplicate: true,
      reason: `该稿件已于 ${new Date(previous.at).toLocaleString('zh-CN', { hour12: false })} 推送过，未重复发送`,
    };
  }

  const sourceLabel = draft.source === 'daily' ? '每日自动写稿' : '手动写稿';
  const time = new Date(draft.createdAt).toLocaleString('zh-CN', { hour12: false });
  const base = (reviewUrl !== undefined ? reviewUrl : cfg.reviewBaseUrl || '').replace(/\/$/, '');
  // 只有配置了可访问的外网审核地址时才显示审核入口；未配置则不显示任何提示
  const link = base
    ? `<p style="margin-top:16px"><a href="${htmlEscape(base)}/?draft=${encodeURIComponent(draft.id)}" style="display:inline-block;padding:9px 18px;background:#1d64c8;color:#fff;text-decoration:none;border-radius:6px">点击审核稿件</a></p>`
    : '';

  const body = htmlEscape(draft.content || '').replace(/\n/g, '<br/>');
  const content = [
    `<div style="font-family:-apple-system,'Microsoft YaHei',sans-serif;line-height:1.7;color:#1f2937">`,
    `<p style="color:#6b7280;font-size:12px">${sourceLabel} · ${time}</p>`,
    `<div style="margin:12px 0;padding-left:10px;border-left:3px solid #1d64c8">${body}</div>`,
    link,
    `</div>`,
  ].join('');

  try {
    const res = await fetch(PUSHPLUS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        title: draft.title,
        content,
        template: 'html',
        channel: 'wechat',
      }),
    });
    const data = await res.json().catch(() => ({}));
    const result = parseResponse(data, res.status);
    log[draft.id] = {
      ok: result.ok,
      at: new Date().toISOString(),
      shortCode: result.shortCode || null,
      title: draft.title,
    };
    writePushLog(log);
    return result;
  } catch (error) {
    return { ok: false, reason: error.message || 'PushPlus 推送失败' };
  }
}

export async function pushText(text) {
  const token = getConfig().pushplusToken;
  if (!token) return { ok: false, reason: '尚未配置 PushPlus token，请在「设置」中填写' };
  try {
    const res = await fetch(PUSHPLUS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        title: '投稿助手',
        content: String(text).slice(0, 2000),
        template: 'txt',
        channel: 'wechat',
      }),
    });
    const data = await res.json().catch(() => ({}));
    return parseResponse(data, res.status);
  } catch (error) {
    return { ok: false, reason: error.message || 'PushPlus 推送失败' };
  }
}
