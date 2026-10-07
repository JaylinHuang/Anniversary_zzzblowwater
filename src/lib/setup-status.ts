import { DEFAULT_PASSPHRASE, GROUP_NAME } from "@/lib/constants";
import { getDb, rowFrom } from "@/lib/db";
import { isLlmConfigured } from "@/lib/llm";
import { countActiveQuotes } from "@/lib/daily-quote";
import { hasDbPassphrase } from "@/lib/passphrase";
import { isMailConfigured } from "@/lib/mail";

export type SetupItem = {
  id: string;
  label: string;
  ok: boolean;
  /** 需要你去填的配置空位说明 */
  hint: string;
  /** 是否阻塞核心体验 */
  critical: boolean;
};

export async function getSetupStatus(): Promise<{
  groupName: string;
  items: SetupItem[];
  readyScore: number;
}> {
  const db = await getDb();
  const msgCount = Number(
    rowFrom<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM chat_messages m
       JOIN import_batches b ON b.id = m.batch_id
       WHERE b.status = 'active'`,
    )?.c ?? 0,
  );
  const userCount = Number(
    rowFrom<{ c: number }>(db, `SELECT COUNT(*) as c FROM users`)?.c ?? 0,
  );
  const agentCount = Number(
    rowFrom<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM agent_personas WHERE enabled = 1`,
    )?.c ?? 0,
  );
  const quoteCount = await countActiveQuotes();
  const passphrase = process.env.SITE_PASSPHRASE || DEFAULT_PASSPHRASE;
  const passphraseCustom =
    (await hasDbPassphrase()) ||
    (Boolean(process.env.SITE_PASSPHRASE) &&
      process.env.SITE_PASSPHRASE !== DEFAULT_PASSPHRASE);
  const llm = isLlmConfigured();

  const items: SetupItem[] = [
    {
      id: "passphrase",
      label: "整站口令已自定义",
      ok: passphraseCustom,
      hint: "管理员在「管理后台 → 整站口令」修改（或 .env 的 SITE_PASSPHRASE）",
      critical: false,
    },
    {
      id: "users",
      label: "至少一位建档用户",
      ok: userCount >= 1,
      hint: "打开 /gate 注册第一位管理员",
      critical: true,
    },
    {
      id: "qq-smtp",
      label: "QQ 邮箱发信已配置（建档验证码）",
      ok: isMailConfigured(),
      hint: ".env 设置 QQ_SMTP_USER / QQ_SMTP_PASS（QQ 邮箱 SMTP 授权码）",
      critical: true,
    },
    {
      id: "archive",
      label: "已导入群聊归档",
      ok: msgCount >= 1,
      hint: "管理端导入 zzz-archive JSON，或 npm run db:sample-import",
      critical: false,
    },
    {
      id: "quotes",
      label: "已有金句（今日金句更准）",
      ok: quoteCount >= 1,
      hint: "在「群聊归档」把好玩的句子标为金句",
      critical: false,
    },
    {
      id: "llm",
      label: "LLM 已配置（Agent 单聊）",
      ok: llm,
      hint: "配置 LLM_API_BASE / LLM_API_KEY / LLM_MODEL；可选 AGENT_DM_DAILY_LIMIT",
      critical: false,
    },
    {
      id: "roster",
      label: "已有管理员建档的 Agent",
      ok: agentCount > 0,
      hint: "管理员在「群友 Agent」页手动添加：姓名、插画、绑定 QQ",
      critical: false,
    },
  ];

  // 口令本身始终存在（有默认），单独展示当前是否可解锁不必要
  void passphrase;

  const okN = items.filter((i) => i.ok).length;
  return {
    groupName: GROUP_NAME,
    items,
    readyScore: Math.round((okN / items.length) * 100),
  };
}
