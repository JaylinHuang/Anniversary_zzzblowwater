/** 建群/正日周年锚点：每年 7 月 10 日 */
export const ANNIVERSARY_MONTH = 7;
export const ANNIVERSARY_DAY = 10;

/** 今年庆典活动日（推迟） */
export const CELEBRATION_YEAR = 2026;
export const CELEBRATION_MONTH = 8;
export const CELEBRATION_DAY = 4;

export const SITE_BRAND = "吹水一周年";
/** QQ 群正式名称 */
export const GROUP_NAME = "zzz吹水群";
export const SITE_TAGLINE = "绝区零 · zzz吹水群同行记";

/** 默认群口令（生产环境务必用环境变量 SITE_PASSPHRASE 覆盖） */
export const DEFAULT_PASSPHRASE = "zzzblowwater";

/** Agent 名册配置（禁止在业务逻辑写死 25/40） */
export function agentRosterBaselineSize() {
  const n = Number(process.env.AGENT_ROSTER_BASELINE_SIZE || 25);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 25;
}

export function agentRosterSoftCap() {
  const n = Number(process.env.AGENT_ROSTER_SOFT_CAP || 40);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 40;
}

export function agentPersonaSampleSize() {
  const n = Number(process.env.AGENT_PERSONA_SAMPLE_SIZE || 120);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 120;
}

export function agentDriftEveryNTurns() {
  const n = Number(process.env.AGENT_DRIFT_EVERY_N_TURNS || 8);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 8;
}

/** 每用户每日 Agent 单聊轮次上限（可空位配置） */
export function agentDmDailyLimit() {
  const n = Number(process.env.AGENT_DM_DAILY_LIMIT || 40);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 40;
}

/** 每用户每日祝福条数上限（可空位配置） */
export function wishDailyLimit() {
  const n = Number(process.env.WISH_DAILY_LIMIT || 5);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

/** 每用户每日「猜说话人」出题上限（可空位配置） */
export function guessDailyLimit() {
  const n = Number(process.env.GUESS_DAILY_LIMIT || 30);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

export type Role = "guest" | "member" | "moderator" | "admin";

export const MODULE_KEYS = [
  "member-codex",
  "memory-timeline",
  "chat-archive",
  "fun-stats",
  "wish-wall",
  "party-games",
  "events-hub",
  "media-gallery",
  "lore-constellation",
  "member-agents",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_META: Record<
  ModuleKey,
  { label: string; href: string; blurb: string }
> = {
  "member-codex": {
    label: "群友图鉴",
    href: "/members",
    blurb: "收集每一位同行者",
  },
  "memory-timeline": {
    label: "时光卷轴",
    href: "/timeline",
    blurb: "一年里程碑",
  },
  "chat-archive": {
    label: "群聊归档",
    href: "/archive",
    blurb: "金句与记忆库",
  },
  "fun-stats": {
    label: "趣味统计",
    href: "/stats",
    blurb: "话痨与深夜修仙",
  },
  "wish-wall": {
    label: "祝福墙",
    href: "/wishes",
    blurb: "写下给彼此的话",
  },
  "party-games": {
    label: "周年玩法",
    href: "/games",
    blurb: "扭蛋 · 签文 · 拼图",
  },
  "events-hub": {
    label: "活动中枢",
    href: "/events",
    blurb: "公告 · 报名 · 投票",
  },
  "media-gallery": {
    label: "Meme 馆",
    href: "/gallery",
    blurb: "截图与表情包",
  },
  "lore-constellation": {
    label: "人物星图",
    href: "/constellation",
    blurb: "野史关系与轶事",
  },
  "member-agents": {
    label: "群友 Agent",
    href: "/agents",
    blurb: "管理员建档 · 绑 QQ 单聊",
  },
};

/** 计算自建群日以来的同行天数（锚点：给定年份的 7/10，默认最近已过的周年或建群年） */
export function daysTogether(now = new Date()): number {
  // 以 2025-07-10 为建群日（一周年正日为 2026-07-10）
  const founded = new Date(2025, ANNIVERSARY_MONTH - 1, ANNIVERSARY_DAY);
  const ms = now.getTime() - founded.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/** 最近一次庆典日：今年 8/4；过后则下一年 7/10 */
export function nextCelebrationDate(now = new Date()): Date {
  const celebration = new Date(
    CELEBRATION_YEAR,
    CELEBRATION_MONTH - 1,
    CELEBRATION_DAY,
    23,
    59,
    59,
  );
  if (now.getTime() <= celebration.getTime()) return celebration;
  // 庆典过后，指向下一正日周年
  let year = now.getFullYear();
  let next = new Date(year, ANNIVERSARY_MONTH - 1, ANNIVERSARY_DAY, 23, 59, 59);
  if (now.getTime() > next.getTime()) {
    next = new Date(year + 1, ANNIVERSARY_MONTH - 1, ANNIVERSARY_DAY, 23, 59, 59);
  }
  return next;
}

export function countdownParts(target: Date, now = new Date()) {
  const diff = Math.max(0, target.getTime() - now.getTime());
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  return { days, hours, minutes, done: diff === 0 };
}
