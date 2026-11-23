import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';

// publicConfig 来自已开通的云服务环境，可安全随应用分发（不含任何长期密钥）
const PUBLIC_CONFIG = {
  endpoint: 'https://tougao-assistant.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_6qfWwebgowB4u6Nv7mlAKJ_Tv3noJveAQF7imNGKojI398z2nlFsYuj',
};

export const cloud = createWorkBuddyCloud({
  endpoint: PUBLIC_CONFIG.endpoint,
  oauthRelayBaseUrl: PUBLIC_CONFIG.oauthRelayBaseUrl,
  publishableKey: PUBLIC_CONFIG.publishableKey,
});

const ERROR_HINTS = {
  quota_exhausted: '模型额度已用完，请稍后重试或升级服务',
  quota_rate_limited: '调用过于频繁，请稍后再试',
  gateway_stream_interrupted: '生成中断，请点击重新生成',
  auth_invalid: '云端授权失效，请重新打开应用',
};

function friendlyError(error) {
  const code = error?.error?.code || '';
  const hint = Object.entries(ERROR_HINTS).find(([key]) => code.startsWith(key))?.[1];
  const message = hint || error?.error?.message || error?.message || '模型调用失败';
  const err = new Error(message);
  err.code = code;
  err.requestId = error?.requestId;
  return err;
}

/**
 * 单次写稿（收集流式输出为完整文本）
 * 每次调用都带 application-owned system message，符合云端 API 要求。
 */
export async function complete({ model = 'auto', system, user, temperature }) {
  let text = '';
  try {
    for await (const chunk of cloud.llm.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: true,
      ...(temperature !== undefined ? { temperature } : {}),
    })) {
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) text += delta.content;
    }
  } catch (error) {
    throw friendlyError(error);
  }
  return text.trim();
}

export async function listModels() {
  try {
    const models = await cloud.llm.models.list();
    return models.filter((m) => m.disabled !== true).map((m) => ({
      id: m.id,
      name: m.name || m.id,
    }));
  } catch (error) {
    throw friendlyError(error);
  }
}
