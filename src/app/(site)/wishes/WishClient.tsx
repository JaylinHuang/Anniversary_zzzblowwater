"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";
import { daysUntilUnlock } from "@/lib/capsule-rules";

export function WishClient({
  wishes,
  capsules,
  canModerate,
}: {
  wishes: {
    id: number;
    content: string;
    display_name: string;
    created_at: string;
  }[];
  capsules: {
    id: number;
    unlock_on: string;
    display_name: string;
    content: string | null;
    unlocked: number;
  }[];
  canModerate: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [wish, setWish] = useState("");
  const [capsule, setCapsule] = useState("");
  const [unlockOn, setUnlockOn] = useState("2027-07-10");
  const [busy, setBusy] = useState(false);

  async function postWish(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/api/wishes", {
        method: "POST",
        body: JSON.stringify({ kind: "wish", content: wish }),
      });
      setWish("");
      success("祝福已贴上墙");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  async function postCapsule(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/api/wishes", {
        method: "POST",
        body: JSON.stringify({ kind: "capsule", content: capsule, unlockOn }),
      });
      setCapsule("");
      success("时间胶囊已封存");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "封存失败");
    } finally {
      setBusy(false);
    }
  }

  async function hide(id: number) {
    try {
      await apiFetch("/api/wishes", {
        method: "POST",
        body: JSON.stringify({ kind: "hide", id }),
      });
      success("已下架");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "操作失败");
    }
  }

  return (
    <div className="mt-6 space-y-8">
      <form onSubmit={postWish} className="panel rounded-2xl p-5">
        <textarea
          className="input min-h-24"
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          placeholder="写一句周年祝福…"
          required
          disabled={busy}
        />
        <button className="btn btn-amber mt-3" type="submit" disabled={busy}>
          {busy ? "提交中…" : "贴上祝福墙"}
        </button>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        {wishes.length === 0 ? (
          <p className="text-sm text-[var(--fog)] md:col-span-2">
            还没有祝福，来写第一条吧。
          </p>
        ) : null}
        {wishes.map((w) => (
          <article key={w.id} className="panel rounded-2xl p-5">
            <p className="text-sm">{w.content}</p>
            <div className="mt-3 flex justify-between text-xs text-[var(--fog)]">
              <span>{w.display_name}</span>
              {canModerate ? (
                <button type="button" onClick={() => void hide(w.id)}>
                  下架
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <form onSubmit={postCapsule} className="panel rounded-2xl p-5">
        <h2 className="text-[var(--amber)]">时间胶囊</h2>
        <textarea
          className="input mt-3 min-h-24"
          value={capsule}
          onChange={(e) => setCapsule(e.target.value)}
          placeholder="写给未来的自己/群友…"
          required
          disabled={busy}
        />
        <input
          className="input mt-3"
          type="date"
          value={unlockOn}
          onChange={(e) => setUnlockOn(e.target.value)}
          required
          disabled={busy}
        />
        <button className="btn mt-3" type="submit" disabled={busy}>
          封存胶囊
        </button>
      </form>

      <div className="space-y-3">
        {capsules.map((c) => {
          const left = daysUntilUnlock(c.unlock_on);
          return (
            <article key={c.id} className="panel rounded-xl p-4">
              <div className="text-xs text-[var(--fog)]">
                {c.display_name} · 解锁日 {c.unlock_on}
                {c.unlocked
                  ? " · 已开封"
                  : left > 0
                    ? ` · 还剩 ${left} 天`
                    : ""}
              </div>
              <p className="mt-2 text-sm">
                {c.unlocked ? c.content : "尚未解锁，静待开封时刻。"}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
