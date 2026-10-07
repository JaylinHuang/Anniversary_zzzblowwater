import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { clearSponsorQr, writeSponsorNote, writeSponsorQr } from "@/lib/sponsor";

function wantsPage(req: Request) {
  return (req.headers.get("accept") || "").includes("text/html");
}

function back(req: Request) {
  return NextResponse.redirect(new URL("/sponsor", req.url), 303);
}

function fail(req: Request, e: unknown, fallback: string) {
  const raw = e instanceof Error ? e.message : fallback;
  const msg =
    raw === "UNAUTHORIZED" ? "请先登录" : raw === "FORBIDDEN" ? "只有管理员可以更换收款码" : raw || fallback;
  const status = raw === "UNAUTHORIZED" ? 401 : raw === "FORBIDDEN" ? 403 : 400;
  if (wantsPage(req)) {
    const url = new URL("/sponsor", req.url);
    url.searchParams.set("error", msg);
    return NextResponse.redirect(url, 303);
  }
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const form = await req.formData();
    const file = form.get("file");
    const note = form.get("note");
    if (file instanceof File && file.size > 0) {
      const card = await writeSponsorQr(file, note);
      if (wantsPage(req)) return back(req);
      return NextResponse.json({ ok: true, ...card });
    }
    const saved = await writeSponsorNote(note);
    if (wantsPage(req)) return back(req);
    return NextResponse.json({ ok: true, note: saved });
  } catch (e) {
    return fail(req, e, "保存失败");
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    await clearSponsorQr();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(req, e, "撤下失败");
  }
}
