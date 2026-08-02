import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getFeatureFlags, setFeatureFlag } from "@/lib/modules";
import type { ModuleKey } from "@/lib/constants";

export async function GET() {
  try {
    await requireAdmin();
    const flags = await getFeatureFlags();
    return NextResponse.json({ flags });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const key = body.key as ModuleKey;
    await setFeatureFlag(key, !!body.enabled);
    return NextResponse.json({ ok: true, flags: await getFeatureFlags() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}
