"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SITE_BRAND, SITE_TAGLINE } from "@/lib/constants";

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [passphrase, setPassphrase] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [qq, setQq] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function unlockGate() {
    const unlock = await fetch("/api/auth/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    const unlockText = await unlock.text();
    let unlockData: { error?: string } = {};
    try {
      unlockData = unlockText ? JSON.parse(unlockText) : {};
    } catch {
      throw new Error("口令校验接口异常，请重启 npm run dev 后再试");
    }
    if (!unlock.ok) throw new Error(unlockData.error || "口令错误");
  }

  async function sendCode() {
    setError("");
    setInfo("");
    if (!passphrase.trim()) {
      setError("请先填写群口令");
      return;
    }
    if (!/^\d{5,12}$/.test(qq.trim())) {
      setError("请输入有效 QQ 号（5–12 位数字）");
      return;
    }
    setSending(true);
    try {
      await unlockGate();
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qq: qq.trim() }),
      });
      const text = await res.text();
      let data: { error?: string; mailbox?: string; hint?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error("发送验证码接口异常");
      }
      if (!res.ok) throw new Error(data.error || "发送失败");
      setInfo(
        `${data.hint || `验证码已发送至 ${data.mailbox || `${qq.trim()}@qq.com`}`}（5 分钟内有效）`,
      );
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await unlockGate();
      const reg = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          qq: qq.trim(),
          code: code.trim(),
        }),
      });
      const regText = await reg.text();
      let regData: { error?: string; mode?: string } = {};
      try {
        regData = regText ? JSON.parse(regText) : {};
      } catch {
        throw new Error("建档接口异常，请重启服务后再试");
      }
      if (!reg.ok) throw new Error(regData.error || "注册失败");

      setDone(true);
      setInfo("注册成功！请返回登录页，用「群口令 + 站内昵称」进入。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  const nextQuery =
    next && next !== "/" ? `next=${encodeURIComponent(next)}` : "";
  /** 未注册时返回登录：不要带 registered=1 */
  const loginHref = `/gate${nextQuery ? `?${nextQuery}` : ""}`;
  /** 仅注册成功后带标记，登录页才显示成功提示 */
  const loginAfterRegisterHref = `/gate?registered=1${nextQuery ? `&${nextQuery}` : ""}`;

  /** 字段编号标签 */
  const fieldLabel = (idx: string, text: string) => (
    <span className="flex items-center gap-2">
      <span className="mono text-[0.65rem] tracking-[0.2em] text-[var(--amber)]">{idx}</span>
      {text}
    </span>
  );

  if (done) {
    return (
      <div className="panel panel-solid relative w-full max-w-md p-7 md:ml-auto md:p-8">
        <div className="flex items-center justify-between gap-3">
          <span className="sticker">Registered</span>
          <span className="mono text-[0.65rem] tracking-[0.2em] text-[var(--fog)]">
            ARCHIVE OK
          </span>
        </div>
        <h2 className="brand-font mt-4 text-2xl text-[var(--ink)]">建档完成 · {SITE_BRAND}</h2>
        <p className="mt-4 border-l-2 border-[var(--cyan)] bg-[rgba(61,224,208,0.08)] px-3 py-2 text-sm text-[var(--cyan)]">
          {info}
        </p>
        <Link
          href={loginAfterRegisterHref}
          className="btn btn-amber mt-6 block w-full text-center"
        >
          返回登录 →
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="panel panel-solid relative w-full max-w-md p-7 md:ml-auto md:p-8"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="sticker">Register // 02</span>
        <span className="mono text-[0.65rem] tracking-[0.2em] text-[var(--fog)]">
          NEW MEMBER FILE
        </span>
      </div>
      <h2 className="brand-font mt-4 text-2xl text-[var(--ink)]">建档 · {SITE_BRAND}</h2>
      <p className="mt-1 text-sm text-[var(--fog)]">{SITE_TAGLINE}</p>
      <p className="mt-4 border-l-2 border-[var(--line-strong)] pl-3 text-sm leading-relaxed text-[var(--fog)]">
        新成员建档：绑定 QQ，验证码发到{" "}
        <span className="text-[var(--cyan)]">QQ 邮箱</span>
        。每个 QQ 仅可注册一次；完成后用「口令 + 昵称」登录即可。
      </p>

      <label className="mt-6 block text-sm text-[var(--fog)]">
        {fieldLabel("01", "群口令")}
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
        {fieldLabel("02", "站内昵称")}
        <input
          className="input mt-2"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={24}
          placeholder="例如：绳匠小A"
        />
      </label>

      <label className="mt-4 block text-sm text-[var(--fog)]">
        {fieldLabel("03", "QQ 号")}
        <input
          className="input mt-2"
          inputMode="numeric"
          value={qq}
          onChange={(e) => setQq(e.target.value.replace(/\D/g, "").slice(0, 12))}
          required
          placeholder="用于接收验证码，一号一账号"
        />
      </label>

      <div className="mt-4">
        <label className="block text-sm text-[var(--fog)]">
          {fieldLabel("04", "邮箱验证码")}
        </label>
        <div className="mt-2 flex gap-2">
          <input
            className="input flex-1"
            inputMode="numeric"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            required
            maxLength={6}
            placeholder="6 位数字"
          />
          <button
            className="btn btn-ghost shrink-0"
            type="button"
            disabled={sending || cooldown > 0}
            onClick={() => void sendCode()}
          >
            {sending
              ? "发送中…"
              : cooldown > 0
                ? `${cooldown}s`
                : "发送验证码"}
          </button>
        </div>
      </div>

      {info ? (
        <p className="mt-3 border-l-2 border-[var(--cyan)] bg-[rgba(61,224,208,0.08)] px-3 py-2 text-sm text-[var(--cyan)]">
          {info}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 border-l-2 border-[var(--danger)] bg-[rgba(255,107,122,0.08)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <button className="btn btn-amber mt-6 w-full" disabled={loading} type="submit">
        {loading ? "提交中…" : "完成建档 →"}
      </button>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-[var(--line)] pt-4 text-sm text-[var(--fog)]">
        <span>已有账号？</span>
        <Link href={loginHref} className="nav-chip hover:text-[var(--ink)]">
          <span className="mono text-[0.6rem] opacity-70">01</span>
          返回登录
        </Link>
      </div>
    </form>
  );
}
