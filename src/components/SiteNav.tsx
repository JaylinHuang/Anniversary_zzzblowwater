"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SITE_BRAND } from "@/lib/constants";
import { isNavActive, type NavLink } from "@/lib/nav";
import { AccountMenu } from "@/components/AccountMenu";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 频道标签：编号 + 名称；当前项为实心斜切 */
function NavTab({
  href,
  label,
  index,
  active,
  accent,
}: {
  href: string;
  label: string;
  index: string;
  active: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`nav-tab ${active ? "is-active" : ""} ${accent ? "is-accent" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <span className="nav-idx">{index}</span>
      {label}
    </Link>
  );
}

export function SiteNav({
  primary,
  more,
  showAdmin,
  displayName,
  avatarUrl,
}: {
  primary: NavLink[];
  more: NavLink[];
  showAdmin: boolean;
  displayName: string;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreActive = more.some((l) => isNavActive(pathname, l.href));
  const total = primary.length + more.length;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  return (
    <header className="site-header sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
        {/* 品牌贴纸 + 频道计数 */}
        <Link href="/" className="flex items-center gap-3" aria-label={SITE_BRAND}>
          <span className="sticker sticker-brand">{SITE_BRAND}</span>
          <span className="eyebrow hidden lg:inline">
            CH {pad2(total)} // New Eridu
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="频道">
          {primary.map((l, i) => (
            <NavTab
              key={l.key}
              href={l.href}
              label={l.label}
              index={pad2(i + 1)}
              active={isNavActive(pathname, l.href)}
            />
          ))}

          {more.length ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className={`nav-tab ${moreActive || open ? "is-active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((v) => !v);
                }}
                aria-expanded={open}
                aria-haspopup="menu"
              >
                <span className="nav-idx">{pad2(primary.length + 1)}+</span>
                更多
                <span className="text-[0.6rem] opacity-70">{open ? "▴" : "▾"}</span>
              </button>
              {open ? (
                <div
                  className="panel panel-solid absolute right-0 mt-2 min-w-[12rem] p-1.5 shadow-lg"
                  role="menu"
                >
                  <p className="eyebrow px-3 pb-1 pt-1.5 text-[0.6rem]">More Channels</p>
                  {more.map((l, i) => (
                    <Link
                      key={l.key}
                      href={l.href}
                      role="menuitem"
                      className={`menu-item ${isNavActive(pathname, l.href) ? "is-active" : ""}`}
                    >
                      <span className="mono text-[0.62rem] opacity-70">
                        {pad2(primary.length + i + 1)}
                      </span>
                      {l.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {showAdmin ? (
            <NavTab
              href="/admin"
              label="管理"
              index="ADM"
              active={isNavActive(pathname, "/admin")}
              accent
            />
          ) : null}
        </nav>

        <AccountMenu displayName={displayName} avatarUrl={avatarUrl} />
      </div>

      {/* 手机：频道横滑 */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 md:hidden [scrollbar-width:none]">
        {primary.map((l, i) => (
          <Link
            key={l.key}
            href={l.href}
            className={`nav-chip ${isNavActive(pathname, l.href) ? "is-active" : ""}`}
          >
            <span className="mono text-[0.6rem] opacity-70">{pad2(i + 1)}</span>
            {l.label}
          </Link>
        ))}
        {more.map((l, i) => (
          <Link
            key={l.key}
            href={l.href}
            className={`nav-chip ${isNavActive(pathname, l.href) ? "is-active" : ""}`}
          >
            <span className="mono text-[0.6rem] opacity-70">
              {pad2(primary.length + i + 1)}
            </span>
            {l.label}
          </Link>
        ))}
        {showAdmin ? (
          <Link
            href="/admin"
            className={`nav-chip is-accent ${isNavActive(pathname, "/admin") ? "is-active" : ""}`}
          >
            <span className="mono text-[0.6rem] opacity-70">ADM</span>
            管理
          </Link>
        ) : null}
      </div>
    </header>
  );
}
