import { NextResponse } from "next/server";
import { getSessionUser, isGateUnlocked } from "@/lib/auth";
import { withDb, rowFrom } from "@/lib/db";
import {
  hashQqCode,
  isCodeExpired,
  normalizeQq,
} from "@/lib/qq-verify";

function assertValidCode(
  challenge: { code_hash: string; expires_at: string } | null,
  code: string,
) {
  if (!challenge) throw new Error("CODE_MISSING");
  if (isCodeExpired(challenge.expires_at)) throw new Error("CODE_EXPIRED");
  if (challenge.code_hash !== hashQqCode(code)) throw new Error("CODE_WRONG");
}

export async function POST(req: Request) {
  try {
    if (!(await isGateUnlocked())) {
      return NextResponse.json({ error: "请先通过口令墙" }, { status: 401 });
    }

    const existing = await getSessionUser();
    if (existing) {
      return NextResponse.json({ ok: true, user: existing });
    }

    const body = await req.json().catch(() => ({}));
    const displayName = String(body.displayName || "")
      .trim()
      .replace(/\s+/g, " ");
    if (displayName.length < 1 || displayName.length > 24) {
      return NextResponse.json({ error: "昵称长度需为 1-24" }, { status: 400 });
    }

    const qq = normalizeQq(String(body.qq || ""));
    if (!qq) {
      return NextResponse.json(
        { error: "请绑定有效的 QQ 号（5–12 位数字）" },
        { status: 400 },
      );
    }

    const code = String(body.code || "").trim();
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: "请输入 6 位邮箱验证码" },
        { status: 400 },
      );
    }

    let userId: number;
    try {
      userId = await withDb((db) => {
        const byQq = rowFrom<{ id: number }>(
          db,
          `SELECT id FROM users WHERE qq_number = ? LIMIT 1`,
          [qq],
        );
        if (byQq) throw new Error("QQ_ALREADY_REGISTERED");

        const takenName = rowFrom<{ id: number }>(
          db,
          `SELECT id FROM users WHERE display_name = ? COLLATE NOCASE LIMIT 1`,
          [displayName],
        );
        if (takenName) throw new Error("DISPLAY_NAME_TAKEN");

        const challenge = rowFrom<{
          code_hash: string;
          expires_at: string;
        }>(
          db,
          `SELECT code_hash, expires_at FROM qq_email_codes WHERE qq = ?`,
          [qq],
        );
        assertValidCode(challenge, code);

        const count = rowFrom<{ c: number }>(
          db,
          `SELECT COUNT(*) as c FROM users`,
        );
        const role = (count?.c ?? 0) === 0 ? "admin" : "member";
        db.run(
          `INSERT INTO users (display_name, qq_number, role) VALUES (?, ?, ?)`,
          [displayName, qq, role],
        );
        const row = rowFrom<{ id: number }>(
          db,
          `SELECT id FROM users WHERE qq_number = ? LIMIT 1`,
          [qq],
        );
        if (!row) throw new Error("建档写入失败");

        db.run(`DELETE FROM qq_email_codes WHERE qq = ?`, [qq]);
        return row.id;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "QQ_ALREADY_REGISTERED") {
        return NextResponse.json(
          {
            error: "该 QQ 已注册过账号，请返回登录页用「口令 + 昵称」进入",
            code: "USE_LOGIN",
          },
          { status: 409 },
        );
      }
      if (msg === "DISPLAY_NAME_TAKEN") {
        return NextResponse.json(
          {
            error: "这个昵称已被占用，请换一个；若是你本人请直接去登录",
          },
          { status: 409 },
        );
      }
      if (msg === "CODE_MISSING") {
        return NextResponse.json(
          { error: "请先获取验证码（发送到你的 QQ 邮箱）" },
          { status: 400 },
        );
      }
      if (msg === "CODE_EXPIRED") {
        return NextResponse.json(
          { error: "验证码已过期，请重新发送" },
          { status: 400 },
        );
      }
      if (msg === "CODE_WRONG") {
        return NextResponse.json(
          { error: "验证码不正确" },
          { status: 400 },
        );
      }
      console.error("[auth/register] db", e);
      return NextResponse.json(
        {
          error: `数据库写入失败：${e instanceof Error ? e.message : "unknown"}`,
        },
        { status: 500 },
      );
    }

    // 注册成功不自动登录，引导回登录页用口令+昵称进入
    return NextResponse.json({ ok: true, userId });
  } catch (e) {
    console.error("[auth/register]", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `建档失败：${e.message}`
            : "建档失败：服务器错误",
      },
      { status: 500 },
    );
  }
}
