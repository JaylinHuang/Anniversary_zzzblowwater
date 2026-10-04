import { createHash, randomInt } from "crypto";

export const QQ_CODE_TTL_MS = 5 * 60 * 1000;
export const QQ_CODE_COOLDOWN_MS = 60 * 1000;

/** 规范化并校验 QQ 号（5–12 位数字） */
export function normalizeQq(input: string): string | null {
  const q = String(input || "").trim().replace(/\s+/g, "");
  if (!/^\d{5,12}$/.test(q)) return null;
  return q;
}

export function qqMailbox(qq: string) {
  return `${qq}@qq.com`;
}

export function generateQqCode() {
  return String(randomInt(100000, 1000000));
}

export function hashQqCode(code: string) {
  return createHash("sha256").update(`qq-code:${code}`).digest("hex");
}

export function canResendAt(lastSentAtIso: string | null | undefined, now = Date.now()) {
  if (!lastSentAtIso) return { ok: true as const, waitSec: 0 };
  const last = Date.parse(lastSentAtIso);
  if (Number.isNaN(last)) return { ok: true as const, waitSec: 0 };
  const remain = QQ_CODE_COOLDOWN_MS - (now - last);
  if (remain <= 0) return { ok: true as const, waitSec: 0 };
  return { ok: false as const, waitSec: Math.ceil(remain / 1000) };
}

export function isCodeExpired(expiresAtIso: string, now = Date.now()) {
  const t = Date.parse(expiresAtIso);
  if (Number.isNaN(t)) return true;
  return now > t;
}

export function makeExpiryIso(now = Date.now()) {
  return new Date(now + QQ_CODE_TTL_MS).toISOString();
}
