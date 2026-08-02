import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const jar = await cookies();
  if (jar.get("zzz_gate")?.value !== "1") {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { name } = await ctx.params;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    return new NextResponse("Bad Request", { status: 400 });
  }
  const filePath = path.join(process.cwd(), "data", "uploads", name);
  if (!fs.existsSync(filePath)) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(name).toLowerCase();
  const type =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".gif"
          ? "image/gif"
          : ext === ".webp"
            ? "image/webp"
            : "application/octet-stream";
  return new NextResponse(buf, {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" },
  });
}
