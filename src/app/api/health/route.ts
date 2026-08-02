import { NextResponse } from "next/server";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { GROUP_NAME } from "@/lib/constants";
import { getDb, rowFrom } from "@/lib/db";
import { isLlmConfigured } from "@/lib/llm";
import { getSetupStatus } from "@/lib/setup-status";

/** 公开探活；管理员额外拿到开箱清单（不含密钥） */
export async function GET() {
  try {
    const db = await getDb();
    const msgCount = Number(
      rowFrom<{ c: number }>(db, `SELECT COUNT(*) as c FROM chat_messages`)
        ?.c ?? 0,
    );
    const base = {
      ok: true as const,
      groupName: GROUP_NAME,
      time: new Date().toISOString(),
      db: true,
      messages: msgCount,
      llmConfigured: isLlmConfigured(),
    };

    const user = await getSessionUser();
    if (user && isAdmin(user.role)) {
      const setup = await getSetupStatus();
      return NextResponse.json({ ...base, setup });
    }
    return NextResponse.json(base);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "HEALTH_FAILED",
      },
      { status: 500 },
    );
  }
}
