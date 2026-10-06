import { cleanWordCloudTexts, type CloudWord } from "@/lib/wordcloud-rules";

export type { CloudWord };

/**
 * 在 Node 里直接清洗词云。
 * 不调用 Python：生产镜像没有解释器，也没有把脚本拷进运行目录，
 * 以前失败后会退回双字滑动窗口，虚词和群名都会漏进来。
 */
export async function cleanWordCloud(
  texts: string[],
  groupName: string,
  topN = 40,
  banNames: string[] = [],
): Promise<CloudWord[]> {
  return cleanWordCloudTexts(texts, groupName, topN, banNames);
}
