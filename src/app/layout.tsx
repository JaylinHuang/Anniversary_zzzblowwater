import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_BRAND, SITE_TAGLINE } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${SITE_BRAND} · ${SITE_TAGLINE}`,
  description: "绝区零 QQ 群一周年社区站",
};

export const viewport: Viewport = {
  themeColor: "#0a0e14",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 关键主题兜底：样式文件偶发未加载时，仍是深夜底色 + 斜切面板，不闪白。
            放在 @layer 里，正常加载的 globals.css（未分层）优先级更高，不会被这里覆盖 */}
        <style
          dangerouslySetInnerHTML={{
            __html: `@layer fallback{
              :root{--bg-deep:#0a0e14;--bg-panel:#121a24;--bg-ink:#05070a;--fog:#a6b3c5;--ink:#eef3f9;--cyan:#3de0d0;--cyan-ink:#061214;--amber:#f0a35e;--amber-ink:#1a0f04;--paper:#f1ebdc;--paper-ink:#16181c;--line:rgba(61,224,208,.22);--line-strong:rgba(61,224,208,.5);--danger:#ff6b7a;--chamfer:14px;--slant:10px;color-scheme:dark}
              html,body{margin:0;min-height:100%;background:#0a0e14;color:#eef3f9;font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif}
              a{color:inherit;text-decoration:none}
              .panel{background:rgba(18,26,36,.94);border:1px solid rgba(61,224,208,.22);border-radius:2px;clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))}
              .btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;border:0;background:#3de0d0;color:#061214;font-weight:700;padding:.72rem 1.4rem;border-radius:2px;cursor:pointer;clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)}
              .btn-amber{background:#f0a35e;color:#1a0f04}
              .btn-ghost{background:rgba(10,14,20,.35);color:#eef3f9;box-shadow:inset 0 0 0 1px rgba(61,224,208,.5)}
              .input{width:100%;background:rgba(0,0,0,.38);border:1px solid rgba(61,224,208,.22);color:#eef3f9;border-radius:2px;padding:.75rem 1rem}
              .brand-font{font-weight:900;letter-spacing:.01em}
              .sticker{display:inline-flex;padding:.22em .7em .2em;background:#f0a35e;color:#1a0f04;font-weight:700;text-transform:uppercase}
              .eyebrow{font-family:ui-monospace,Consolas,monospace;font-size:.7rem;letter-spacing:.28em;text-transform:uppercase;color:#f0a35e}
              .linkup{display:none}
            }`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
