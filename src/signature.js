// 稿件统一署名，所有稿件（自动生成、手动写稿、编辑后保存）都保持一致

export const DRAFT_SIGNATURE = '（编辑：刘骁 审核：刘前初、谢意权）';

export function withSignature(content) {
  const cleaned = String(content || '')
    .replace(/\n*[（(]\s*编辑[：:]\s*刘骁[\s，,、]*审核[：:]\s*刘前初[\s、,，]*谢意权\s*[）)]\s*$/, '')
    .trim();
  return `${cleaned}\n\n${DRAFT_SIGNATURE}`;
}
