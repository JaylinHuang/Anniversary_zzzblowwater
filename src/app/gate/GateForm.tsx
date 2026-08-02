"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SITE_BRAND, SITE_TAGLINE } from "@/lib/constants";

export function GateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [passphrase, setPassphrase] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
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

      const reg = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const regText = await reg.text();
      let regData: { error?: string } = {};
      try {
        regData = regText ? JSON.parse(regText) : {};
      } catch {
        throw new Error(
          "建档接口异常（不是口令错）。请停掉终端里的 npm run dev 后重新启动再进站。",
        );
      }
      if (!reg.ok) throw new Error(regData.error || "建档失败");

      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "进入失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="panel anim-rise relative w-full max-w-md rounded-2xl p-8"
    >
      <p className="text-xs uppercase tracking-[0.25em] text-[var(--amber)]">
        SITE ACCESS
      </p>
      <h1 className="brand-font mt-2 text-3xl text-[var(--cyan)]">{SITE_BRAND}</h1>
      <p className="mt-2 text-sm text-[var(--fog)]">{SITE_TAGLINE}</p>
      <p className="mt-4 text-sm text-[var(--fog)]">
        整站口令墙：请输入群口令，并取一个站内昵称。
      </p>
      <label className="mt-6 block text-sm text-[var(--fog)]">
        群口令
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
        站内昵称
        <input
          className="input mt-2"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={24}
          placeholder="例如：绳匠小A"
        />
      </label>
      {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      <button className="btn mt-6 w-full" disabled={loading} type="submit">
        {loading ? "验证中…" : "进入新艾利都夜生活"}
      </button>
    </form>
  );
}
