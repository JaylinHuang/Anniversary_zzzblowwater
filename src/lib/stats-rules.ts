/** 趣味统计纯规则 */

/** 深夜修仙时段：23:00–04:59 */
export function isNightOwlHour(hour: number): boolean {
  if (!Number.isFinite(hour)) return false;
  const h = Math.floor(hour);
  return h >= 23 || (h >= 0 && h <= 4);
}

export function nightOwlRatio(nightCount: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((nightCount / total) * 1000) / 10;
}

/** 把按小时聚合的结果补成 00–23。没有时间戳时保持空数组，方便页面走空态 */
export function fillHourBuckets(
  rows: { hour: string; count: number }[],
): { hour: string; count: number }[] {
  if (rows.length === 0) return [];
  const map = new Map(
    rows.map((row) => [String(row.hour).padStart(2, "0"), Number(row.count) || 0]),
  );
  return Array.from({ length: 24 }, (_, hour) => {
    const key = String(hour).padStart(2, "0");
    return { hour: key, count: map.get(key) ?? 0 };
  });
}

/** 中文双字词频（过滤过短与占位） */
export function chineseBigramFreq(
  texts: string[],
  topN = 40,
): { word: string; count: number }[] {
  const freq = new Map<string, number>();
  for (const content of texts) {
    const cleaned = content.replace(/\[.*?\]/g, "").replace(/\s+/g, "");
    for (let i = 0; i < cleaned.length - 1; i++) {
      const gram = cleaned.slice(i, i + 2);
      if (/^[\u4e00-\u9fff]{2}$/.test(gram)) {
        freq.set(gram, (freq.get(gram) || 0) + 1);
      }
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}
