import { NextResponse } from "next/server";
import { flushLiveInbox, runScheduledFlush } from "@/lib/daily-flush";
import { isOneBotConfigured, verifyOneBotToken } from "@/lib/onebot";

export const runtime = "nodejs";

/**
 * 外部定时器也可以打这个地址。
 * 默认只在到点时灌库；带 ?force=1 时立刻把收件箱灌进归档。
 * 鉴权和 OneBot 上报相同。
 */
export async function POST(req: Request) {
  if (!isOneBotConfigured()) {
    return NextResponse.json(
      { error: "未配置 ONEBOT_ACCESS_TOKEN" },
      { status: 503 },
    );
  }
  if (!verifyOneBotToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    if (force) {
      const result = await flushLiveInbox();
      return NextResponse.json({ ok: true, forced: true, ...result });
    }
    const ran = await runScheduledFlush();
    return NextResponse.json({ ok: true, ran });
  } catch (error) {
    console.error(
      "[daily-flush]",
      error instanceof Error ? error.message : "failed",
    );
    return NextResponse.json({ error: "flush failed" }, { status: 500 });
  }
}
