"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { matchLoreFigure } from "@/lib/lore-filter";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";

type Figure = {
  id: number;
  name: string;
  epithet: string;
  summary: string;
  avatar_text: string;
  hue: number;
  pos_x: number;
  pos_y: number;
};

type Relation = {
  id: number;
  from_id: number;
  to_id: number;
  label: string;
};

type Detail = {
  figure: Figure;
  anecdotes: {
    id: number;
    title: string;
    body: string;
    era_label: string;
  }[];
  relations: {
    id: number;
    label: string;
    other_id: number;
    other_name: string;
    other_epithet: string;
    direction: string;
  }[];
};

const W = 1000;
const H = 640;

export function ConstellationClient({
  figures,
  relations,
  canModerate,
}: {
  figures: Figure[];
  relations: Relation[];
  canModerate: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const byId = useMemo(
    () => new Map(figures.map((f) => [f.id, f])),
    [figures],
  );

  const linked = useMemo(() => {
    const set = new Set<number>();
    if (selectedId == null && hoverId == null) return set;
    const focus = selectedId ?? hoverId!;
    set.add(focus);
    for (const r of relations) {
      if (r.from_id === focus || r.to_id === focus) {
        set.add(r.from_id);
        set.add(r.to_id);
      }
    }
    return set;
  }, [relations, selectedId, hoverId]);

  async function openFigure(id: number) {
    setSelectedId(id);
    setLoading(true);
    try {
      const data = await apiFetch<Detail>(`/api/constellation?figureId=${id}`);
      setDetail(data);
    } catch (e) {
      error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function addFigure(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await apiFetch("/api/constellation", {
        method: "POST",
        body: JSON.stringify({
          action: "figure",
          name: fd.get("name"),
          epithet: fd.get("epithet"),
          summary: fd.get("summary"),
          avatarText: fd.get("avatarText"),
          hue: Number(fd.get("hue") || 180),
          posX: Number(fd.get("posX") || 50),
          posY: Number(fd.get("posY") || 50),
        }),
      });
      form.reset();
      success("星位已点亮");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "添加失败");
    }
  }

  async function addRelation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await apiFetch("/api/constellation", {
        method: "POST",
        body: JSON.stringify({
          action: "relation",
          fromId: Number(fd.get("fromId")),
          toId: Number(fd.get("toId")),
          label: fd.get("label"),
        }),
      });
      form.reset();
      success("关系已连线");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "连线失败");
    }
  }

  async function addAnecdote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await apiFetch("/api/constellation", {
        method: "POST",
        body: JSON.stringify({
          action: "anecdote",
          figureId: selectedId,
          title: fd.get("title"),
          body: fd.get("body"),
          eraLabel: fd.get("eraLabel"),
        }),
      });
      form.reset();
      success("轶事已写入");
      await openFigure(selectedId);
    } catch (err) {
      error(err instanceof Error ? err.message : "写入失败");
    }
  }

  function toXY(f: Figure) {
    return { x: (f.pos_x / 100) * W, y: (f.pos_y / 100) * H };
  }

  const focus = selectedId ?? hoverId;

  return (
    <div className="mt-6 space-y-4">
      <input
        className="input max-w-md"
        placeholder="搜索人物名 / 称号 / 简介…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="panel relative overflow-hidden rounded-2xl">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label="人物关系星图"
        >
          <defs>
            <radialGradient id="sky" cx="50%" cy="40%" r="70%">
              <stop offset="0%" stopColor="#152433" />
              <stop offset="100%" stopColor="#0b1118" />
            </radialGradient>
            <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width={W} height={H} fill="url(#sky)" />
          {/* 背景星点 */}
          {Array.from({ length: 60 }).map((_, i) => (
            <circle
              key={i}
              cx={(i * 97) % W}
              cy={(i * 53) % H}
              r={i % 5 === 0 ? 1.6 : 0.8}
              fill="#9aa7b8"
              opacity={0.25 + (i % 4) * 0.1}
            />
          ))}

          {/* 关系线 */}
          {relations.map((r) => {
            const a = byId.get(r.from_id);
            const b = byId.get(r.to_id);
            if (!a || !b) return null;
            const p1 = toXY(a);
            const p2 = toXY(b);
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            const active =
              focus == null || linked.has(r.from_id) || linked.has(r.to_id);
            const strong =
              focus != null &&
              (r.from_id === focus || r.to_id === focus);
            return (
              <g key={r.id} opacity={active ? 1 : 0.12}>
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={strong ? "#f0a35e" : "#3de0d0"}
                  strokeWidth={strong ? 2.2 : 1.2}
                  strokeOpacity={strong ? 0.85 : 0.35}
                />
                <rect
                  x={mx - r.label.length * 7}
                  y={my - 12}
                  width={r.label.length * 14}
                  height={22}
                  rx={11}
                  fill="#0b1118"
                  stroke={strong ? "rgba(240,163,94,0.55)" : "rgba(61,224,208,0.25)"}
                />
                <text
                  x={mx}
                  y={my + 4}
                  textAnchor="middle"
                  fill={strong ? "#ffc98a" : "#9aa7b8"}
                  fontSize={12}
                >
                  {r.label}
                </text>
              </g>
            );
          })}

          {/* 人物节点 */}
          {figures.map((f) => {
            const { x, y } = toXY(f);
            const matched = matchLoreFigure(f, query);
            const active =
              matched && (focus == null || linked.has(f.id));
            const selected = selectedId === f.id;
            const color = `hsl(${f.hue} 70% 55%)`;
            return (
              <g
                key={f.id}
                transform={`translate(${x}, ${y})`}
                opacity={active ? 1 : matched ? 0.35 : 0.08}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoverId(f.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => openFigure(f.id)}
                filter={selected ? "url(#softGlow)" : undefined}
              >
                <circle
                  r={selected ? 34 : 28}
                  fill="#121a24"
                  stroke={selected ? "#f0a35e" : color}
                  strokeWidth={selected ? 3 : 2}
                />
                <circle r={22} fill={color} opacity={0.22} />
                <text
                  textAnchor="middle"
                  y={5}
                  fill="#e8eef6"
                  fontSize={16}
                  fontWeight={700}
                >
                  {(f.avatar_text || f.name).slice(0, 2)}
                </text>
                <text
                  textAnchor="middle"
                  y={48}
                  fill={selected ? "#ffc98a" : "#e8eef6"}
                  fontSize={15}
                  fontWeight={600}
                >
                  {f.name}
                </text>
                {f.epithet ? (
                  <text
                    textAnchor="middle"
                    y={66}
                    fill="#9aa7b8"
                    fontSize={11}
                  >
                    {f.epithet}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {figures.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-[var(--fog)]">
            星图还是空的——让版主写入第一批野史人物吧。
          </p>
        ) : null}
      </div>

      <aside className="panel rounded-2xl p-5">
        {!detail ? (
          <div className="text-sm text-[var(--fog)]">
            <p className="text-[var(--amber)]">人物列传</p>
            <p className="mt-3">
              点击星图中的头像或名字，查看称号、简介与相关轶事（野史警告：信则有，不信则笑）。
            </p>
            <ul className="mt-4 space-y-2">
              {figures.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="text-left text-[var(--cyan)] hover:underline"
                    onClick={() => openFigure(f.id)}
                  >
                    {f.name}
                    {f.epithet ? ` · ${f.epithet}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className="text-xs text-[var(--fog)]"
              onClick={() => {
                setDetail(null);
                setSelectedId(null);
              }}
            >
              ← 返回列表
            </button>
            <p className="mt-3 text-xs tracking-[0.2em] text-[var(--amber)]">
              LORE PROFILE
            </p>
            <h2 className="brand-font mt-1 text-3xl text-[var(--cyan)]">
              {detail.figure.name}
            </h2>
            {detail.figure.epithet ? (
              <p className="mt-1 text-sm text-[var(--amber)]">
                {detail.figure.epithet}
              </p>
            ) : null}
            <p className="mt-3 text-sm leading-relaxed text-[var(--fog)]">
              {detail.figure.summary || "尚无简介。"}
            </p>

            <h3 className="mt-6 text-sm text-[var(--ink)]">相关人物</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {detail.relations.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="text-[var(--cyan)] hover:underline"
                    onClick={() => openFigure(r.other_id)}
                  >
                    {r.other_name}
                  </button>
                  <span className="text-[var(--fog)]"> · {r.label}</span>
                </li>
              ))}
              {detail.relations.length === 0 ? (
                <li className="text-[var(--fog)]">暂无关系边</li>
              ) : null}
            </ul>

            <h3 className="mt-6 text-sm text-[var(--ink)]">相关轶事</h3>
            {loading ? (
              <p className="mt-2 text-sm text-[var(--fog)]">加载中…</p>
            ) : (
              <div className="mt-2 space-y-3">
                {detail.anecdotes.map((a) => (
                  <article
                    key={a.id}
                    className="rounded-xl border border-[var(--line)] p-3"
                  >
                    {a.era_label ? (
                      <div className="text-xs text-[var(--amber)]">
                        {a.era_label}
                      </div>
                    ) : null}
                    <h4 className="mt-1 text-sm font-medium">{a.title}</h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--fog)]">
                      {a.body}
                    </p>
                  </article>
                ))}
                {detail.anecdotes.length === 0 ? (
                  <p className="text-sm text-[var(--fog)]">还没有轶事。</p>
                ) : null}
              </div>
            )}

            {canModerate && selectedId ? (
              <form onSubmit={addAnecdote} className="mt-6 space-y-2 border-t border-[var(--line)] pt-4">
                <p className="text-xs text-[var(--amber)]">为 TA 追加轶事</p>
                <input className="input" name="eraLabel" placeholder="时代标签，如：建群纪元" />
                <input className="input" name="title" placeholder="轶事标题" required />
                <textarea className="input min-h-24" name="body" placeholder="正文（可野史）" required />
                <button className="btn" type="submit">
                  写入列传
                </button>
              </form>
            ) : null}
          </div>
        )}
      </aside>

      {canModerate ? (
        <div className="grid gap-4 lg:col-span-2 md:grid-cols-2">
          <form onSubmit={addFigure} className="panel grid gap-2 rounded-2xl p-5">
            <h3 className="text-[var(--amber)]">添加人物</h3>
            <input className="input" name="name" placeholder="名字" required />
            <input className="input" name="epithet" placeholder="称号，如：深夜修仙王" />
            <input className="input" name="avatarText" placeholder="头像字（1-2字）" />
            <textarea className="input" name="summary" placeholder="野史简介" />
            <div className="grid grid-cols-3 gap-2">
              <input className="input" name="hue" type="number" placeholder="色相0-360" defaultValue={180} />
              <input className="input" name="posX" type="number" placeholder="X%" defaultValue={50} />
              <input className="input" name="posY" type="number" placeholder="Y%" defaultValue={50} />
            </div>
            <button className="btn" type="submit">
              点亮星位
            </button>
          </form>
          <form onSubmit={addRelation} className="panel grid gap-2 rounded-2xl p-5">
            <h3 className="text-[var(--amber)]">添加关系</h3>
            <select className="input" name="fromId" required defaultValue="">
              <option value="" disabled>
                从谁
              </option>
              {figures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select className="input" name="toId" required defaultValue="">
              <option value="" disabled>
                到谁
              </option>
              {figures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              name="label"
              placeholder="关系，如：死对头 / 酒友 / 传说中的师傅"
              required
            />
            <button className="btn" type="submit">
              连线
            </button>
          </form>
        </div>
      ) : null}
    </div>
    </div>
  );
}
