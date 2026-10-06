"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { UserChip } from "@/components/UserChip";
import { apiFetch } from "@/lib/api-client";
import type { ModuleKey } from "@/lib/constants";

export function AdminClient({
  modules,
  statsPublic,
  statsAnonymous,
  setup,
  passphraseDbManaged,
  pollDetails,
  onebot,
}: {
  modules: { key: ModuleKey; label: string; enabled: boolean }[];
  statsPublic: boolean;
  statsAnonymous: boolean;
  passphraseDbManaged: boolean;
  setup: {
    groupName: string;
    readyScore: number;
    items: {
      id: string;
      label: string;
      ok: boolean;
      hint: string;
      critical: boolean;
    }[];
  };
  pollDetails: {
    id: number;
    question: string;
    options: string[];
    endsAt: string | null;
    open: boolean;
    tallies: number[];
    total: number;
    ballots: {
      userId: number;
      displayName: string;
      avatarUrl?: string | null;
      optionIndex: number;
      optionLabel: string;
    }[];
  }[];
  onebot: {
    configured: boolean;
    groupId: string | null;
    webhookUrl: string;
    pending: number;
    lastFlushAt: string | null;
    batch: {
      id: number;
      messageCount: number;
      timeStart: string | null;
      timeEnd: string | null;
      status: string;
    } | null;
  };
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [currentPw, setCurrentPw] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  async function toggle(key: ModuleKey, enabled: boolean) {
    try {
      await apiFetch("/api/admin/flags", {
        method: "PATCH",
        body: JSON.stringify({ key, enabled }),
      });
      success(enabled ? "模块已开启" : "模块已关闭");
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "更新失败");
    }
  }

  async function patchStats(patch: {
    statsPublic?: boolean;
    statsAnonymous?: boolean;
  }) {
    try {
      await apiFetch("/api/stats", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      success("统计设置已更新");
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "更新失败");
    }
  }

  async function changePassphrase(e: FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    try {
      const data = await apiFetch<{ message?: string }>("/api/admin/passphrase", {
        method: "POST",
        body: JSON.stringify({
          current: currentPw,
          next: nextPw,
          confirm: confirmPw,
        }),
      });
      success(data.message || "口令已更新");
      setCurrentPw("");
      setNextPw("");
      setConfirmPw("");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "修改失败");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="panel rounded-2xl p-5">
        <h2 className="stage-sec">整站口令</h2>
        <p className="mt-2 text-sm text-[var(--fog)]">
          仅管理员可修改。普通成员看不到此入口。
          {passphraseDbManaged
            ? " 当前：数据库口令（后台已设置）。"
            : " 当前：.env / 默认口令；你改一次后将由数据库接管。"}
        </p>
        <form onSubmit={changePassphrase} className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            className="input"
            type="password"
            placeholder="当前口令"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            required
            autoComplete="current-password"
          />
          <input
            className="input"
            type="password"
            placeholder="新口令（4–64 字）"
            value={nextPw}
            onChange={(e) => setNextPw(e.target.value)}
            required
            minLength={4}
            maxLength={64}
            autoComplete="new-password"
          />
          <input
            className="input"
            type="password"
            placeholder="确认新口令"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            required
            minLength={4}
            maxLength={64}
            autoComplete="new-password"
          />
          <button className="btn md:col-span-3" type="submit" disabled={pwBusy}>
            {pwBusy ? "保存中…" : "更新口令"}
          </button>
        </form>
      </section>

      <section className="panel rounded-2xl p-5">
        <h2 className="stage-sec">
          开箱清单 · {setup.groupName}
          <span className="ml-2 text-sm text-[var(--cyan)]">
            就绪 {setup.readyScore}%
          </span>
        </h2>
        <p className="mt-2 text-sm text-[var(--fog)]">
          标「未完成」的是给你留的配置空位；代码侧逻辑已就绪，填完重启即可。
        </p>
        <ul className="mt-4 space-y-3 text-sm">
          {setup.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 border-b border-[var(--line)] pb-3 last:border-0 sm:flex-row sm:items-start sm:justify-between"
            >
              <div>
                <span className={item.ok ? "text-[var(--cyan)]" : "text-[var(--danger)]"}>
                  {item.ok ? "✓" : "○"} {item.label}
                </span>
                {item.critical && !item.ok ? (
                  <span className="ml-2 text-xs text-[var(--amber)]">关键</span>
                ) : null}
              </div>
              {!item.ok ? (
                <code className="text-xs text-[var(--fog)] sm:max-w-md sm:text-right">
                  {item.hint}
                </code>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel rounded-2xl p-5">
        <h2 className="stage-sec">数据备份</h2>
        <p className="mt-2 text-sm text-[var(--fog)]">
          导出模块开关、里程碑、Agent 名册元数据与金句（不含会话令牌与口令）。
        </p>
        <a className="btn mt-4 inline-block" href="/api/admin/backup">
          下载 JSON 快照
        </a>
      </section>

      <section className="panel rounded-2xl p-5">
        <h2 className="stage-sec">模块开关</h2>
        <ul className="mt-4 space-y-3">
          {modules.map((m) => (
            <li key={m.key} className="flex items-center justify-between text-sm">
              <span>{m.label}</span>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => toggle(m.key, !m.enabled)}
              >
                {m.enabled ? "已开启" : "已关闭"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel rounded-2xl p-5">
        <h2 className="stage-sec">投票明细</h2>
        <p className="mt-2 text-sm text-[var(--fog)]">
          仅管理员可见：每人投了哪一项、各选项合计。
        </p>
        <div className="mt-4 space-y-5">
          {pollDetails.length === 0 ? (
            <p className="text-sm text-[var(--fog)]">暂无投票。</p>
          ) : null}
          {pollDetails.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-[var(--line)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-sm text-[var(--ink)]">{p.question}</h3>
                <span className="text-xs text-[var(--fog)]">
                  {p.open ? "进行中" : "已截止"}
                  {p.endsAt ? ` · ${p.endsAt}` : ""}
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-[var(--fog)]">
                {p.options.map((opt, idx) => (
                  <li key={opt}>
                    {opt}：
                    <span className="text-[var(--cyan)]">
                      {p.tallies[idx] ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--fog)]">
                合计 {p.total} 票
              </p>
              {p.ballots.length ? (
                <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs text-[var(--fog)]">
                  {p.ballots.map((b) => (
                    <li
                      key={`${p.id}-${b.userId}`}
                      className="flex items-center gap-2"
                    >
                      <UserChip
                        displayName={b.displayName}
                        avatarUrl={b.avatarUrl}
                        userId={b.userId}
                      />
                      <span>→ {b.optionLabel}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-[var(--fog)]">尚无人投票</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel rounded-2xl p-5">
        <h2 className="stage-sec">趣味统计</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="btn"
            type="button"
            onClick={() => patchStats({ statsPublic: !statsPublic })}
          >
            公开统计：{statsPublic ? "开" : "关"}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => patchStats({ statsAnonymous: !statsAnonymous })}
          >
            匿名榜：{statsAnonymous ? "开" : "关"}
          </button>
        </div>
      </section>

      <section className="panel rounded-2xl p-5">
        <h2 className="stage-sec">群消息 · 实时收取，凌晨灌库</h2>
        <p className="mt-2 text-sm text-[var(--fog)]">
          状态：
          <span className={onebot.configured ? "text-[var(--cyan)]" : "text-[var(--danger)]"}>
            {onebot.configured ? "已配置令牌" : "未配置 ONEBOT_ACCESS_TOKEN"}
          </span>
          {onebot.groupId ? ` · 限定群 ${onebot.groupId}` : " · 未限定群号"}
        </p>
        <p className="mt-3 text-sm text-[var(--ink)]">
          收件箱待灌入 {onebot.pending} 条
          {onebot.lastFlushAt
            ? ` · 上次灌库 ${onebot.lastFlushAt.replace("T", " ").slice(0, 16)}`
            : " · 还没灌过库"}
        </p>
        <p className="mt-3 break-all text-sm">
          Webhook URL：
          <code className="text-[var(--cyan)]">{onebot.webhookUrl}</code>
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[var(--fog)]">
          <li>
            在 <code>.env</code> 设置 <code>ONEBOT_ACCESS_TOKEN</code> 与{" "}
            <code>ONEBOT_GROUP_ID</code>，重启服务
          </li>
          <li>用 NapCat 登录一个已在群里的 QQ，打开 OneBot 11 的 HTTP 上报</li>
          <li>
            上报地址填上面的 URL，令牌用{" "}
            <code>Authorization: Bearer &lt;令牌&gt;</code>
          </li>
          <li>消息先脱敏收成 JSON，停在收件箱，不立刻进归档和统计</li>
          <li>每天北京时间 04:00 灌进群聊归档，并刷新已绑定 Agent 的条数和向量。趣味统计下次打开就会用上新消息</li>
        </ol>
        {onebot.batch ? (
          <p className="mt-4 text-sm text-[var(--fog)]">
            旧的实时批次 #{onebot.batch.id} 还在归档里，共 {onebot.batch.messageCount} 条。新消息改走每天凌晨的批次。
          </p>
        ) : null}
      </section>
    </div>
  );
}
