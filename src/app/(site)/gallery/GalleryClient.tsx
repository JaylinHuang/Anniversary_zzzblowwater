"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";
import { filterGallery, parseTags } from "@/lib/gallery-filter";

export function GalleryClient({
  items,
  pending,
  canModerate,
}: {
  items: {
    id: number;
    title: string;
    path: string;
    likes: number;
    display_name: string;
    tags: string;
  }[];
  pending: { id: number; title: string; path: string }[];
  canModerate: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const cards = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        tags: parseTags(item.tags),
      })),
    [items],
  );
  const filtered = useMemo(() => filterGallery(cards, q), [cards, q]);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("action", "upload");
      form.set("file", file);
      form.set("title", title || file.name);
      await apiFetch("/api/gallery", { method: "POST", body: form });
      setTitle("");
      setFile(null);
      success(canModerate ? "已上传并通过" : "已上传，等待审核");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  async function like(mediaId: number) {
    try {
      const form = new FormData();
      form.set("action", "like");
      form.set("mediaId", String(mediaId));
      await apiFetch("/api/gallery", { method: "POST", body: form });
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "点赞失败");
    }
  }

  async function approve(mediaId: number) {
    try {
      const form = new FormData();
      form.set("action", "approve");
      form.set("mediaId", String(mediaId));
      await apiFetch("/api/gallery", { method: "POST", body: form });
      success("已通过审核");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "审核失败");
    }
  }

  return (
    <div className="mt-6 space-y-8">
      <form
        onSubmit={upload}
        className="panel grid gap-3 rounded-2xl p-5 md:grid-cols-3"
      >
        <input
          className="input"
          placeholder="标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="input"
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "上传中…" : "上传"}
        </button>
      </form>

      {canModerate && pending.length ? (
        <section>
          <h2 className="text-[var(--amber)]">待审核</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {pending.map((p) => (
              <div key={p.id} className="panel rounded-xl p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.path}
                  alt={p.title}
                  className="h-32 w-full object-cover"
                />
                <button
                  className="btn mt-2 w-full"
                  type="button"
                  onClick={() => approve(p.id)}
                >
                  通过
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div>
        <input
          className="input max-w-md"
          placeholder="按标题 / 上传者 / 标签筛选…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="mt-2 text-xs text-[var(--fog)]">
          显示 {filtered.length} / {cards.length}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <article key={item.id} className="panel overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.path}
              alt={item.title}
              className="h-48 w-full object-cover"
            />
            <div className="p-4">
              <div className="text-sm">{item.title}</div>
              <div className="mt-1 text-xs text-[var(--fog)]">
                {item.display_name}
              </div>
              {item.tags.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--fog)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <button
                className="btn btn-ghost mt-3"
                type="button"
                onClick={() => like(item.id)}
              >
                ♥ {item.likes}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
