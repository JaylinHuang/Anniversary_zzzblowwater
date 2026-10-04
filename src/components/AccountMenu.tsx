"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { UserChip } from "@/components/UserChip";
import { apiFetch } from "@/lib/api-client";

export function AccountMenu({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { success, error, confirm } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const onMe = pathname === "/me" || pathname.startsWith("/me/");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  async function logout() {
    const ok = await confirm({
      title: "退出 / 更换账号",
      message:
        "将退出当前登录。之后可在口令墙用另一个账号登录或注册。",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      success("已退出");
      router.replace("/gate");
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "退出失败");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      {/* 账号芯片：在线点 + 头像 + 昵称 */}
      <button
        type="button"
        className={`acct-chip ${open || onMe ? "is-open" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        title={displayName}
      >
        <span className="dot-live ml-1.5 shrink-0" aria-hidden />
        <UserChip displayName={displayName} avatarUrl={avatarUrl} />
        <span className="text-[0.6rem] opacity-70">{open ? "▴" : "▾"}</span>
      </button>

      {open ? (
        <div
          className="panel panel-solid absolute right-0 z-50 mt-2 min-w-[11rem] p-1.5 shadow-lg"
          role="menu"
        >
          <p className="eyebrow px-3 pb-1 pt-1.5 text-[0.6rem]">Account // 绳网身份</p>
          <Link
            href="/me"
            role="menuitem"
            className={`menu-item ${
              onMe && !pathname.startsWith("/me/avatar") ? "is-active" : ""
            }`}
            onClick={() => setOpen(false)}
          >
            <span className="mono text-[0.62rem] opacity-70">01</span>
            个人中心
          </Link>
          <Link
            href="/me/avatar"
            role="menuitem"
            className={`menu-item ${pathname.startsWith("/me/avatar") ? "is-active" : ""}`}
            onClick={() => setOpen(false)}
          >
            <span className="mono text-[0.62rem] opacity-70">02</span>
            {avatarUrl ? "更换头像" : "设置头像"}
          </Link>
          <div className="mx-3 my-1 h-px bg-[var(--line)]" />
          <button
            type="button"
            role="menuitem"
            className="menu-item is-danger"
            disabled={busy}
            onClick={() => void logout()}
          >
            <span className="mono text-[0.62rem] opacity-70">⏻</span>
            {busy ? "退出中…" : "退出 / 换号"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
