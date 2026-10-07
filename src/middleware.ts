import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = [
  "/gate",
  "/api/auth/unlock",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/send-code",
  "/api/auth/logout",
  "/api/health",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/uploads")
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const gated = req.cookies.get("zzz_gate")?.value === "1";
  const isPublic = PUBLIC.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (!gated && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/gate";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 已过口令但仍需在 /gate 建档（无会话）时允许停留
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
