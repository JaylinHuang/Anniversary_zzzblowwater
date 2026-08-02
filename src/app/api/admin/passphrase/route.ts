import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { hasDbPassphrase, updatePassphraseByAdmin } from "@/lib/passphrase";

export async function GET() {
  try {
    await requireAdmin();
    const dbManaged = await hasDbPassphrase();
    return NextResponse.json({
      dbManaged,
      hint: dbManaged
        ? "当前使用管理员在后台设置的口令"
        : "当前使用 .env 的 SITE_PASSPHRASE（或默认口令）；修改后将改由数据库接管",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 403 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const current = String(body.current || "");
    const next = String(body.next || "");
    const confirm = String(body.confirm || "");
    if (next !== confirm) {
      return NextResponse.json({ error: "两次输入的新口令不一致" }, { status: 400 });
    }
    await updatePassphraseByAdmin({ current, next });
    return NextResponse.json({
      ok: true,
      message: "口令已更新。已过门的访客仍可用旧门禁 cookie，新访客需用新口令。",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}
