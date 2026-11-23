import fs from 'node:fs';
import path from 'node:path';

const CONFIG_FILE = path.resolve(import.meta.dirname, '..', 'config.json');

export function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function saveConfig(next) {
  const current = getConfig();
  const merged = { ...current, ...next };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

export function publicConfig() {
  const cfg = getConfig();
  return {
    model: cfg.model || 'auto',
    orgName: cfg.orgName || '新邵县气象局',
    submitPlatformName: cfg.submitPlatform?.name || '',
    submitPlatformUrl: cfg.submitPlatform?.url || '',
    hasPushplusToken: Boolean(cfg.pushplusToken),
    reviewBaseUrl: cfg.reviewBaseUrl || '',
    dailyEnabled: cfg.daily?.enabled !== false,
  };
}
