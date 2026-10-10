import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { readSiteLog } from "@/lib/site-log";

/** 管理员查看运行日志。不读聊天库 */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(readSiteLog());
  } catch (e) {
    const message = e instanceof Error ? e.message : "ERROR";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
