import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { ToastProvider } from "@/components/ToastProvider";
import { Atmosphere } from "@/components/fx/Atmosphere";
import { NightDust } from "@/components/fx/NightDust";
import { GROUP_NAME, SITE_BRAND } from "@/lib/constants";
import { getSessionUser } from "@/lib/auth";

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/gate");
  }

  // 无头像：引导设置（「稍后再说」写入跳过 cookie）
  if (!user.avatarUrl) {
    const pathname = (await headers()).get("x-pathname") || "";
    const skipped = (await cookies()).get("zzz_skip_avatar")?.value === "1";
    if (!skipped && pathname && !pathname.startsWith("/me/avatar")) {
      redirect("/me/avatar?setup=1");
    }
  }

  return (
    <ToastProvider>
      <SiteHeader />
      {/* 站点底层浮尘：fixed z=0，正文与页脚抬到 z=1 压在上面，粒子只在底下飘 */}
      <NightDust scope="page" />
      <main className="relative z-[1] mx-auto min-h-[calc(100vh-4rem)] max-w-6xl px-4 py-6">
        {children}
      </main>

      {/* 页脚：街牌式一行 */}
      <footer className="relative z-[1] mt-10 border-t border-[var(--line)]">
        <div className="hazard-cyan h-[3px] opacity-60" />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-[var(--fog)]">
          <div className="flex items-center gap-3">
            <span className="sticker sticker-ink">{SITE_BRAND}</span>
            <span className="mono tracking-[0.15em]">{GROUP_NAME} · 非官方社区站</span>
          </div>
          <span className="eyebrow">New Eridu // Rope Net Link OK</span>
        </div>
      </footer>

      <Atmosphere />
    </ToastProvider>
  );
}
