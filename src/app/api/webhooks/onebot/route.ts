import { NextResponse } from "next/server";
import {
  ingestGroupMessage,
  isOneBotConfigured,
  verifyOneBotToken,
  type OneBotIncoming,
} from "@/lib/onebot";

export const runtime = "nodejs";

/**
 * OneBot / NapCat HTTP 上报接收端。
 * 鉴权：Authorization: Bearer <ONEBOT_ACCESS_TOKEN>
 * 或 Header X-OneBot-Token / ?access_token=
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

  let payload: OneBotIncoming;
  try {
    payload = (await req.json()) as OneBotIncoming;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await ingestGroupMessage(payload);
    // OneBot 约定：快速操作可返回空对象
    return NextResponse.json(result);
  } catch (e) {
    console.error("[onebot webhook]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ingest failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "onebot-webhook",
    configured: isOneBotConfigured(),
    hint: "POST OneBot/NapCat events to this endpoint with access token",
  });
}
