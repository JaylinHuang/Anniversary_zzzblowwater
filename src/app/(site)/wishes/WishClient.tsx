"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { UserChip } from "@/components/UserChip";
import { apiFetch } from "@/lib/api-client";
import { daysUntilUnlock } from "@/lib/capsule-rules";

/** 「我的」标记：只有自己写的祝福/胶囊才会出现 */
function MineBadge() {
  return (
    <span
      data-testid="mine-badge"
      className="rounded-full border border-[var(--amber)] px-2 py-0.5 text-[10px] text-[var(--amber)]"
    >
      我的
    </span>
  );
}

export function WishClient({
  wishes,
  capsules,
  canModerate,
  currentUserId,
  remaining,
  dailyLimit,
}: {
  wishes: {
    id: number;
    content: string;
    display_name: string;
    avatar_url: string | null;
    user_id: number;
    created_at: string;
  }[];
  capsules: {
    id: number;
    unlock_on: string;
    display_name: string;
    avatar_url: string | null;
    user_id: number;
    content: string | null;
    unlocked: number;
    /** 1 = 未解锁且仅作者本人能看到原文 */
    viewer_only: number;
  }[];
  canModerate: boolean;
  /** 当前登录用户 id；未登录为 null */
  currentUserId: number | null;
  /** 今日还能贴几条（服务端按库内今日条数算出） */
  remaining: number;
  dailyLimit: number;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [wish, setWish] = useState("");
  const [capsule, setCapsule] = useState("");
  const [unlockOn, setUnlockOn] = useState("2027-07-10");
  const [busy, setBusy] = useState(false);
  const wishInputRef = useRef<HTMLTextAreaElement>(null);
  const capsuleInputRef = useRef<HTMLTextAreaElement>(null);

  const isMine = (userId: number) =>
    currentUserId != null && userId === currentUserId;
  const quotaFull = remaining <= 0;

  async function postWish(e: FormEvent) {
    e.preventDefault();
    if (quotaFull) return;
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
      // 失败后也刷新，让「今日还能贴几条」与库内真实条数对齐
      router.refresh();
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

  /** 空状态的下一步：滚动并聚焦到对应输入框 */
  function focusInput(ref: React.RefObject<HTMLTextAreaElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    ref.current?.focus();
  }

  return (
    <div className="mt-6 space-y-8">
      <h2 className="stage-sec">祝福</h2>
      <form onSubmit={postWish} className="panel rounded-2xl p-5">
        <p className="text-sm text-[var(--fog)]">
          每位进站群友都可以在此留言；提交后立刻出现在墙上（无需管理员代发）。
        </p>
        <p
          data-testid="wish-remaining"
          className={`mt-2 text-sm ${quotaFull ? "text-[var(--amber)]" : "text-[var(--cyan)]"}`}
        >
          {quotaFull
            ? `今日 ${dailyLimit} 条已贴满，明天再来`
            : `今日还能贴 ${remaining} 条（每日上限 ${dailyLimit} 条）`}
        </p>
        <textarea
          ref={wishInputRef}
          className="input mt-3 min-h-24"
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          placeholder="写一句周年祝福…"
          required
          disabled={busy || quotaFull}
        />
        <button
          className="btn btn-amber mt-3"
          type="submit"
          disabled={busy || quotaFull}
        >
          {busy ? "提交中…" : quotaFull ? "今日额度已用完" : "贴上祝福墙"}
        </button>
      </form>

      <h2 className="stage-sec">墙上</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {wishes.length === 0 ? (
          <div
            data-testid="wish-empty"
            className="panel rounded-2xl p-5 md:col-span-2"
          >
            <p className="text-sm">墙上还没有祝福，你来贴第一条。</p>
            <p className="mt-1 text-xs text-[var(--fog)]">
              {quotaFull
                ? "今日额度已用完，明天再来贴；也可以先在下方封存一封时间胶囊。"
                : "写一句给群友的周年祝福，提交后立刻出现在这里。"}
            </p>
            {quotaFull ? (
              <button
                type="button"
                className="btn mt-3"
                onClick={() => focusInput(capsuleInputRef)}
              >
                去写时间胶囊
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-amber mt-3"
                onClick={() => focusInput(wishInputRef)}
              >
                去写第一条祝福
              </button>
            )}
          </div>
        ) : null}
        {wishes.map((w) => {
          const mine = isMine(w.user_id);
          return (
            <article
              key={w.id}
              data-mine={mine ? "true" : "false"}
              className={`panel rounded-2xl p-5 ${mine ? "border border-[var(--amber)]" : ""}`}
            >
              <p className="text-sm">{w.content}</p>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--fog)]">
                <span className="flex items-center gap-2">
                  <UserChip
                    displayName={w.display_name}
                    avatarUrl={w.avatar_url}
                    userId={w.user_id}
                  />
                  {mine ? <MineBadge /> : null}
                </span>
                {canModerate ? (
                  <button type="button" onClick={() => void hide(w.id)}>
                    下架
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <form onSubmit={postCapsule} className="panel rounded-2xl p-5">
        <h2 className="stage-sec">时间胶囊</h2>
        <textarea
          ref={capsuleInputRef}
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
        {capsules.length === 0 ? (
          <div
            data-testid="capsule-empty"
            className="panel rounded-xl p-4"
          >
            <p className="text-sm">还没有人封存时间胶囊，你来封第一封。</p>
            <p className="mt-1 text-xs text-[var(--fog)]">
              写给未来的自己或群友，选一个解锁日，到期才会开封。
            </p>
            <button
              type="button"
              className="btn mt-3"
              onClick={() => focusInput(capsuleInputRef)}
            >
              去封存第一封
            </button>
          </div>
        ) : null}
        {capsules.map((c) => {
          const left = daysUntilUnlock(c.unlock_on);
          const mine = isMine(c.user_id);
          return (
            <article
              key={c.id}
              data-mine={mine ? "true" : "false"}
              className={`panel rounded-xl p-4 ${mine ? "border border-[var(--amber)]" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fog)]">
                <UserChip
                  displayName={c.display_name}
                  avatarUrl={c.avatar_url}
                  userId={c.user_id}
                />
                {mine ? <MineBadge /> : null}
                <span>
                  · 解锁日 {c.unlock_on}
                  {c.unlocked
                    ? " · 已开封"
                    : left > 0
                      ? ` · 还剩 ${left} 天`
                      : ""}
                </span>
              </div>
              {c.viewer_only && c.content != null ? (
                <>
                  <span
                    data-testid="capsule-private-badge"
                    className="mt-2 inline-block rounded-full border border-[var(--cyan)] px-2 py-0.5 text-[10px] text-[var(--cyan)]"
                  >
                    仅你可见 · 解锁前其他人看不到
                  </span>
                  <p data-testid="capsule-content" className="mt-2 text-sm">
                    {c.content}
                  </p>
                </>
              ) : c.unlocked ? (
                <>
                  <span
                    data-testid="capsule-public-badge"
                    className="mt-2 inline-block rounded-full border border-[var(--fog)] px-2 py-0.5 text-[10px] text-[var(--fog)]"
                  >
                    已公开
                  </span>
                  <p data-testid="capsule-content" className="mt-2 text-sm">
                    {c.content}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm">尚未解锁，静待开封时刻。</p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
