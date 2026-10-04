import { NextResponse } from "next/server";
import { isGateUnlocked } from "@/lib/auth";
import { getDb, rowFrom, withDb } from "@/lib/db";
import { isMailConfigured, sendQqVerifyEmail } from "@/lib/mail";
import {
  canResendAt,
  generateQqCode,
  hashQqCode,
  makeExpiryIso,
  normalizeQq,
  qqMailbox,
} from "@/lib/qq-verify";

export async function POST(req: Request) {
  try {
    if (!(await isGateUnlocked())) {
      return NextResponse.json(
        { error: "请先填写正确的群口令并解锁" },
        { status: 401 },
      );
    }

    if (!isMailConfigured()) {
      return NextResponse.json(
        {
          error:
            "站点尚未配置发信邮箱（QQ_SMTP_USER / QQ_SMTP_PASS）。请管理员在 .env 配置后重启。",
        },
        { status: 503 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const qq = normalizeQq(String(body.qq || ""));
    if (!qq) {
      return NextResponse.json(
        { error: "请输入有效的 QQ 号（5–12 位数字）" },
        { status: 400 },
      );
    }

    const db = await getDb();
    const existing = rowFrom<{ id: number; display_name: string }>(
      db,
      `SELECT id, display_name FROM users WHERE qq_number = ? LIMIT 1`,
      [qq],
    );
    if (existing) {
      return NextResponse.json(
        {
          error: `该 QQ 已绑定「${existing.display_name}」，无需再注册，请返回登录页用口令+昵称进入`,
          code: "USE_LOGIN",
        },
        { status: 409 },
      );
    }

    const prev = rowFrom<{ sent_at: string }>(
      db,
      `SELECT sent_at FROM qq_email_codes WHERE qq = ?`,
      [qq],
    );
    const cool = canResendAt(prev?.sent_at);
    if (!cool.ok) {
      return NextResponse.json(
        { error: `发送过于频繁，请 ${cool.waitSec} 秒后再试` },
        { status: 429 },
      );
    }

    const code = generateQqCode();
    const nowIso = new Date().toISOString();
    const expiresAt = makeExpiryIso();

    await sendQqVerifyEmail(qqMailbox(qq), code);

    await withDb((db) => {
      db.run(
        `INSERT INTO qq_email_codes (qq, code_hash, sent_at, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(qq) DO UPDATE SET
           code_hash = excluded.code_hash,
           sent_at = excluded.sent_at,
           expires_at = excluded.expires_at`,
        [qq, hashQqCode(code), nowIso, expiresAt],
      );
    });

    return NextResponse.json({
      ok: true,
      mailbox: qqMailbox(qq),
      expiresInSec: 300,
      cooldownSec: 60,
      hint: "验证通过后将创建新账号",
    });
  } catch (e) {
    console.error("[auth/send-code]", e);
    if (e instanceof Error && e.message === "MAIL_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: "发信未配置，请管理员设置 QQ SMTP" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `验证码发送失败：${e.message}`
            : "验证码发送失败",
      },
      { status: 500 },
    );
  }
}
