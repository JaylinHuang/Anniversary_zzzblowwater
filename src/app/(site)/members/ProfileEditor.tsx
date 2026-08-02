"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";

export function ProfileEditor({ userId }: { userId: number }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [bio, setBio] = useState("");
  const [mains, setMains] = useState("");
  const [tags, setTags] = useState("");
  const [publicProfile, setPublicProfile] = useState(true);
  const [optOut, setOptOut] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/api/members", {
        method: "PATCH",
        body: JSON.stringify({
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
      success("名片已保存");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel mt-6 rounded-2xl p-5">
      <div className="text-sm text-[var(--fog)]">编辑我的名片 #{userId}</div>
      <textarea
        className="input mt-3 min-h-20"
        placeholder="一句话介绍"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
      />
      <input
        className="input mt-3"
        placeholder="擅长角色/玩法"
        value={mains}
        onChange={(e) => setMains(e.target.value)}
      />
      <input
        className="input mt-3"
        placeholder="标签，逗号分隔"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />
      <label className="mt-3 flex items-center gap-2 text-sm text-[var(--fog)]">
        <input
          type="checkbox"
          checked={publicProfile}
          onChange={(e) => setPublicProfile(e.target.checked)}
        />
        公开图鉴
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm text-[var(--fog)]">
        <input
          type="checkbox"
          checked={optOut}
          onChange={(e) => setOptOut(e.target.checked)}
        />
        不参与具名榜单
      </label>
      <button className="btn mt-4" type="submit" disabled={busy}>
        {busy ? "保存中…" : "保存名片"}
      </button>
    </form>
  );
}
