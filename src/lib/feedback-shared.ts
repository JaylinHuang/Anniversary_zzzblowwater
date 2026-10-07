/** 一次提交的条数上限，避免一次写入撑住整库落盘 */
export const FEEDBACK_BATCH_MAX = 12;
export const FEEDBACK_BODY_MAX = 200;
export const FEEDBACK_NOTE_MAX = 400;

export type FeedbackStatus = "pending" | "accepted" | "rejected";

export type FeedbackDraft = {
  body: string;
  note: string;
};

export type FeedbackRow = {
  id: number;
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  body: string;
  note: string;
  status: FeedbackStatus;
  createdAt: string;
  resolvedAt: string | null;
};
