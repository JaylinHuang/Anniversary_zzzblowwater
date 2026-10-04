import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { getDb, rowFrom, withDb } from "@/lib/db";
import type { Role } from "@/lib/constants";
import { verifyPassphrase as verifyGatePassphrase } from "@/lib/passphrase";

const SESSION_COOKIE = "zzz_session";
const GATE_COOKIE = "zzz_gate";

export type SessionUser = {
  id: number;
  displayName: string;
  role: Role;
  publicProfile: boolean;
  optOutLeaderboard: boolean;
  /** 头像 URL，如 /uploads/xxx.png；未设置则为 null */
  avatarUrl: string | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** 整站口令校验（库内管理员设置优先，否则 .env / 默认值） */
export async function verifyPassphrase(input: string) {
  return verifyGatePassphrase(input);
}

export async function unlockGate() {
  const jar = await cookies();
  jar.set(GATE_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

export async function isGateUnlocked() {
  const jar = await cookies();
  return jar.get(GATE_COOKIE)?.value === "1";
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  await withDb((db) => {
    db.run(`INSERT INTO sessions (token, user_id) VALUES (?, ?)`, [
      hashToken(token),
      userId,
    ]);
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await withDb((db) => {
      db.run(`DELETE FROM sessions WHERE token = ?`, [hashToken(token)]);
    });
  }
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const row = rowFrom<{
    id: number;
    display_name: string;
    role: string;
    public_profile: number;
    opt_out_leaderboard: number;
    avatar_url: string | null;
  }>(
    db,
    `SELECT u.id, u.display_name, u.role, u.public_profile, u.opt_out_leaderboard,
            u.avatar_url
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
    [hashToken(token)],
  );
  if (!row) return null;
  const avatar = (row.avatar_url || "").trim();
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role as Role,
    publicProfile: !!row.public_profile,
    optOutLeaderboard: !!row.opt_out_leaderboard,
    avatarUrl: avatar || null,
  };
}

export function canModerate(role: Role) {
  return role === "moderator" || role === "admin";
}

export function isAdmin(role: Role) {
  return role === "admin";
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function requireModerator() {
  const user = await requireUser();
  if (!canModerate(user.role)) throw new Error("FORBIDDEN");
  return user;
}
