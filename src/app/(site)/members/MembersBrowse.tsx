"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { UserChip } from "@/components/UserChip";
import { filterMembers, type MemberCard } from "@/lib/members-filter";

export function MembersBrowse({ members }: { members: MemberCard[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => filterMembers(members, q), [members, q]);

  return (
    <div className="mt-8">
      <input
        className="input max-w-md"
        placeholder="搜索昵称 / 标签 / 擅长 / 徽章…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className="mt-2 text-xs text-[var(--fog)]">
        显示 {filtered.length} / {members.length}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m) => (
          <Link
            key={m.id}
            href={`/members/${m.id}`}
            className="panel rounded-2xl p-5 transition hover:border-[rgba(61,224,208,0.45)]"
          >
            <UserChip
              displayName={m.display_name}
              avatarUrl={m.avatar_url}
              size="md"
              className="text-base"
            />
            <div className="mt-1 line-clamp-2 text-sm text-[var(--fog)]">
              {m.bio || "还没写介绍"}
            </div>
            {m.mains ? (
              <div className="mt-2 text-xs text-[var(--amber)]">
                擅长：{m.mains}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1">
              {m.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--fog)]"
                >
                  {t}
                </span>
              ))}
              {m.badges.map((b) => (
                <span
                  key={b}
                  className="rounded-full border border-[rgba(240,163,94,0.45)] px-2 py-0.5 text-xs text-[var(--amber)]"
                >
                  {b}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--fog)]">没有匹配的群友名片。</p>
      ) : null}
    </div>
  );
}
