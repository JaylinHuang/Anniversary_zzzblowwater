import { NextResponse } from "next/server";
import { unlockGate, verifyPassphrase } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const passphrase = String(body.passphrase || "");
  if (!(await verifyPassphrase(passphrase))) {
    return NextResponse.json({ error: "口令不正确" }, { status: 401 });
  }
  await unlockGate();
  return NextResponse.json({ ok: true });
}
