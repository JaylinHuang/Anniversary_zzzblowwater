import { getSessionUser, isAdmin } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/modules";
import { getDb, rowFrom } from "@/lib/db";
import { MODULE_META, type ModuleKey } from "@/lib/constants";
import { getLiveSyncStatus } from "@/lib/onebot";
import { hasDbPassphrase } from "@/lib/passphrase";
import { getSetupStatus } from "@/lib/setup-status";
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
  const setup = await getSetupStatus();
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  const webhookUrl = `${proto}://${host}/api/webhooks/onebot`;

  return (
    <div>
      <h1 className="brand-font text-3xl text-[var(--cyan)]">管理后台</h1>
      <p className="mt-2 text-sm text-[var(--fog)]">
        模块开关、统计隐私、机器人实时同步。国内单机部署请配置环境变量后重启。
      </p>
      <AdminClient
        modules={modules}
        statsPublic={statsPublic}
        statsAnonymous={statsAnonymous}
        setup={setup}
        passphraseDbManaged={passphraseDbManaged}
        onebot={{
          configured: sync.configured,
          groupId: sync.groupId,
          webhookUrl,
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
    </div>
  );
}
