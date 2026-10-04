import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

/** 退出当前会话，回到口令墙以便更换账号 */
export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "退出失败" },
      { status: 500 },
    );
  }
}
