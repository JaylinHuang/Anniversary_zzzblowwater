import { createHash, timingSafeEqual } from "crypto";

export function hashPassphrase(raw: string) {
  return createHash("sha256").update(raw.normalize()).digest("hex");
}

export function safeEqualStr(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
