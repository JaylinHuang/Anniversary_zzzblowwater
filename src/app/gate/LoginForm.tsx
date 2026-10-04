"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SITE_BRAND, SITE_TAGLINE } from "@/lib/constants";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const registered = params.get("registered") === "1";
  const [passphrase, setPassphrase] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase, displayName }),
      });
      const text = await res.text();
      let data: {
        error?: string;
        code?: string;
        needsAvatar?: boolean;
      } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error("登录接口异常，请重启 npm run dev 后再试");
      }
      if (!res.ok) {
        if (data.code === "USER_NOT_FOUND") {
          throw new Error(
            data.error || "当前不存在该用户，请先注册建档",
          );
        }
        throw new Error(data.error || "登录失败");
      }
      // 新账号或未设头像：先引导设置
      if (data.needsAvatar) {
        router.replace("/me/avatar?setup=1");
      } else {
        router.replace(next);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  const registerHref = `/gate/register${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <form
      onSubmit={onSubmit}
      className="panel panel-solid relative w-full max-w-md p-7 md:ml-auto md:p-8"
    >
      {/* 表头：贴纸 + 频道编号 */}
      <div className="flex items-center justify-between gap-3">
        <span className="sticker sticker-cyan">Login // 01</span>
        <span className="mono text-[0.65rem] tracking-[0.2em] text-[var(--fog)]">
          ROPE-NET ACCESS
        </span>
      </div>
      <h2 className="brand-font mt-4 text-2xl text-[var(--ink)]">接入 {SITE_BRAND}</h2>
      <p className="mt-1 text-sm text-[var(--fog)]">{SITE_TAGLINE}</p>

      {registered ? (
        <p className="mt-4 border-l-2 border-[var(--cyan)] bg-[rgba(61,224,208,0.08)] px-3 py-2 text-sm text-[var(--cyan)]">
          注册成功，请用昵称登录。登录后可设置头像。
        </p>
      ) : null}

      <label className="mt-6 block text-sm text-[var(--fog)]">
        <span className="flex items-center gap-2">
          <span className="mono text-[0.65rem] tracking-[0.2em] text-[var(--amber)]">01</span>
          群口令
        </span>
        <input
          className="input mt-2"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          required
          autoFocus
        />
      </label>

      <label className="mt-4 block text-sm text-[var(--fog)]">
        <span className="flex items-center gap-2">
          <span className="mono text-[0.65rem] tracking-[0.2em] text-[var(--amber)]">02</span>
          账号名（站内昵称）
        </span>
        <input
          className="input mt-2"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={24}
          placeholder="建档时使用的昵称"
        />
      </label>

      {error ? (
        <p className="mt-3 border-l-2 border-[var(--danger)] bg-[rgba(255,107,122,0.08)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <button className="btn btn-amber mt-6 w-full" disabled={loading} type="submit">
        {loading ? "接入中…" : "接入 →"}
      </button>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-[var(--line)] pt-4 text-sm text-[var(--fog)]">
        <span>还没有账号？</span>
        <Link href={registerHref} className="nav-chip hover:text-[var(--ink)]">
          <span className="mono text-[0.6rem] opacity-70">02</span>
          去注册建档
        </Link>
      </div>
    </form>
  );
}
