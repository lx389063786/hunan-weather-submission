const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

let config = {};
let models = [];
let drafts = [];
let pushStatus = {};
let currentDraft = null;
let activeFilter = 'all';

function toast(message, ms = 2800) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { el.hidden = true; }, ms);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

/* ---------- 初始化 ---------- */
async function init() {
  try {
    const cfg = await api('/api/config');
    config = cfg.config;
    $('modelChip').textContent = `模型：${config.model || 'auto'}`;
    $('pushplusTokenInput').value = '';
    $('reviewUrlInput').value = config.reviewBaseUrl || '';
    $('platformName').value = config.submitPlatformName || '';
    $('platformUrl').value = config.submitPlatformUrl || '';
    $('dailyEnabled').checked = config.dailyEnabled;
    $('testPushBtn').disabled = !config.hasPushplusToken;
    if (config.hasPushplusToken) $('pushplusTokenInput').placeholder = '已配置（留空表示保持不变）';
  } catch (e) { toast(`加载配置失败：${e.message}`); }

  loadModels();
  await loadDrafts();

  const params = new URLSearchParams(location.search);
  const draftId = params.get('draft');
  if (draftId) {
    const draft = await api(`/api/drafts/${encodeURIComponent(draftId)}`).catch(() => null);
    if (draft?.draft) openDraft(draft.draft);
  }
}

