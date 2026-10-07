import { NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createFeedbackBatch, resolveFeedback } from "@/lib/feedback";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const count = await createFeedbackBatch(user.id, body.items);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "提交失败" },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const count = await resolveFeedback(body.ids, body.status);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "处理失败" },
      { status: 400 },
    );
  }
}
