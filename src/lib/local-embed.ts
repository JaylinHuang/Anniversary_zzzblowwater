/** 不依赖外部接口的字面向量：汉字双字用哈希落进固定维度，用来召回用词相近的原话 */
export const LOCAL_EMBED_MODEL = "local-cjk-bigram";
const DIMS = 384;

function bucket(token: string): { index: number; sign: number } {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return { index: (h >>> 0) % DIMS, sign: (h & 1) === 0 ? 1 : -1 };
}

export function localEmbed(text: string): number[] {
  const vec = new Float64Array(DIMS);
  const compact = text.replace(/\s+/g, "");
  for (let i = 0; i < compact.length; i++) {
    const one = bucket(compact[i]);
    vec[one.index] += one.sign * 0.35;
    if (i + 1 < compact.length) {
      const two = bucket(compact.slice(i, i + 2));
      vec[two.index] += two.sign;
    }
  }
  let norm = 0;
  for (let i = 0; i < DIMS; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => v / norm);
}
