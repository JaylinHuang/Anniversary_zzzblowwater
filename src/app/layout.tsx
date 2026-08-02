import type { Metadata } from "next";
import "./globals.css";
import { SITE_BRAND, SITE_TAGLINE } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${SITE_BRAND} · ${SITE_TAGLINE}`,
  description: "绝区零 QQ 群一周年社区站",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 关键主题兜底：防止样式文件偶发未加载时整站变白 */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root{--bg-deep:#0b1118;--bg-panel:#121a24;--fog:#9aa7b8;--ink:#e8eef6;--cyan:#3de0d0;--amber:#f0a35e;--line:rgba(61,224,208,.22);--danger:#ff6b7a}
              html,body{margin:0;min-height:100%;background:#0b1118;color:#e8eef6;font-family:"Microsoft YaHei","PingFang SC",sans-serif}
              a{color:inherit;text-decoration:none}
              .panel{background:rgba(18,26,36,.88);border:1px solid rgba(61,224,208,.22)}
              .btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(61,224,208,.22);background:linear-gradient(180deg,rgba(61,224,208,.18),rgba(61,224,208,.05));color:#e8eef6;padding:.7rem 1.2rem;border-radius:999px;cursor:pointer}
              .input{width:100%;background:rgba(0,0,0,.28);border:1px solid rgba(61,224,208,.22);color:#e8eef6;border-radius:.75rem;padding:.75rem 1rem}
              .brand-font{letter-spacing:.04em}
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
