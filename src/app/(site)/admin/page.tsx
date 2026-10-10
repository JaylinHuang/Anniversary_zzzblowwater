import { PageStage } from "@/components/fx/PageStage";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/modules";
import { getDb, rowFrom, rowsFrom } from "@/lib/db";
import { MODULE_META, type ModuleKey } from "@/lib/constants";
import { hasDbPassphrase } from "@/lib/passphrase";
import { getSetupStatus } from "@/lib/setup-status";
import { isPollOpen } from "@/lib/poll-rules";
import { AdminClient } from "./AdminClient";
import { listFeedbackForAdmin } from "@/lib/feedback";
import { readSponsorLedger } from "@/lib/sponsor";
import { redirect } from "next/navigation";

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

  const setup = await getSetupStatus();

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

  const sponsor = await readSponsorLedger();

  return (
    <PageStage
      code="HDD-ADM"
      channel="ADMIN"
      title="管理后台"
        lede="运行日志、模块开关、统计隐私、投票明细，以及群友提交的意见。"
    >
      <AdminClient
        modules={modules}
        statsPublic={statsPublic}
        statsAnonymous={statsAnonymous}
        setup={setup}
        passphraseDbManaged={passphraseDbManaged}
        pollDetails={pollDetails}
        feedback={await listFeedbackForAdmin()}
        sponsorTotals={sponsor.totals}
        sponsorEntries={sponsor.entries}
        sponsorMembers={sponsor.members}
      />
    </PageStage>
  );
}
