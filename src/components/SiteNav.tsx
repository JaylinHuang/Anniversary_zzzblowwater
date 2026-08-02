"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SITE_BRAND } from "@/lib/constants";
import { isNavActive, type NavLink } from "@/lib/nav";

function NavItem({
  href,
  label,
  active,
  accent,
}: {
  href: string;
  label: string;
  active: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap transition ${
        active
          ? "text-[var(--cyan)]"
          : accent
            ? "text-[var(--amber)] hover:text-[var(--amber-glow)]"
            : "hover:text-[var(--ink)]"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {label}
      {active ? (
        <span className="mt-1 block h-0.5 rounded-full bg-[var(--cyan)]" />
      ) : null}
    </Link>
  );
}

export function SiteNav({
  primary,
  more,
  showAdmin,
  displayName,
}: {
  primary: NavLink[];
  more: NavLink[];
  showAdmin: boolean;
  displayName: string;
}) {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreActive = more.some((l) => isNavActive(pathname, l.href));

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
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg-deep)_82%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="brand-font text-lg text-[var(--cyan)]">
          {SITE_BRAND}
        </Link>

        <nav className="hidden items-center gap-4 text-sm text-[var(--fog)] md:flex">
          {primary.map((l) => (
            <NavItem
              key={l.key}
              href={l.href}
              label={l.label}
              active={isNavActive(pathname, l.href)}
            />
          ))}

          {more.length ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className={`transition ${
                  moreActive || open
                    ? "text-[var(--cyan)]"
                    : "hover:text-[var(--ink)]"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((v) => !v);
                }}
                aria-expanded={open}
              >
                更多{open ? " ▴" : " ▾"}
              </button>
              {open ? (
                <div className="panel absolute right-0 mt-2 min-w-[10rem] rounded-xl p-2 shadow-lg">
                  {more.map((l) => (
                    <Link
                      key={l.key}
                      href={l.href}
                      className={`block rounded-lg px-3 py-2 text-sm transition hover:bg-white/5 ${
                        isNavActive(pathname, l.href)
                          ? "text-[var(--cyan)]"
                          : "text-[var(--fog)]"
                      }`}
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {showAdmin ? (
            <NavItem
              href="/admin"
              label="管理"
              active={isNavActive(pathname, "/admin")}
              accent
            />
          ) : null}
        </nav>

        <div className="text-sm text-[var(--fog)]">{displayName}</div>
      </div>

      {/* 手机：主入口横滑 + 更多折叠 */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 pb-3 text-xs text-[var(--fog)] md:hidden">
        {primary.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            className={`whitespace-nowrap rounded-full border px-3 py-1 ${
              isNavActive(pathname, l.href)
                ? "border-[rgba(61,224,208,0.55)] text-[var(--cyan)]"
                : "border-[var(--line)]"
            }`}
          >
            {l.label}
          </Link>
        ))}
        {more.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            className={`whitespace-nowrap rounded-full border px-3 py-1 opacity-80 ${
              isNavActive(pathname, l.href)
                ? "border-[rgba(61,224,208,0.55)] text-[var(--cyan)]"
                : "border-[var(--line)]"
            }`}
          >
            {l.label}
          </Link>
        ))}
        {showAdmin ? (
          <Link
            href="/admin"
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-[var(--amber)] ${
              isNavActive(pathname, "/admin")
                ? "border-[rgba(240,163,94,0.55)]"
                : "border-[rgba(240,163,94,0.35)]"
            }`}
          >
            管理
          </Link>
        ) : null}
      </div>
    </header>
  );
}
