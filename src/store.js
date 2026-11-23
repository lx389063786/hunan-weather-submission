import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getConfig } from './config.js';
import { withSignature } from './signature.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DRAFTS_FILE = path.join(DATA_DIR, 'drafts.json');
const TOPICS_FILE = path.join(DATA_DIR, 'topics.txt');
const USED_FILE = path.join(DATA_DIR, 'used-topics.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DRAFTS_FILE)) fs.writeFileSync(DRAFTS_FILE, '[]', 'utf8');
  if (!fs.existsSync(TOPICS_FILE)) {
    fs.writeFileSync(TOPICS_FILE, [
      '新邵县气象局开展区域自动气象站巡检维护，提升基层监测数据质量',
      '新邵县气象局联合应急管理局开展气象灾害预警信号业务培训',
      '新邵县气象局走进校园开展气象科普宣传，提升学生防灾避险意识',
      '新邵县气象局开展防雷安全专项检查，拧紧重点场所安全阀',
      '新邵县气象局深化党建与业务融合，开展主题党日暨气象服务实践活动',
      '新邵县气象局开展森林防灭火气象服务实战演练，提升应急保障能力',
      '新邵县气象局组织气象信息员培训，打通预警传递最后一公里',
      '新邵县气象局推进智能观测能力建设，为极端天气预警提供精密支撑',
    ].join('\n'), 'utf8');
  }
  if (!fs.existsSync(USED_FILE)) fs.writeFileSync(USED_FILE, '[]', 'utf8');
}

function readJson(file, fallback) {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensure();
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

export function listDrafts() {
  const drafts = readJson(DRAFTS_FILE, []);
  return Array.isArray(drafts) ? drafts : [];
}

export function getDraft(id) {
  return listDrafts().find((d) => d.id === id) || null;
}

export function createDraft({ title, content, source, input, context }) {
  const drafts = listDrafts();
  const draft = {
    id: crypto.randomUUID(),
    title,
    content,
    source,
    input,
    // 保存本次选题上下文，供「重新生成」复用同一批参考，避免换题或丢失由头
    context: context || null,
    status: 'draft',
    createdAt: new Date().toISOString(),
    submittedAt: null,
    submitNote: null,
  };
  drafts.unshift(draft);
  writeJson(DRAFTS_FILE, drafts);
  return draft;
}

export function updateDraft(id, patch) {
  const drafts = listDrafts();
  const index = drafts.findIndex((d) => d.id === id);
  if (index < 0) return null;
  const next = { ...patch };
  if (typeof next.content === 'string') next.content = withSignature(next.content);
  drafts[index] = { ...drafts[index], ...next };
  writeJson(DRAFTS_FILE, drafts);
  return drafts[index];
}

export function deleteDraft(id) {
  const drafts = listDrafts().filter((d) => d.id !== id);
  writeJson(DRAFTS_FILE, drafts);
  return true;
}

export function pickTopic() {
  ensure();
  const topics = fs.readFileSync(TOPICS_FILE, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
  if (!topics.length) return `${getConfig().orgName || '新邵县气象局'}开展基层气象服务能力提升工作`;
  const used = readJson(USED_FILE, []);
  const fresh = topics.filter((t) => !used.includes(t));
  const topic = (fresh.length ? fresh : topics)[Math.floor(Math.random() * (fresh.length || topics.length))];
  const nextUsed = fresh.length ? [...used, topic] : [topic];
  writeJson(USED_FILE, nextUsed.slice(-topics.length));
  return topic;
}

function localDay(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 当天是否已生成过每日草稿，用于防止同一天重复写稿和重复推送
export function hasDraftToday(source = 'daily') {
  const today = localDay(new Date().toISOString());
  return listDrafts().some((d) => d.source === source && localDay(d.createdAt) === today);
}

export function dataPaths() {
  return { DRAFTS_FILE, TOPICS_FILE };
}
