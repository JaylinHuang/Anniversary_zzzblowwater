"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { UserChip } from "@/components/UserChip";
import { apiFetch, isApiTimeout } from "@/lib/api-client";

/** 点赞/取消赞请求的超时时间（毫秒），超时后回滚到点之前的状态 */
const LIKE_TIMEOUT_MS = 10000;
import {
  filterGallery,
  getGalleryEmptyState,
  parseTags,
  toggleLikeState,
} from "@/lib/gallery-filter";
import {
  MAX_COMMENT_LENGTH,
  NO_COMMENT_HINT,
  checkCommentContent,
  formatCommentTime,
  groupCommentsByMedia,
  type GalleryComment,
} from "@/lib/gallery-comments";

export function GalleryClient({
  items,
  pending,
  comments,
  canModerate,
}: {
  items: {
    id: number;
    title: string;
    path: string;
    likes: number;
    display_name: string;
    avatar_url: string | null;
    user_id: number;
    tags: string;
    liked: number;
  }[];
  pending: { id: number; title: string; path: string }[];
  comments: GalleryComment[];
  canModerate: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  // 点赞的本地覆盖：请求进行中、以及请求完成到服务端数据刷新之前，以覆盖值为准；
  // base 记录请求完成时的 items 引用，一旦 items 换成刷新后的新数据，覆盖自动失效，数字回到跟随后端
  const [likeOverride, setLikeOverride] = useState<
    Record<
      number,
      { liked: boolean; likes: number; inflight: boolean; base: unknown }
    >
  >({});
  const [likeBusy, setLikeBusy] = useState<Record<number, boolean>>({});
  // 评论草稿与发送中状态（按图片 id）
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [commentBusy, setCommentBusy] = useState<Record<number, boolean>>({});
  // 评论按图片分组，数据来自服务端 media_comments，刷新后依然存在
  const commentsByMedia = useMemo(
    () => groupCommentsByMedia(comments),
    [comments],
  );
  // 始终持有最新的服务端数据引用，供异步回调读取
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // 服务端数据刷新后，清掉已失效（已结算）的覆盖，仅保留仍在请求中的
  useEffect(() => {
    setLikeOverride((m) => {
      const next: typeof m = {};
      let changed = false;
      for (const [k, v] of Object.entries(m)) {
        if (v.inflight || v.base === items) next[Number(k)] = v;
        else changed = true;
      }
      return changed ? next : m;
    });
  }, [items]);

  const cards = useMemo(
    () =>
      items.map((item) => {
        const raw = likeOverride[item.id];
        // 覆盖仍有效：请求进行中，或尚未等到刷新后的新 items
        const o = raw && (raw.inflight || raw.base === items) ? raw : undefined;
        return {
          ...item,
          tags: parseTags(item.tags),
          liked: o ? o.liked : Boolean(item.liked),
          likes: o ? o.likes : item.likes,
        };
      }),
    [items, likeOverride],
  );
  const filtered = useMemo(() => filterGallery(cards, q), [cards, q]);
  const emptyState = getGalleryEmptyState(cards.length, filtered.length, q);

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

  async function toggleLike(mediaId: number, liked: boolean, likes: number) {
    if (likeBusy[mediaId]) return;
    // 先乐观更新界面（请求进行中，覆盖一直有效）
    setLikeOverride((m) => ({
      ...m,
      [mediaId]: {
        ...toggleLikeState(liked, likes),
        inflight: true,
        base: itemsRef.current,
      },
    }));
    setLikeBusy((m) => ({ ...m, [mediaId]: true }));
    try {
      const form = new FormData();
      form.set("action", liked ? "unlike" : "like");
      form.set("mediaId", String(mediaId));
      const res = (await apiFetch("/api/gallery", {
        method: "POST",
        body: form,
        // 请求一直不返回时由请求层中止，避免卡片永远停在请求中
        timeoutMs: LIKE_TIMEOUT_MS,
      })) as { liked?: boolean; likes?: number } | undefined;
      // 以服务端返回的数字为准；并把覆盖标记为“待刷新”，
      // 绑定当前 items 引用，等 router.refresh() 带来新数据后自动失效
      const base = itemsRef.current;
      setLikeOverride((m) => {
        const cur = m[mediaId];
        const settled =
          res && typeof res.likes === "number"
            ? {
                liked: typeof res.liked === "boolean" ? res.liked : !liked,
                likes: res.likes,
              }
            : cur
              ? { liked: cur.liked, likes: cur.likes }
              : toggleLikeState(liked, likes);
        return { ...m, [mediaId]: { ...settled, inflight: false, base } };
      });
      router.refresh();
    } catch (err) {
      // 失败或超时回滚：直接丢弃本地覆盖，赞数和按钮回到点之前（跟随服务端数据）
      setLikeOverride((m) => {
        const next = { ...m };
        delete next[mediaId];
        return next;
      });
      // 超时时服务端可能已写入，刷新一次，让赞过状态以库里为准
      if (isApiTimeout(err)) router.refresh();
      error(err instanceof Error ? err.message : liked ? "取消赞失败" : "点赞失败");
    } finally {
      setLikeBusy((m) => ({ ...m, [mediaId]: false }));
    }
  }

  async function submitComment(e: FormEvent, mediaId: number) {
    e.preventDefault();
    if (commentBusy[mediaId]) return;
    // 空白评论在前端先拦截，服务端也会再校验一次
    const check = checkCommentContent(drafts[mediaId]);
    if (!check.ok) {
      error(check.error);
      return;
    }
    setCommentBusy((m) => ({ ...m, [mediaId]: true }));
    try {
      const form = new FormData();
      form.set("action", "comment");
      form.set("mediaId", String(mediaId));
      form.set("content", check.content);
      await apiFetch("/api/gallery", { method: "POST", body: form });
      // 发送成功才清空草稿；失败时保留，方便重试
      setDrafts((m) => ({ ...m, [mediaId]: "" }));
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "评论发送失败");
    } finally {
      setCommentBusy((m) => ({ ...m, [mediaId]: false }));
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

      {emptyState === "gallery-empty" ? (
        <div className="panel rounded-2xl p-8 text-center text-sm text-[var(--fog)]">
          Meme 馆还是空的。去上面选一张图，填标题后点「上传」放进第一张吧
          {canModerate ? "（你的上传会直接通过）" : "（上传后需等待审核）"}。
        </div>
      ) : null}
      {emptyState === "filter-empty" ? (
        <div className="panel rounded-2xl p-8 text-center text-sm text-[var(--fog)]">
          没有符合「{q.trim()}」的图，是筛选结果为空，馆里共有 {cards.length}{" "}
          张。
          <button
            className="btn btn-ghost ml-2"
            type="button"
            onClick={() => setQ("")}
          >
            清除筛选
          </button>
        </div>
      ) : null}

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
              <div className="mt-2">
                <UserChip
                  displayName={item.display_name}
                  avatarUrl={item.avatar_url}
                  userId={item.user_id}
                />
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
                className={`btn btn-ghost mt-3 ${
                  item.liked ? "text-[var(--amber)]" : ""
                }`}
                type="button"
                aria-pressed={item.liked}
                disabled={Boolean(likeBusy[item.id])}
                onClick={() => toggleLike(item.id, item.liked, item.likes)}
              >
                {item.liked ? "♥ 已赞" : "♡ 赞"} · {item.likes}
              </button>

              {/* 评论区：已有评论列表 + 发表评论 */}
              <section
                className="mt-4 border-t border-[var(--line)] pt-3"
                aria-label={`「${item.title}」的评论`}
              >
                <h3 className="text-xs text-[var(--fog)]">
                  评论 · {(commentsByMedia[item.id] || []).length}
                </h3>
                {(commentsByMedia[item.id] || []).length ? (
                  <ul className="mt-2 space-y-2">
                    {(commentsByMedia[item.id] || []).map((c) => (
                      <li key={c.id} className="text-sm">
                        <div className="flex items-center gap-2 text-xs text-[var(--fog)]">
                          <UserChip
                            displayName={c.display_name}
                            avatarUrl={c.avatar_url}
                            userId={c.user_id}
                          />
                          <time dateTime={c.created_at}>
                            {formatCommentTime(c.created_at)}
                          </time>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words">
                          {c.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-[var(--fog)]">
                    {NO_COMMENT_HINT}
                  </p>
                )}
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => submitComment(e, item.id)}
                >
                  <input
                    className="input min-w-0 flex-1"
                    placeholder="写一句评论…"
                    maxLength={MAX_COMMENT_LENGTH}
                    value={drafts[item.id] || ""}
                    onChange={(e) =>
                      setDrafts((m) => ({ ...m, [item.id]: e.target.value }))
                    }
                  />
                  <button
                    className="btn"
                    type="submit"
                    disabled={
                      Boolean(commentBusy[item.id]) ||
                      !(drafts[item.id] || "").trim()
                    }
                  >
                    {commentBusy[item.id] ? "发送中…" : "发送"}
                  </button>
                </form>
              </section>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
