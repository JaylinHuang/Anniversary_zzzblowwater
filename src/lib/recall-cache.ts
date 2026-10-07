import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * 群聊检索结果的本地回执。
 * 正文放在用户浏览器里，服务器只留一把进程内密钥用来验签。
 * 验签通过就不必再扫归档。密钥随进程消失，重启后第一次仍会慢查。
 */

export type RecallPack = {
  agentId: number;
  needles: string[];
  names: string[];
  lines: string[];
  exp: number;
};

const TTL_MS = 6 * 60 * 60 * 1000;
const secret = randomBytes(32);

function sign(body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function sameBytes(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** 话题词是否同一组。空词不算命中，避免闲聊把上一次的事实缓存拿来用 */
export function sameNeedles(left: string[], right: string[]): boolean {
  if (!left.length || left.length !== right.length) return false;
  const seen = new Set(right);
  return left.every((item) => seen.has(item));
}

export function sealRecall(
  pack: Omit<RecallPack, "exp"> & { exp?: number },
): string {
  const body = JSON.stringify({
    agentId: pack.agentId,
    needles: pack.needles.slice(0, 4),
    names: pack.names.slice(0, 3),
    lines: pack.lines.slice(0, 8),
    exp: pack.exp ?? Date.now() + TTL_MS,
  } satisfies RecallPack);
  return `${Buffer.from(body).toString("base64url")}.${sign(body)}`;
}

export function openRecall(token: string, agentId: number, now = Date.now()): RecallPack | null {
  const text = token.trim();
  const dot = text.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = text.slice(0, dot);
  const mac = text.slice(dot + 1);
  let body = "";
  try {
    body = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!sameBytes(sign(body), mac)) return null;
  let pack: RecallPack;
  try {
    pack = JSON.parse(body) as RecallPack;
  } catch {
    return null;
  }
  if (!pack || pack.agentId !== agentId) return null;
  if (!Array.isArray(pack.needles) || !Array.isArray(pack.lines)) return null;
  if (!Number.isFinite(pack.exp) || pack.exp < now) return null;
  return pack;
}