async function loadModels() {
  try {
    const data = await api('/api/models');
    models = data.models;
    const select = $('modelSelect');
    select.innerHTML = models.map((m) =>
      `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('') || '<option value="auto">Auto</option>';
    if (config.model) select.value = config.model;
  } catch (e) { /* 模型列表失败不影响主流程 */ }
}

/* ---------- 稿件列表 ---------- */
async function loadDrafts() {
  try {
    const [data, statusData] = await Promise.all([
      api('/api/drafts'),
      api('/api/push-status').catch(() => ({ status: {} })),
    ]);
    drafts = data.drafts || [];
    pushStatus = statusData.status || {};
    renderDrafts();
  } catch (e) { toast(`加载稿件失败：${e.message}`); }
}

const STATUS_TEXT = { draft: '待审核', approved: '已通过', submitted: '已投稿', rejected: '已驳回' };

function renderDrafts() {
  const list = drafts.filter((d) => activeFilter === 'all' || d.status === activeFilter);
  if (!list.length) {
    $('draftList').innerHTML = '<div class="empty">没有符合条件的稿件。</div>';
    return;
  }
  $('draftList').innerHTML = list.map((d) => `
    <div class="draft-item" data-id="${esc(d.id)}">
      <div class="draft-top">
        <div class="draft-title">${esc(d.title)}</div>
        <span class="badge ${esc(d.status)}">${STATUS_TEXT[d.status] || d.status}</span>
      </div>
      <div class="draft-preview">${esc((d.content || '').slice(0, 70))}…</div>
      <div class="draft-bottom">
        <span class="badge source">${d.source === 'daily' ? '每日自动' : '手动生成'}</span>
        ${pushStatus[d.id]?.ok ? `<span class="badge">已推送微信</span>` : ''}
        <span>${new Date(d.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
        <span>${(d.content || '').length} 字</span>
      </div>
    </div>`).join('');

  $('draftList').querySelectorAll('.draft-item').forEach((el) => {
    el.onclick = () => {
      const draft = drafts.find((d) => d.id === el.dataset.id);
      if (draft) openDraft(draft);
    };
  });
}

/* ---------- 对话框与消息 ---------- */
function addMessage(role, html) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  wrap.innerHTML = `<div class="avatar">${role === 'bot' ? '助' : '我'}</div><div class="bubble">${html}</div>`;
  $('messages').appendChild(wrap);
  $('messages').scrollTop = $('messages').scrollHeight;
  return wrap.querySelector('.bubble');
}

async function generate(input, source = 'manual') {
  const text = String(input || '').trim();
  if (!text) { toast('请先输入素材或主题'); return; }
  if ($('sendBtn').disabled) return;

  addMessage('user', esc(text));
  const placeholder = addMessage('bot', '正在按市县动态文风写稿，请稍候……');
  $('sendBtn').disabled = true;
  $('sendBtn').textContent = '生成中…';

  try {
    const data = await api('/api/generate', { method: 'POST', body: { input: text, source } });
    const draft = data.draft;
    placeholder.innerHTML = `已生成稿件：<strong>${esc(draft.title)}</strong>（${draft.content.length} 字）<div class="draft-card-inline">请在右侧「稿件审核」中查看、编辑或提交。</div>`;
    await loadDrafts();
    toast('稿件生成成功');
  } catch (e) {
    placeholder.textContent = `写稿失败：${e.message}`;
    toast(`写稿失败：${e.message}`, 4000);
  } finally {
    $('sendBtn').disabled = false;
    $('sendBtn').textContent = '生成稿件';
  }
}

/* ---------- 稿件详情 ---------- */
function openDraft(draft) {
  currentDraft = draft;
  $('editTitle').value = draft.title || '';
  $('editContent').value = draft.content || '';
  $('editMeta').textContent = `${draft.source === 'daily' ? '每日自动写稿' : '手动写稿'} · ${new Date(draft.createdAt).toLocaleString('zh-CN', { hour12: false })} · ${(draft.content || '').length} 字`;
  const notice = $('submitNotice');
  if (draft.submitNote) {
    notice.textContent = `投稿结果：${draft.submitNote}`;
    notice.hidden = false;
  } else notice.hidden = true;
  $('draftModal').hidden = false;
}

async function saveDraft() {
  if (!currentDraft) return;
  const data = await api(`/api/drafts/${encodeURIComponent(currentDraft.id)}`, {
    method: 'PUT', body: { title: $('editTitle').value, content: $('editContent').value },
  });
  currentDraft = data.draft;
  await loadDrafts();
}

/* ---------- 设置 ---------- */
async function saveSettings() {
  const payload = {
    model: $('modelSelect').value,
    reviewBaseUrl: $('reviewUrlInput').value.trim(),
    daily: { enabled: $('dailyEnabled').checked, autoPush: true },
    submitPlatform: {
      name: $('platformName').value.trim() || '投稿平台',
      url: $('platformUrl').value.trim(),
      method: 'POST',
    },
  };
  const token = $('pushplusTokenInput').value.trim();
  if (token) payload.pushplusToken = token;

  try {
    const data = await api('/api/config', { method: 'PUT', body: payload });
    config = data.config;
    $('modelChip').textContent = `模型：${config.model}`;
    $('settingsModal').hidden = true;
    $('testPushBtn').disabled = !config.hasPushplusToken;
    $('pushplusTokenInput').value = '';
    $('pushplusTokenInput').placeholder = config.hasPushplusToken ? '已配置（留空表示保持不变）' : '在 pushplus.plus 登录后复制用户 token';
    toast('设置已保存');
  } catch (e) { toast(`保存失败：${e.message}`); }
}

/* ---------- 事件绑定 ---------- */
$('sendBtn').onclick = () => {
  const value = $('inputBox').value;
  if (!value.trim()) return;
  $('inputBox').value = '';
  generate(value);
};
$('inputBox').onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('sendBtn').click(); }
};
document.querySelectorAll('#quickTopics button').forEach((btn) => {
  btn.onclick = () => generate(btn.dataset.topic);
});
$('dailyBtn').onclick = async () => {
  $('dailyBtn').disabled = true;
  $('dailyBtn').textContent = '生成中…';
  try {
    const data = await api('/api/daily/run', { method: 'POST', body: {} });
    if (data.skipped) toast(data.reason || '本次每日写稿已跳过');
    else {
      await loadDrafts();
      toast(data.push?.duplicate ? '今日稿件已存在，未重复推送' : '今日草稿已生成并推送');
    }
  } catch (e) { toast(`生成失败：${e.message}`); }
  finally { $('dailyBtn').disabled = false; $('dailyBtn').textContent = '生成今日草稿'; }
};
$('refreshBtn').onclick = loadDrafts;
document.querySelectorAll('#filters button').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('#filters button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.status;
    renderDrafts();
  };
});
document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.onclick = () => { $(btn.dataset.close).hidden = true; };
});
document.querySelectorAll('.modal-mask').forEach((mask) => {
  mask.onclick = (e) => { if (e.target === mask) mask.hidden = true; };
});

$('settingsBtn').onclick = () => { $('settingsModal').hidden = false; };
$('saveSettingsBtn').onclick = saveSettings;
$('testPushBtn').onclick = async () => {
  try {
    await api('/api/test-push', { method: 'POST', body: {} });
    toast('测试消息已发送，请查看微信（pushplus 推送加公众号）');
  } catch (e) { toast(`测试失败：${e.message}`); }
};

$('copyBtn').onclick = async () => {
  await saveDraft();
  const text = `${$('editTitle').value}\n\n${$('editContent').value}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('稿件已复制到剪贴板');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast('稿件已复制');
  }
};
$('pushBtn').onclick = async () => {
  if (!currentDraft) return;
  await saveDraft();
  try {
    let force = false;
    if (pushStatus[currentDraft.id]?.ok) {
      const again = window.confirm('该稿件已推送过微信。确定要再推送一次吗？');
      if (!again) return;
      force = true;
    }
    const data = await api(`/api/drafts/${encodeURIComponent(currentDraft.id)}/push`, {
      method: 'POST', body: { force },
    });
    toast(data.result.ok ? '已推送到微信' : `推送失败：${data.result.reason}`);
    await loadDrafts();
  } catch (e) { toast(`推送失败：${e.message}`); }
};
$('regenBtn').onclick = async () => {
  if (!currentDraft) return;
  toast('正在重新生成…');
  try {
    const data = await api(`/api/drafts/${encodeURIComponent(currentDraft.id)}/regenerate`, { method: 'POST', body: {} });
    $('draftModal').hidden = true;
    await loadDrafts();
    openDraft(data.draft);
    toast('已重新生成');
  } catch (e) { toast(`重新生成失败：${e.message}`); }
};
$('rejectBtn').onclick = async () => {
  if (!currentDraft) return;
  const data = await api(`/api/drafts/${encodeURIComponent(currentDraft.id)}/reject`, { method: 'POST', body: {} });
  currentDraft = data.draft;
  $('draftModal').hidden = true;
  await loadDrafts();
  toast('稿件已驳回');
};
$('approveBtn').onclick = async () => {
  if (!currentDraft) return;
  $('approveBtn').disabled = true;
  await saveDraft();
  try {
    const data = await api(`/api/drafts/${encodeURIComponent(currentDraft.id)}/approve`, { method: 'POST', body: {} });
    currentDraft = data.draft;
    if (data.submit.ok) toast('审核通过，稿件已提交到投稿平台');
    else {
      $('submitNotice').textContent = `审核已通过，但自动投稿未完成：${data.submit.reason}。可点击「复制稿件」手动提交。`;
      $('submitNotice').hidden = false;
      toast('审核通过；请在设置中配置投稿接口以启用一键投稿');
    }
    await loadDrafts();
  } catch (e) { toast(`提交失败：${e.message}`); }
  finally { $('approveBtn').disabled = false; }
};

init();
