"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";

export function ProfilePanel({
  initial,
}: {
  initial: {
    displayName: string;
    bio: string;
    mains: string;
    tags: string;
    publicProfile: boolean;
    optOutLeaderboard: boolean;
  };
}) {
  const router = useRouter();
  const { success, error, confirm } = useToast();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [mains, setMains] = useState(initial.mains);
  const [tags, setTags] = useState(initial.tags);
  const [publicProfile, setPublicProfile] = useState(initial.publicProfile);
  const [optOut, setOptOut] = useState(initial.optOutLeaderboard);
  const [busy, setBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/api/members", {
        method: "PATCH",
        body: JSON.stringify({
          displayName,
          bio,
          mains,
          tags: tags
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean),
          publicProfile,
          optOutLeaderboard: optOut,
        }),
      });
      success("个人资料已保存");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    const ok = await confirm({
      title: "退出 / 更换账号",
      message: "将退出当前登录，返回口令墙。",
    });
    if (!ok) return;
    setLogoutBusy(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      success("已退出");
      router.replace("/gate");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "退出失败");
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <section className="panel rounded-2xl p-5 md:p-6">
      <h3 className="text-sm text-[var(--amber)]">编辑资料</h3>
      <p className="mt-1 text-xs text-[var(--fog)]">
        可更换站内昵称；昵称全站唯一，登录时也用这个名字。
      </p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3">
        <label className="text-sm text-[var(--fog)]">
          站内昵称
          <input
            className="input mt-1"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={24}
          />
        </label>
        <label className="text-sm text-[var(--fog)]">
          一句话介绍
          <textarea
            className="input mt-1 min-h-20"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="写点什么介绍自己…"
          />
        </label>
        <label className="text-sm text-[var(--fog)]">
          擅长角色 / 玩法
          <input
            className="input mt-1"
            value={mains}
            onChange={(e) => setMains(e.target.value)}
          />
        </label>
        <label className="text-sm text-[var(--fog)]">
          标签（逗号分隔）
          <input
            className="input mt-1"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="夜猫,邦布厨,…"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--fog)]">
          <input
            type="checkbox"
            checked={publicProfile}
            onChange={(e) => setPublicProfile(e.target.checked)}
          />
          公开到群友图鉴
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--fog)]">
          <input
            type="checkbox"
            checked={optOut}
            onChange={(e) => setOptOut(e.target.checked)}
          />
          不参与具名榜单
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "保存中…" : "保存资料"}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={logoutBusy}
            onClick={() => void logout()}
          >
            {logoutBusy ? "…" : "退出 / 换号"}
          </button>
        </div>
      </form>
    </section>
  );
}
