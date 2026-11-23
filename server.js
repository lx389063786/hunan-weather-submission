import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { getConfig, saveConfig, publicConfig } from './src/config.js';
import { generateDraft } from './src/generate.js';
import { listModels } from './src/cloud.js';
import { listDrafts, getDraft, updateDraft, deleteDraft } from './src/store.js';
import { submitDraft } from './src/submit.js';
import { pushDraft, pushText, getPushRecord } from './src/pushplus.js';
import { fetchDailyReference } from './src/cma-news.js';
import { fetchLocalContext } from './src/local-context.js';

const app = express();
const ROOT = path.resolve(import.meta.dirname);
const PORT = Number(getConfig().server?.port) || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'web')));

function ok(res, data) { res.json({ ok: true, ...data }); }
function fail(res, error, status = 400) {
  res.status(status).json({ ok: false, error: error?.message || String(error) });
}

app.get('/api/config', (_req, res) => ok(res, { config: publicConfig() }));

app.put('/api/config', (req, res) => {
  try {
    const next = { ...req.body };
    // 只接受已知字段，防止把无关内容写进配置
    const allowed = {
      model: next.model,
      orgName: next.orgName,
      pushplusToken: next.pushplusToken,
      reviewBaseUrl: next.reviewBaseUrl,
      wechatArticleUrls: next.wechatArticleUrls,
      orgName: next.orgName,
      submitPlatform: next.submitPlatform,
      daily: next.daily,
    };
    const cleaned = Object.fromEntries(Object.entries(allowed).filter(([, v]) => v !== undefined));
    saveConfig(cleaned);
    ok(res, { config: publicConfig() });
  } catch (error) { fail(res, error); }
});

// 实时拉取选题上下文：新邵本地重大事件 + 湖南气象 + 中国气象报县区报道
app.get('/api/context', async (_req, res) => {
  try {
    const [cma, localContext] = await Promise.all([
      fetchDailyReference().catch(() => ({ ok: false, items: [], reason: '抓取异常' })),
      fetchLocalContext(),
    ]);
    ok(res, { context: { cma, ...localContext } });
  } catch (error) { fail(res, error, 502); }
});

// 批量查询稿件推送状态，供网页标注「已推送」，避免重复点击
app.get('/api/push-status', (_req, res) => {
  const status = {};
  listDrafts().forEach((d) => {
    const record = getPushRecord(d.id);
    if (record) status[d.id] = record;
  });
  ok(res, { status });
});

app.get('/api/models', async (_req, res) => {
  try { ok(res, { models: await listModels() }); }
  catch (error) { fail(res, error, 502); }
});

app.post('/api/generate', async (req, res) => {
  try {
    const draft = await generateDraft({
      input: req.body?.input,
      source: req.body?.source || 'manual',
      model: req.body?.model,
    });
    ok(res, { draft });
  } catch (error) { fail(res, error, 502); }
});

app.get('/api/drafts', (_req, res) => ok(res, { drafts: listDrafts() }));
app.get('/api/drafts/:id', (req, res) => {
  const draft = getDraft(req.params.id);
  if (!draft) return fail(res, new Error('稿件不存在'), 404);
  ok(res, { draft });
});

app.put('/api/drafts/:id', (req, res) => {
  const { title, content } = req.body || {};
  const patch = {};
  if (typeof title === 'string') patch.title = title.trim();
  if (typeof content === 'string') patch.content = content.trim();
  const draft = updateDraft(req.params.id, patch);
  if (!draft) return fail(res, new Error('稿件不存在'), 404);
  ok(res, { draft });
});

app.delete('/api/drafts/:id', (req, res) => {
  deleteDraft(req.params.id);
  ok(res, {});
});

app.post('/api/drafts/:id/approve', async (req, res) => {
  const draft = getDraft(req.params.id);
  if (!draft) return fail(res, new Error('稿件不存在'), 404);
  const result = await submitDraft(draft);
  const updated = updateDraft(draft.id, {
    status: result.ok ? 'submitted' : 'approved',
    submittedAt: result.ok ? new Date().toISOString() : null,
    submitNote: result.reason || result.detail || '',
  });
  ok(res, { draft: updated, submit: result });
});

app.post('/api/drafts/:id/reject', (req, res) => {
  const draft = updateDraft(req.params.id, { status: 'rejected', submitNote: req.body?.note || '' });
  if (!draft) return fail(res, new Error('稿件不存在'), 404);
  ok(res, { draft });
});

app.post('/api/drafts/:id/regenerate', async (req, res) => {
  const draft = getDraft(req.params.id);
  if (!draft) return fail(res, new Error('稿件不存在'), 404);
  try {
    const fresh = await generateDraft({
      input: draft.input,
      source: draft.source,
      context: draft.context,
    });
    deleteDraft(draft.id);
    ok(res, { draft: fresh, replaced: draft.id });
  } catch (error) { fail(res, error, 502); }
});

app.post('/api/drafts/:id/push', async (req, res) => {
  const draft = getDraft(req.params.id);
  if (!draft) return fail(res, new Error('稿件不存在'), 404);
  const result = await pushDraft(draft, { force: req.body?.force === true });
  ok(res, { result });
});

app.post('/api/test-push', async (_req, res) => {
  const result = await pushText('【投稿助手】微信推送连接测试成功，后续每日稿件将推送到你的微信。');
  if (!result.ok) return fail(res, new Error(result.reason), 502);
  ok(res, {});
});

app.post('/api/daily/run', async (req, res) => {
  try {
    const { runDaily } = await import('./src/daily.js');
    const result = await runDaily(req.body?.topic, { force: req.body?.force === true });
    ok(res, result);
  } catch (error) { fail(res, error, 502); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  fail(res, error, 500);
});

app.listen(PORT, () => {
  console.log(`投稿助手已启动：http://localhost:${PORT}`);
  console.log(`数据目录：${path.join(ROOT, 'data')}`);
  if (!fs.existsSync(path.join(ROOT, 'data'))) fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
});
