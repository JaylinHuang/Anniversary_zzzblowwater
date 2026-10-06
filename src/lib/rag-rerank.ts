import { detectConflicts } from "@/lib/agent-arbitrate";
import { isAgentCorpusText } from "@/lib/chat-parser";

export type RankedHit = {
  messageId: number;
  content: string;
  sentAt: string | null;
  /** 向量余弦，0~1 */
  vectorScore: number;
};

/** 问句与原文的字面重合，用来补上向量检索漏掉的原词 */
export function lexicalOverlap(query: string, text: string): number {
  const left = grams(query);
  if (!left.size) return 0;
  const right = grams(text);
  let hit = 0;
  for (const gram of left) {
    if (right.has(gram)) hit++;
  }
  return hit / left.size;
}

export function hybridScore(vectorScore: number, lexical: number): number {
  const vector = clamp01(vectorScore);
  const words = clamp01(lexical);
  return 0.62 * vector + 0.38 * words;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function grams(text: string): Set<string> {
  const compact = normalizeText(text);
  const set = new Set<string>();
  for (let i = 0; i < compact.length; i++) {
    set.add(compact[i]);
    if (i + 1 < compact.length) set.add(compact.slice(i, i + 2));
  }
  return set;
}

export function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, "")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "")
    .toLowerCase();
}

/** 几乎同一句话，索引和召回都只留一条 */
export function isNearDuplicate(a: string, b: string): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = Math.min(left.length, right.length);
  const longer = Math.max(left.length, right.length);
  if (shorter < 4 || shorter / longer < 0.8) return false;
  return left.includes(right) || right.includes(left);
}

/**
 * 混合分重排：丢掉无效句、近重复句，以及互相矛盾的旧说法。
 * 矛盾时保留混合分更高的一条；分数接近则保留时间更晚的一条。
 */
export function rerankHits(
  query: string,
  hits: RankedHit[],
  topK: number,
): RankedHit[] {
  const ranked = hits
    .filter((hit) => isAgentCorpusText(hit.content))
    .map((hit) => ({
      ...hit,
      hybrid: hybridScore(hit.vectorScore, lexicalOverlap(query, hit.content)),
    }))
    .filter((hit) => hit.hybrid >= 0.2)
    .sort((a, b) => b.hybrid - a.hybrid);

  const unique: typeof ranked = [];
  for (const hit of ranked) {
    if (unique.some((kept) => isNearDuplicate(kept.content, hit.content))) {
      continue;
    }
    unique.push(hit);
  }

  const dropped = new Set<number>();
  const ordered = [...unique].sort((a, b) => {
    const ta = a.sentAt || "";
    const tb = b.sentAt || "";
    if (ta !== tb) return ta < tb ? 1 : -1;
    return b.hybrid - a.hybrid;
  });
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const conflicts = detectConflicts([
        { source: "chat", text: ordered[i].content },
        { source: "chat", text: ordered[j].content },
      ]);
      if (!conflicts.length) continue;
      const newer = ordered[i];
      const older = ordered[j];
      const drop =
        Math.abs(newer.hybrid - older.hybrid) >= 0.08
          ? newer.hybrid >= older.hybrid
            ? older
            : newer
          : older;
      dropped.add(drop.messageId);
    }
  }

  return unique
    .filter((hit) => !dropped.has(hit.messageId))
    .slice(0, topK)
    .map(({ hybrid: _hybrid, ...hit }) => hit);
}
