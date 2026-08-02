export type LoreFigureLite = {
  id: number;
  name: string;
  epithet: string;
  summary: string;
};

/** 星图人物检索：匹配名字/称号/简介 */
export function matchLoreFigure(f: LoreFigureLite, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${f.name} ${f.epithet} ${f.summary}`.toLowerCase();
  return hay.includes(q);
}

export function filterLoreFigures<T extends LoreFigureLite>(
  figures: T[],
  query: string,
): T[] {
  return figures.filter((f) => matchLoreFigure(f, query));
}
