"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { UserChip } from "@/components/UserChip";
import { apiFetch } from "@/lib/api-client";
import {
  formatSponsorYuan,
  SPONSOR_GIFT_NOTE_MAX,
  type SponsorEntry,
  type SponsorMember,
  type SponsorTotal,
} from "@/lib/sponsor-shared";

export function SponsorLedger({
  totals,
  entries,
  members,
}: {
  totals: SponsorTotal[];
  entries: SponsorEntry[];
  members: SponsorMember[];
}) {
  const router = useRouter();
  const { success, error, confirm } = useToast();
  const [userId, setUserId] = useState(members[0] ? String(members[0].id) : "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const grand = totals.reduce((sum, row) => sum + row.totalFen, 0);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/api/sponsor/ledger", {
        method: "POST",
        body: JSON.stringify({ userId: Number(userId), amount, note }),
      });
      success("已记下这一笔");
      setAmount("");
      setNote("");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "登记失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    const ok = await confirm({
      title: "删掉这笔",
      message: "删掉后，这个人的累计金额会减去这一笔。",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch("/api/sponsor/ledger", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      success("已删除");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="stage-sec">研发赞助</h2>
      <p className="mt-3 text-sm text-[var(--ink)]">
        微信不会把金额发回来。群友在赞助页登记，或由你在这里补记。下面是每人累计。
      </p>
      <p className="mt-2 text-sm text-[var(--cyan)]">合计 ¥{formatSponsorYuan(grand)}</p>
      <Link href="/sponsor" className="btn mt-4 inline-flex">
        打开赞助页
      </Link>

      <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_8rem_1fr_auto]" onSubmit={add}>
        <label className="text-sm">
          群友
          <select
            className="input mt-1 w-full"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          金额（元）
          <input
            className="input mt-1 w-full"
            inputMode="decimal"
            value={amount}
            placeholder="20"
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="text-sm">
          备注
          <input
            className="input mt-1 w-full"
            maxLength={SPONSOR_GIFT_NOTE_MAX}
            value={note}
            placeholder="可选"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button className="btn self-end" type="submit" disabled={busy || !userId}>
          {busy ? "保存中…" : "记一笔"}
        </button>
      </form>

      {totals.length ? (
        <ul className="mt-5 space-y-2">
          {totals.map((row) => (
            <li
              key={row.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3 py-2"
            >
              <UserChip displayName={row.displayName} avatarUrl={row.avatarUrl} userId={row.userId} />
              <span className="text-sm text-[var(--ink)]">
                ¥{formatSponsorYuan(row.totalFen)}
                <span className="ml-2 text-xs text-[var(--fog)]">{row.count} 笔</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[var(--fog)]">还没有登记。</p>
      )}

      {entries.length ? (
        <ul className="mt-4 space-y-2">
          {entries.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-[var(--fog)]">
                {row.createdAt.slice(0, 16)} {row.displayName} ¥{formatSponsorYuan(row.amountFen)}
                {row.note ? ` · ${row.note}` : ""}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => void remove(row.id)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
