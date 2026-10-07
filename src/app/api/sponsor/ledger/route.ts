import { NextResponse } from "next/server";
import { isAdmin, requireAdmin, requireUser } from "@/lib/auth";
import { addSponsorEntry, removeSponsorEntry } from "@/lib/sponsor";

function fail(e: unknown, fallback: string) {
  const raw = e instanceof Error ? e.message : fallback;
  const msg =
    raw === "UNAUTHORIZED" ? "请先登录" : raw === "FORBIDDEN" ? "只有管理员可以改别人的账" : raw || fallback;
  const status = raw === "UNAUTHORIZED" ? 401 : raw === "FORBIDDEN" ? 403 : 400;
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const requested = Number(body.userId);
    const userId = Number.isInteger(requested) && requested > 0 ? requested : user.id;
    if (userId !== user.id && !isAdmin(user.role)) {
      throw new Error("FORBIDDEN");
    }
    const id = await addSponsorEntry(userId, body.amount, body.note);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return fail(e, "登记失败");
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    await removeSponsorEntry(body.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "删除失败");
  }
}
