/** Meme 馆评论：纯函数与类型（前后端共用，不依赖数据库） */

import { formatBeijingDateTime } from "@/lib/date-key";

/** 单条评论的最大长度（按字符计） */
export const MAX_COMMENT_LENGTH = 300;

/** 页面展示用的评论 */
export type GalleryComment = {
  id: number;
  media_id: number;
  user_id: number;
  content: string;
  created_at: string;
  display_name: string;
  avatar_url: string | null;
};

export type CommentCheck =
  | { ok: true; content: string }
  | { ok: false; error: string };

/** 校验并规整评论内容：去首尾空白；空白、超长一律拒绝 */
export function checkCommentContent(raw: unknown): CommentCheck {
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) return { ok: false, error: "评论不能为空" };
  if ([...content].length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `评论不能超过 ${MAX_COMMENT_LENGTH} 字` };
  }
  return { ok: true, content };
}

/** 把评论按图片 id 分组，组内按时间从早到晚（同一时间按 id） */
export function groupCommentsByMedia(
  comments: GalleryComment[],
): Record<number, GalleryComment[]> {
  const map: Record<number, GalleryComment[]> = {};
  for (const c of comments) {
    (map[c.media_id] ||= []).push(c);
  }
  for (const list of Object.values(map)) {
    list.sort((a, b) =>
      a.created_at === b.created_at
        ? a.id - b.id
        : a.created_at < b.created_at
          ? -1
          : 1,
    );
  }
  return map;
}

/** 评论时间展示：数据库存的是 UTC，显示成北京时间的 "MM-DD HH:mm" */
export function formatCommentTime(createdAt: string): string {
  const full = formatBeijingDateTime(createdAt);
  if (full.length < 16) return createdAt;
  return `${full.slice(5, 10)} ${full.slice(11, 16)}`;
}

/** 无评论时的下一步提示 */
export const NO_COMMENT_HINT = "还没有评论。在下面写一句，当第一个留言的人吧。";
