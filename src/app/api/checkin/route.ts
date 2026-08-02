import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCheckinStatus, performCheckin, todayCheckinCount } from "@/lib/checkin";

export async function GET() {
  try {
    const user = await requireUser();
    const status = await getCheckinStatus(user.id);
    const todayTotal = await todayCheckinCount();
    return NextResponse.json({ ...status, todayTotal });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 401 },
    );
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    const status = await performCheckin(user.id);
    const todayTotal = await todayCheckinCount();
    return NextResponse.json({ ...status, todayTotal });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 401 },
    );
  }
}
