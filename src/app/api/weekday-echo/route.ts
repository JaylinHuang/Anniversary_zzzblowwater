import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getWeekdayEchoes } from "@/lib/weekday-echo";

export async function GET() {
  try {
    await requireUser();
    const items = await getWeekdayEchoes();
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 401 },
    );
  }
}
