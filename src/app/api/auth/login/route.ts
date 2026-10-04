import { NextResponse } from "next/server";
import {
  createSession,
  getSessionUser,
  unlockGate,
  verifyPassphrase,
} from "@/lib/auth";
import { getDb, rowFrom } from "@/lib/db";

/** 已建档用户：群口令 + 站内昵称登录（无需再收 QQ 验证码） */
export async function POST(req: Request) {
  try {
    const existing = await getSessionUser();
    if (existing) {
      return NextResponse.json({ ok: true, user: existing });
    }

    const body = await req.json().catch(() => ({}));
    const passphrase = String(body.passphrase || "");
    const displayName = String(body.displayName || "")
      .trim()
      .replace(/\s+/g, " ");

    if (!(await verifyPassphrase(passphrase))) {
      return NextResponse.json({ error: "口令错误" }, { status: 401 });
    }
    if (displayName.length < 1 || displayName.length > 24) {
      return NextResponse.json({ error: "请输入站内昵称" }, { status: 400 });
    }

    await unlockGate();

    const db = await getDb();
    const user = rowFrom<{
      id: number;
      display_name: string;
      role: string;
      avatar_url: string | null;
    }>(
      db,
      `SELECT id, display_name, role, avatar_url
       FROM users WHERE display_name = ? COLLATE NOCASE LIMIT 1`,
      [displayName],
    );
    if (!user) {
      return NextResponse.json(
        {
          error: "当前不存在该用户，请先注册建档",
          code: "USER_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    await createSession(user.id);
    const hasAvatar = !!(user.avatar_url || "").trim();
    return NextResponse.json({
      ok: true,
      userId: user.id,
      displayName: user.display_name,
      avatarUrl: hasAvatar ? user.avatar_url : null,
      needsAvatar: !hasAvatar,
    });
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "登录失败" },
      { status: 500 },
    );
  }
}
