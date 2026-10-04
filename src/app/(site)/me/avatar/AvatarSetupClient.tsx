"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { UserChip } from "@/components/UserChip";

export function AvatarSetupClient({
  displayName,
  currentUrl,
  forceSetup,
}: {
  displayName: string;
  currentUrl: string | null;
  forceSetup: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  function onPick(f: File | null) {
    setFile(f);
    if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    if (f) setPreview(URL.createObjectURL(f));
    else setPreview(currentUrl);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      error("请先选择一张图片");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/me/avatar", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "上传失败");
      success("头像已保存");
      document.cookie = "zzz_skip_avatar=; Max-Age=0; Path=/";
      router.replace("/");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    // 7 天内不再强制引导（仍可在个人中心设置）
    document.cookie = `zzz_skip_avatar=1; Max-Age=${7 * 24 * 3600}; Path=/; SameSite=Lax`;
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel mt-6 rounded-2xl p-6">
      <p className="text-sm text-[var(--fog)]">预览</p>
      <div className="mt-3">
        <UserChip
          displayName={displayName}
          avatarUrl={preview}
          size="md"
        />
      </div>
      <label className="mt-6 block text-sm text-[var(--fog)]">
        选择图片
        <input
          className="input mt-2"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={(e) => onPick(e.target.files?.[0] || null)}
        />
      </label>
      <div className="mt-6 flex flex-wrap gap-2">
        <button className="btn" type="submit" disabled={busy || !file}>
          {busy ? "上传中…" : "保存头像"}
        </button>
        {forceSetup ? (
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            onClick={skip}
          >
            稍后再说
          </button>
        ) : (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => router.push("/me")}
          >
            返回个人中心
          </button>
        )}
      </div>
    </form>
  );
}
