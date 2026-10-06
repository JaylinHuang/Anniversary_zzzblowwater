import { PageStage } from "@/components/fx/PageStage";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/modules";
import { getDb, rowFrom, rowsFrom } from "@/lib/db";
import { MODULE_META, type ModuleKey } from "@/lib/constants";
import { getLiveSyncStatus } from "@/lib/onebot";
import { getInboxStatus } from "@/lib/daily-flush";
import { hasDbPassphrase } from "@/lib/passphrase";
import { getSetupStatus } from "@/lib/setup-status";
import { isPollOpen } from "@/lib/poll-rules";
import { AdminClient } from "./AdminClient";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) {
    redirect("/");
  }
  const passphraseDbManaged = await hasDbPassphrase();
  const flags = await getFeatureFlags();
  const db = await getDb();
  const statsPublic =
    rowFrom<{ value: string }>(
      db,
      `SELECT value FROM site_settings WHERE key = 'stats_public'`,
    )?.value === "1";
  const statsAnonymous =
    rowFrom<{ value: string }>(
      db,
      `SELECT value FROM site_settings WHERE key = 'stats_anonymous'`,
    )?.value === "1";

  const modules = (Object.keys(MODULE_META) as ModuleKey[]).map((k) => ({
    key: k,
    label: MODULE_META[k].label,
    enabled: flags[k],
  }));

  const sync = await getLiveSyncStatus();
  const inbox = await getInboxStatus();
  const setup = await getSetupStatus();
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  const webhookUrl = `${proto}://${host}/api/webhooks/onebot`;

  const pollDetails = rowsFrom<{
    id: number;
    question: string;
    options: string;
    show_live: number;
    ends_at: string | null;
  }>(db, `SELECT * FROM polls ORDER BY id DESC`).map((p) => {
    const options = JSON.parse(p.options || "[]") as string[];
    const ballots = rowsFrom<{
      user_id: number;
      display_name: string;
      avatar_url: string | null;
      option_index: number;
    }>(
      db,
      `SELECT u.id as user_id, u.display_name, u.avatar_url, v.option_index
       FROM poll_votes v JOIN users u ON u.id = v.user_id
       WHERE v.poll_id = ?
       ORDER BY v.option_index, u.display_name`,
      [p.id],
    );
    const tallies = options.map(
      (_, idx) => ballots.filter((b) => b.option_index === idx).length,
    );
    return {
      id: p.id,
      question: p.question,
      options,
      endsAt: p.ends_at,
      open: isPollOpen(p.ends_at),
      tallies,
      total: ballots.length,
      ballots: ballots.map((b) => ({
        userId: b.user_id,
        displayName: b.display_name,
        avatarUrl: b.avatar_url,
        optionIndex: b.option_index,
        optionLabel: options[b.option_index] ?? `选项 ${b.option_index}`,
      })),
    };
  });

  return (
    <PageStage
      code="HDD-ADM"
      channel="ADMIN"
      title="管理后台"
        lede="模块开关、统计隐私、投票明细、群消息每天凌晨更新。"
    >
      <AdminClient
        modules={modules}
        statsPublic={statsPublic}
        statsAnonymous={statsAnonymous}
        setup={setup}
        passphraseDbManaged={passphraseDbManaged}
        pollDetails={pollDetails}
        onebot={{
          configured: sync.configured,
          groupId: sync.groupId,
          webhookUrl,
          pending: inbox.pending,
          lastFlushAt: inbox.lastFlushAt,
          batch: sync.batch
            ? {
                id: sync.batch.id,
                messageCount: Number(sync.batch.message_count),
                timeStart: sync.batch.time_start,
                timeEnd: sync.batch.time_end,
                status: sync.batch.status,
              }
            : null,
        }}
      />
    </PageStage>
  );
}
