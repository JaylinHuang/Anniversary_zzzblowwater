"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";
import { SPONSOR_NOTE_MAX, type SponsorCard } from "@/lib/sponsor-shared";

export function SponsorClient({
  card,
  isAdmin,
  formError = "",
}: {
  card: SponsorCard;
  isAdmin: boolean;
  formError?: string;
}) {
  const router = useRouter();
  const { success, error, confirm } = useToast();
  const [note, setNote] = useState(card.note);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = new FormData();
      body.set("note", note);
      if (file) body.set("file", file);
      await apiFetch("/api/sponsor", { method: "POST", body });
      success(file ? "收款码已更新" : "说明已保存");
      setFile(null);
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function clearQr() {
    const ok = await confirm({
      title: "撤下收款码",
      message: "撤下后群友就扫不到这张码。说明会留着。",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch("/api/sponsor", { method: "DELETE" });
      success("收款码已撤下");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "撤下失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="panel rounded-2xl p-5">
        <h2 className="stage-sec">微信扫码</h2>
        <p className="mt-2 text-sm text-[var(--fog)]">
          打开微信，点右上角扫一扫。金额在微信里自己填。钱直接进管理员的微信，本站不经手，也不记录你付了多少。
        </p>
        <div className="mx-auto mt-5 w-full max-w-[16rem] rounded-2xl bg-white p-4">
          {card.qrUrl ? (
            <img
              src={card.qrUrl}
              alt="管理员的微信收款码"
              className="aspect-square w-full object-contain"
            />
          ) : (
            <p className="flex aspect-square items-center justify-center text-center text-sm text-neutral-600">
              管理员还没放上微信收款码
            </p>
          )}
        </div>
        {card.note ? (
          <p className="mt-4 text-center text-sm text-[var(--ink)]">{card.note}</p>
        ) : null}
      </section>

      {isAdmin ? (
        <form
          className="panel rounded-2xl p-5"
          action="/api/sponsor"
          method="post"
          encType="multipart/form-data"
          onSubmit={save}
        >
          <h2 className="stage-sec">放置收款码</h2>
          <p className="mt-2 text-sm text-[var(--fog)]">
            上传你的微信收款码。换一张会替掉旧的。群友只能扫码，改不了这张图。
          </p>
          {formError ? <p className="mt-3 text-sm text-[var(--amber)]">{formError}</p> : null}
          <label className="mt-4 block text-sm">
            收款码图片
            <input
              className="input mt-1 w-full"
              name="file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="mt-3 block text-sm">
            短说明
            <textarea
              className="input mt-1 min-h-16 w-full"
              name="note"
              maxLength={SPONSOR_NOTE_MAX}
              value={note}
              placeholder="例如：用于服务器和模型调用"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "保存中…" : file ? "更新收款码" : "保存说明"}
            </button>
            {card.qrUrl ? (
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => void clearQr()}
              >
                撤下收款码
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
