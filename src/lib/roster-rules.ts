/**
 * Agent 名册纯规则（无 IO），便于单测与维护。
 * 约定：准入必须严格大于 threshold*；永不踢人。
 */

export type RankedSpeaker = {
  qq: string;
  displayName: string;
  textCount: number;
};

/** 从已排序（票数降序、QQ 升序）列表选出基线，并冻结 threshold* */
export function pickBaselineRoster(
  ranked: RankedSpeaker[],
  baselineSize: number,
  softCap: number,
): { picked: RankedSpeaker[]; threshold: number } {
  const n = Math.max(0, Math.min(baselineSize, softCap, ranked.length));
  const picked = ranked.slice(0, n);
  const threshold = picked.length ? picked[picked.length - 1].textCount : 0;
  return { picked, threshold };
}

/** 是否满足增量准入：count 必须严格大于 threshold* */
export function qualifiesForAdmission(
  textCount: number,
  threshold: number,
): boolean {
  return textCount > threshold;
}

/**
 * 在软顶与已存在集合约束下，选出本轮应准入的 QQ（按排名顺序）。
 * 不删除任何人；已在名册中的跳过。
 */
export function selectAdmissions(
  ranked: RankedSpeaker[],
  opts: {
    threshold: number;
    softCap: number;
    existingQqs: Iterable<string>;
    currentEnabledCount: number;
  },
): RankedSpeaker[] {
  let slots = opts.softCap - opts.currentEnabledCount;
  if (slots <= 0) return [];
  const existing = new Set(opts.existingQqs);
  const out: RankedSpeaker[] = [];
  for (const s of ranked) {
    if (slots <= 0) break;
    if (existing.has(s.qq)) continue;
    if (!qualifiesForAdmission(s.textCount, opts.threshold)) continue;
    out.push(s);
    existing.add(s.qq);
    slots -= 1;
  }
  return out;
}
