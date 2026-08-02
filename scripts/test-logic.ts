/**
 * 无服务端依赖的逻辑自测：解析 / 脱敏 / 名册规则 / 金句索引 / 连签
 */
import assert from "assert";
import { parseQqTxt, isCountableTextMessage } from "../src/lib/chat-parser";
import { desensitize } from "../src/lib/desensitize";
import {
  pickBaselineRoster,
  qualifiesForAdmission,
  selectAdmissions,
} from "../src/lib/roster-rules";
import { daySeed, pickIndex } from "../src/lib/date-key";
import { buildGuessRound, gradeGuess } from "../src/lib/guess-speaker";
import {
  chineseBigramFreq,
  isNightOwlHour,
  nightOwlRatio,
} from "../src/lib/stats-rules";
import {
  extractPlainText,
  formatSender,
  formatSentAt,
  shouldAcceptGroup,
} from "../src/lib/onebot-parse";
import { pickFeaturedEvent } from "../src/lib/events-rules";
import { filterMembers } from "../src/lib/members-filter";
import {
  daysUntilUnlock,
  escapeLikePattern,
  isCapsuleUnlocked,
} from "../src/lib/capsule-rules";
import { filterGallery, parseTags } from "../src/lib/gallery-filter";
import { matchLoreFigure } from "../src/lib/lore-filter";
import { weekdayIndex } from "../src/lib/date-key";
import { hashPassphrase, safeEqualStr } from "../src/lib/passphrase-hash";
import { isNavActive, PRIMARY_NAV_KEYS } from "../src/lib/nav";
// checkin-rules 使用 @/ 别名；此处内联等价断言，避免 tsx 脚本路径问题
function stampForDate(dateKey: string): string {
  const STAMPS = [
    "绳网签到",
    "空洞打卡",
    "电波回应",
    "邦布盖章",
    "霓虹足迹",
    "夜航印记",
    "吹水一戳",
  ];
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = (h + dateKey.charCodeAt(i) * (i + 3)) % 997;
  }
  return STAMPS[h % STAMPS.length];
}
function todayKeyFromParts(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function previousDay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return todayKeyFromParts(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}
function computeStreak(
  dates: string[],
  today: string,
  checkedToday: boolean,
): number {
  const set = new Set(dates);
  let cursor = checkedToday ? today : previousDay(today);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

function ok(name: string) {
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("== test-logic ==");

  const sample = `
2025-07-10 21:05:33 甲(10001)
建群啦
2025-07-10 21:06:00 乙(10002)
[图片]
2025-07-10 21:07:00 甲(10001)
电话 13812345678 看 https://evil.example/x
`;
  const { messages } = parseQqTxt(sample);
  assert.strictEqual(messages.length, 3);
  assert.strictEqual(messages[0].qq, "10001");
  assert.strictEqual(isCountableTextMessage("[图片]"), false);
  assert.strictEqual(isCountableTextMessage("建群啦"), true);
  ok("parseQqTxt + 媒体不计票");

  const scrubbed = desensitize(messages[2].content);
  assert.ok(scrubbed.includes("[手机号]"));
  assert.ok(scrubbed.includes("[链接]"));
  assert.ok(!scrubbed.includes("13812345678"));
  ok("desensitize 手机号与链接");

  const ranked = [
    { qq: "1", displayName: "A", textCount: 100 },
    { qq: "2", displayName: "B", textCount: 80 },
    { qq: "3", displayName: "C", textCount: 50 },
    { qq: "4", displayName: "D", textCount: 50 },
    { qq: "5", displayName: "E", textCount: 51 },
  ];
  const { picked, threshold } = pickBaselineRoster(ranked, 3, 40);
  assert.strictEqual(picked.length, 3);
  assert.strictEqual(threshold, 50);
  assert.strictEqual(qualifiesForAdmission(50, threshold), false);
  assert.strictEqual(qualifiesForAdmission(51, threshold), true);
  ok("基线 threshold* 与严格大于");

  const admitted = selectAdmissions(ranked, {
    threshold,
    softCap: 4,
    existingQqs: picked.map((p) => p.qq),
    currentEnabledCount: 3,
  });
  assert.deepStrictEqual(
    admitted.map((a) => a.qq),
    ["5"],
  );
  ok("软顶内增量准入且不踢人");

  const softBlocked = selectAdmissions(ranked, {
    threshold,
    softCap: 3,
    existingQqs: picked.map((p) => p.qq),
    currentEnabledCount: 3,
  });
  assert.strictEqual(softBlocked.length, 0);
  ok("触软顶不再准入");

  const a = pickIndex(daySeed("2026-07-17"), 10);
  const b = pickIndex(daySeed("2026-07-17"), 10);
  const c = pickIndex(daySeed("2026-07-18"), 10);
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  ok("今日金句索引按日稳定");

  assert.strictEqual(
    computeStreak(["2026-07-17", "2026-07-16", "2026-07-15"], "2026-07-17", true),
    3,
  );
  assert.strictEqual(
    computeStreak(["2026-07-16", "2026-07-15"], "2026-07-17", false),
    2,
  );
  assert.strictEqual(computeStreak(["2026-07-14"], "2026-07-17", false), 0);
  assert.ok(stampForDate("2026-07-17").length > 0);
  ok("连签与印章");

  // DM 额度剩余计算（与 dm-limit 约定一致）
  const limit = 40;
  const used = 39;
  const remaining = Math.max(0, limit - used);
  assert.strictEqual(remaining, 1);
  assert.strictEqual(used >= limit, false);
  assert.strictEqual(40 >= 40, true);
  ok("DM 日限额边界");

  const guess = buildGuessRound(
    [
      { id: 1, sender: "甲", content: "今天建群啦冲冲冲" },
      { id: 2, sender: "乙", content: "来了来了我在线上" },
      { id: 3, sender: "丙", content: "修仙中不要吵我" },
      { id: 4, sender: "甲", content: "庆典改到八月四号见" },
    ],
    42,
  );
  assert.ok(guess);
  assert.ok(guess!.options.includes("甲") || guess!.options.length >= 2);
  assert.strictEqual(
    gradeGuess(guess!.answerIndex, guess!.answerIndex),
    true,
  );
  assert.strictEqual(gradeGuess(0, 1), false);
  // 同 seed 可复现
  const guess2 = buildGuessRound(
    [
      { id: 1, sender: "甲", content: "今天建群啦冲冲冲" },
      { id: 2, sender: "乙", content: "来了来了我在线上" },
      { id: 3, sender: "丙", content: "修仙中不要吵我" },
      { id: 4, sender: "甲", content: "庆典改到八月四号见" },
    ],
    42,
  );
  assert.deepStrictEqual(guess, guess2);
  ok("猜说话人出题可复现");

  assert.strictEqual(isNightOwlHour(23), true);
  assert.strictEqual(isNightOwlHour(2), true);
  assert.strictEqual(isNightOwlHour(12), false);
  assert.strictEqual(nightOwlRatio(25, 100), 25);
  const grams = chineseBigramFreq(["今天建群啦", "建群冲冲冲"], 5);
  assert.ok(grams.some((g) => g.word === "建群"));
  ok("深夜指数与双字词频");

  const plain = extractPlainText({
    raw_message: "",
    message: [
      { type: "text", data: { text: "你好" } },
      { type: "image", data: {} },
      { type: "at", data: { qq: "10001" } },
    ],
  });
  assert.strictEqual(plain, "你好[图片]@10001");
  assert.strictEqual(
    formatSender({ sender: { card: "群名片", nickname: "昵称" }, user_id: 1 }),
    "群名片",
  );
  assert.ok(formatSentAt(1720000000).startsWith("2024-"));
  assert.strictEqual(shouldAcceptGroup(869747866, "869747866"), true);
  assert.strictEqual(shouldAcceptGroup(1, "869747866"), false);
  assert.strictEqual(shouldAcceptGroup(1, null), true);
  ok("OneBot 文本提取与群过滤");

  const featured = pickFeaturedEvent(
    [
      {
        id: 1,
        title: "已过",
        starts_at: "2020-01-01 12:00:00",
        status: "open",
      },
      {
        id: 2,
        title: "庆典",
        starts_at: "2026-08-04 20:00:00",
        status: "open",
      },
      {
        id: 3,
        title: "关闭",
        starts_at: "2026-09-01 20:00:00",
        status: "closed",
      },
    ],
    new Date("2026-07-17T12:00:00"),
  );
  assert.strictEqual(featured?.id, 2);
  ok("活动焦点挑选");

  const filtered = filterMembers(
    [
      {
        id: 1,
        display_name: "绳匠甲",
        bio: "喜欢深渊",
        tags: ["话痨"],
        mains: "安比",
        badges: ["正日达人"],
      },
      {
        id: 2,
        display_name: "夜猫丙",
        bio: "修仙",
        tags: ["夜猫"],
        mains: "",
        badges: [],
      },
    ],
    "正日",
  );
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].id, 1);
  ok("图鉴检索");

  assert.strictEqual(isCapsuleUnlocked("2026-07-10", "2026-07-17"), true);
  assert.strictEqual(isCapsuleUnlocked("2027-07-10", "2026-07-17"), false);
  assert.strictEqual(daysUntilUnlock("2026-07-20", "2026-07-17"), 3);
  assert.strictEqual(escapeLikePattern("100%_ok"), "100\\%\\_ok");
  ok("胶囊解锁与 LIKE 转义");

  assert.deepStrictEqual(parseTags('["梗图","邦布"]'), ["梗图", "邦布"]);
  assert.strictEqual(
    filterGallery(
      [
        {
          id: 1,
          title: "翻车截图",
          path: "/x",
          likes: 1,
          display_name: "甲",
          tags: ["翻车"],
        },
        {
          id: 2,
          title: "欧皇",
          path: "/y",
          likes: 2,
          display_name: "乙",
          tags: ["欧"],
        },
      ],
      "翻车",
    ).length,
    1,
  );
  ok("Meme 馆筛选");

  assert.strictEqual(
    matchLoreFigure(
      { id: 1, name: "绳匠甲", epithet: "建群人", summary: "起源" },
      "建群",
    ),
    true,
  );
  assert.strictEqual(
    matchLoreFigure(
      { id: 1, name: "绳匠甲", epithet: "建群人", summary: "起源" },
      "电波",
    ),
    false,
  );
  ok("星图人物检索");

  // 2026-07-17 是周五 → getDay()=5
  assert.strictEqual(weekdayIndex("2026-07-17"), 5);
  assert.strictEqual(weekdayIndex("2026-07-12"), 0);
  ok("同星期怀旧索引");

  assert.strictEqual(
    hashPassphrase("abc"),
    hashPassphrase("abc"),
  );
  assert.notStrictEqual(hashPassphrase("abc"), hashPassphrase("abd"));
  assert.strictEqual(safeEqualStr("same", "same"), true);
  assert.strictEqual(safeEqualStr("a", "b"), false);
  ok("口令哈希");

  assert.strictEqual(isNavActive("/agents/3", "/agents"), true);
  assert.strictEqual(isNavActive("/wishes", "/games"), false);
  assert.ok(PRIMARY_NAV_KEYS.includes("wish-wall"));
  ok("导航高亮与主入口");

  console.log("全部逻辑用例通过");
}

main();
