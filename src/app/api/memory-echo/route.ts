import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getMemoryEcho } from "@/lib/memory-echo";

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const salt = Number(url.searchParams.get("salt") || 0) || 0;
    const echo = await getMemoryEcho({ salt });
    if (!echo) {
      return NextResponse.json(
        { error: "暂无可用记忆，请先导入群聊归档" },
        { status: 404 },
      );
    }
    return NextResponse.json({ echo });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 401 },
    );
  }
}
