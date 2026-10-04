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
      // 空结果不是错误：返回 200 + echo:null，前端据此展示「去归档」入口
      return NextResponse.json({ echo: null });
    }
    return NextResponse.json({ echo });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 401 },
    );
  }
}
