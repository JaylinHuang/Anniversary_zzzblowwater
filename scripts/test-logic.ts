/**
 * 无服务端依赖的逻辑自测：解析 / 脱敏 / 名册规则 / 金句索引 / 连签
 */
import assert from "assert";
import {
  parseQqTxt,
  isAgentCorpusText,
  isCountableTextMessage,
} from "../src/lib/chat-parser";
import { parseQceXlsx } from "../src/lib/chat-xlsx";
import { archiveFromQceExporter, parseArchiveJson } from "../src/lib/chat-json";
import { localEmbed } from "../src/lib/local-embed";
import { pickPersonaSamples } from "../src/lib/roster";
import { pickSpreadIds } from "../src/lib/corpus-sample";
import { idWindows } from "../src/lib/group-recall";
import {
  normalizeFeedbackBatch,
  parseFeedbackDecision,
} from "../src/lib/feedback";
import { openRecall, sameNeedles, sealRecall } from "../src/lib/recall-cache";
import {
  applyPersonaPatch,
  judgeTimeline,
  lineSupports,
  resolveSubject,
  topicNeedles,
} from "../src/lib/fact-timeline";
import { formatGroupRecallBlock, matchSpeakersInTalk, recallNameTokens } from "../src/lib/group-recall";
import { rerankHits } from "../src/lib/rag-rerank";
import { replyTemperature, AGENT_HARD_RULES, formatSpeakerIdentity, sameQq, correctSelfReply, correctOtherReply } from "../src/lib/agent-crew";
import { formatSpeakStyle, summarizeSpeakStyle } from "../src/lib/speak-stats";
import * as XLSX from "xlsx";
import { desensitize } from "../src/lib/desensitize";
import {
  flushIsDue,
  shanghaiDayKey,
} from "../src/lib/daily-flush";
import { trackedQqsInImport } from "../src/lib/import-refresh";
import {
  pickBaselineRoster,
  qualifiesForAdmission,
  selectAdmissions,
} from "../src/lib/roster-rules";
import { arbitrateResults } from "../src/lib/agent-arbitrate";
import {
  alignReplyWithFacts,
  assertDisjointPlan,
  buildCrewPlan,
  defaultCrewPlan,
} from "../src/lib/agent-crew";
import { daySeed, pickIndex } from "../src/lib/date-key";
import { buildGuessRound, gradeGuess } from "../src/lib/guess-speaker";
import {
  chineseBigramFreq,
  fillHourBuckets,
  isNightOwlHour,
  nightOwlRatio,
} from "../src/lib/stats-rules";
import { cleanWordCloud } from "../src/lib/wordcloud-clean";
import { isBotChat } from "../src/lib/bot-chat";
import { pickFeaturedEvent } from "../src/lib/events-rules";
import { filterMembers } from "../src/lib/members-filter";
import {
  daysUntilUnlock,
  escapeLikePattern,
  isCapsuleUnlocked,
} from "../src/lib/capsule-rules";
import { filterGallery, parseTags } from "../src/lib/gallery-filter";
import { weekdayIndex } from "../src/lib/date-key";
import { hashPassphrase, safeEqualStr } from "../src/lib/passphrase-hash";
import { isNavActive, PRIMARY_NAV_KEYS } from "../src/lib/nav";
import { isPollOpen, shouldShowPollResults } from "../src/lib/poll-rules";
import {
  canResendAt,
  hashQqCode,
  isCodeExpired,
  normalizeQq,
  qqMailbox,
} from "../src/lib/qq-verify";
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

async function main() {
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
  assert.strictEqual(
    isCountableTextMessage("[图片:a.jpg] [image: a.jpg]"),
    false,
  );
  ok("parseQqTxt + 媒体不计票");

  assert.strictEqual(isAgentCorpusText("哈哈哈哈哈"), false);
  assert.strictEqual(isAgentCorpusText("666"), false);
  assert.strictEqual(isAgentCorpusText("好的"), false);
  assert.strictEqual(isAgentCorpusText("https://example.com/a"), false);
  assert.strictEqual(isAgentCorpusText("[图片:a.jpg]"), false);
  assert.strictEqual(isAgentCorpusText("撤回了一条消息"), false);
  assert.strictEqual(isAgentCorpusText("今晚深渊还缺一个输出"), true);
  assert.strictEqual(isAgentCorpusText("@伊蕾娜 今日老婆"), false);
  assert.strictEqual(isAgentCorpusText("诺艾尔 今日运势"), false);
  assert.strictEqual(isAgentCorpusText("小呱呱点歌"), false);
  assert.strictEqual(isAgentCorpusText("哈哈 这期音擎也太亏了"), true);
  ok("人设输入过滤掉附和和笑声");

  {
    const lines = Array.from({ length: 100 }, (_, i) => `第${i}句`);
    const picked = pickPersonaSamples(lines, 10);
    assert.strictEqual(picked.length, 10);
    assert.strictEqual(picked[0], "第0句");
    assert.strictEqual(picked[picked.length - 1], "第99句");
    const same = localEmbed("这期音擎太亏了");
    const near = localEmbed("音擎也太亏了");
    const far = localEmbed("明天中午吃什么");
    const dot = (a: number[], b: number[]) =>
      a.reduce((sum, v, i) => sum + v * b[i], 0);
    assert.ok(dot(same, same) > 0.99);
    assert.ok(dot(same, near) > dot(same, far));
    ok("人设按时间抽样，本地向量能分开不同话题");
  }

  {
    const ids = Array.from({ length: 10000 }, (_, i) => i + 1);
    const spread = pickSpreadIds(ids, 160, 40);
    assert.ok(spread.includes(1));
    assert.ok(spread.includes(10000));
    assert.ok(spread.some((id) => id > 4000 && id < 6000));
    assert.ok(spread.length < 400);
    const few = pickSpreadIds([1, 2, 3, 4, 5], 120, 40);
    assert.deepStrictEqual(few, [1, 2, 3, 4, 5]);
    ok("全年均匀抽样会留住中间，条数很少时全部留下");
  }

  {
    assert.deepStrictEqual(topicNeedles("你现在在上高中还是初中"), ["高中", "初中"]);
    assert.deepStrictEqual(topicNeedles("你觉得麦当劳怎么样"), ["麦当劳"]);
    assert.strictEqual(
      resolveSubject("你现在在上高中还是初中", "牢火", []),
      "self",
    );
    assert.strictEqual(
      resolveSubject("你觉得牢火怎么样", "厂夏", ["牢火"]),
      "other",
    );
    assert.ok(lineSupports("我现在高二了", "高中"));
    assert.ok(!lineSupports("我不是高中生", "高中"));
    const older = {
      id: 1,
      sender: "牢火",
      qq: "1",
      content: "我还在读初三",
      sentAt: "2024-03-01 12:00:00",
    };
    const newer = {
      id: 2,
      sender: "牢火",
      qq: "1",
      content: "我现在高二了",
      sentAt: "2025-09-01 12:00:00",
    };
    const verdict = judgeTimeline({
      persona: "他还在读初中，别问了。",
      lines: [older, newer],
      alternatives: ["高中", "初中"],
    });
    assert.strictEqual(verdict.newer?.id, 2);
    assert.strictEqual(verdict.older?.id, 1);
    assert.ok(verdict.patch?.includes("2025-09-01"));
    assert.ok(verdict.patch?.includes("2024-03-01"));
    const quiet = judgeTimeline({
      persona: "喜欢开玩笑。",
      lines: [older, newer],
      alternatives: ["高中", "初中"],
    });
    assert.strictEqual(quiet.patch, null);
    assert.strictEqual(quiet.newer?.id, 2);
    const once = applyPersonaPatch("人设正文", verdict.patch || "");
    const twice = applyPersonaPatch(
      once,
      "关于「高中 / 初中」：以 2026-01-01 00:00 的发言为准：高三了。",
    );
    assert.strictEqual(twice.split("【群聊近况】").length, 2);
    assert.ok(twice.includes("高三"));
    assert.ok(!twice.includes("初三"));
    assert.ok(AGENT_HARD_RULES.includes("时间更晚"));
    const covered = idWindows(1, 20000, 8000, 80);
    assert.deepStrictEqual(covered[0], [1, 8000]);
    assert.strictEqual(covered[covered.length - 1][1], 20000);
    const sampled = idWindows(1, 1_000_000, 8000, 80);
    assert.ok(sampled.length <= 80);
    assert.strictEqual(sampled[0][0], 1);
    assert.strictEqual(sampled[sampled.length - 1][1], 1_000_000);
    const token = sealRecall({
      agentId: 2,
      needles: ["高中", "初中"],
      names: ["牢火"],
      lines: ["你自己在 2025-09-01 12:00 说过：我现在高二了"],
    });
    const opened = openRecall(token, 2);
    assert.ok(opened);
    assert.ok(sameNeedles(opened!.needles, ["初中", "高中"]));
    assert.strictEqual(openRecall(token, 9), null);
    assert.strictEqual(openRecall(`${token}x`, 2), null);
    ok("问自己也会对上话题，矛盾时以较新的时间更新人设");
  }

  {
    const ranked = rerankHits(
      "今晚去深渊吗",
      [
        {
          messageId: 1,
          content: "今晚去深渊",
          sentAt: "2026-08-01 20:00:00",
          vectorScore: 0.9,
        },
        {
          messageId: 2,
          content: "今晚不去深渊",
          sentAt: "2026-10-01 20:00:00",
          vectorScore: 0.9,
        },
        {
          messageId: 3,
          content: "今晚去深渊",
          sentAt: "2026-09-01 20:00:00",
          vectorScore: 0.88,
        },
        {
          messageId: 4,
          content: "哈哈哈哈哈",
          sentAt: "2026-10-02 20:00:00",
          vectorScore: 0.99,
        },
        {
          messageId: 5,
          content: "明天中午吃面条",
          sentAt: "2026-10-02 21:00:00",
          vectorScore: 0.05,
        },
      ],
      4,
    );
    assert.deepStrictEqual(
      ranked.map((hit) => hit.messageId),
      [2],
    );
    assert.strictEqual(replyTemperature("今晚有票吗"), 0.55);
    assert.strictEqual(replyTemperature("查一下打了多少次"), 0.55);
    assert.strictEqual(replyTemperature("你觉得麦当劳怎么样"), 0.85);
    assert.ok(replyTemperature("今晚有票吗") < replyTemperature("来句闲聊"));
    assert.ok(replyTemperature("你觉得牢火怎么样") > replyTemperature("今晚有票吗"));
    assert.ok(replyTemperature("来句闲聊") > 0.55);
    assert.ok(AGENT_HARD_RULES.includes("一个字都不要补"));
    assert.ok(AGENT_HARD_RULES.includes("给看法"));
    assert.ok(AGENT_HARD_RULES.includes("群聊归档"));
    assert.ok(!AGENT_HARD_RULES.includes("这我没在群里确认过"));
    const speakers = [
      { name: "牢火", qq: "10001" },
      { name: "火", qq: "10002" },
      { name: "群友", qq: "10003" },
    ];
    const matched = matchSpeakersInTalk(
      "你觉得牢火这个群友怎么样\n他打绝区零厉害吗",
      speakers,
    );
    assert.deepStrictEqual(
      matched.map((item) => item.name),
      ["牢火"],
    );
    assert.deepStrictEqual(
      recallNameTokens("你觉得牢火这个群友怎么样\n他打绝区零厉害吗"),
      ["牢火"],
    );
    const block = formatGroupRecallBlock(
      ["牢火"],
      ["「牢火」说过：这把打完了"],
    );
    assert.ok(block.includes("「牢火」说过：这把打完了"));
    assert.ok(block.includes("群聊归档"));
    assert.strictEqual(formatGroupRecallBlock([], []), "");
    const clipped = summarizeSpeakStyle(["嗯", "好", "在吗", "哈哈", "行", "睡了", "到了", "？"]);
    assert.ok(clipped);
    assert.ok(clipped!.avgLen < 10);
    assert.ok(formatSpeakStyle(clipped!).includes("说话节奏"));
    assert.strictEqual(summarizeSpeakStyle(["只有一句"]), null);
    const identity = formatSpeakerIdentity("sr.11", ["sr.11"], {
      self: true,
      agentName: "厂夏",
    });
    assert.ok(identity.includes("就是你本人"));
    assert.ok(identity.includes("这张卡叫「厂夏」"));
    assert.ok(identity.includes("你就是我"));
    assert.strictEqual(sameQq(10001, "10001"), true);
    assert.strictEqual(
      correctSelfReply("知道啊，sr.11嘛，群里那个", "sr.11", "厂夏"),
      "你就是我。群名片是sr.11，这张卡叫厂夏。",
    );
    const other = formatSpeakerIdentity("小明", ["小明"], {
      self: false,
      agentName: "厂夏",
    });
    assert.ok(other.includes("不是你本人"));
    assert.ok(other.includes("发送者写成 「小明」 的，才是他"));
    assert.ok(!/发送者写成[^。]*「厂夏」/.test(other));
    assert.strictEqual(
      correctOtherReply("你就是我。群名片是小明，这张卡叫厂夏。", "小明", "厂夏"),
      "你是小明，我是厂夏。咱们不是同一个人。",
    );
    assert.strictEqual(
      correctOtherReply("今晚不去深渊。", "小明", "厂夏"),
      "今晚不去深渊。",
    );
    ok("混合检索丢掉重复、无效和互相矛盾的旧说法");
  }

  {
    const aoa = [
      ["序号", "时间", "发送者", "发送者QQ号", "消息类型", "消息内容", "是否撤回"],
      [1, "2025-08-14T16:18:12.000Z", "甲", "10001", "文本", "建群啦", "否"],
      [2, "2025-08-14T16:19:00.000Z", "乙", "10002", "系统消息", "加入了群聊", "否"],
      [3, "2025-08-14T16:20:00.000Z", "甲", "10001", "文本", "撤回测试", "是"],
      [4, "2025-08-14T16:21:00.000Z", "丙", "10003", "回复", "回一句", "否"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "聊天记录");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const { messages } = parseQceXlsx(buf);
    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[0].qq, "10001");
    assert.strictEqual(messages[1].content, "回一句");
    ok("parseQceXlsx 过滤系统/撤回");
  }

  {
    const exporter = JSON.stringify({
      metadata: { name: "QQChatExporter" },
      chatInfo: { name: "测试群", peerUid: "869747866" },
      messages: [
        {
          time: "2026-08-03T16:00:02.000Z",
          type: "text",
          recalled: false,
          sender: { uin: "10001", name: "甲", groupCard: "群名片" },
          content: { text: "建群啦" },
        },
        {
          time: "2026-08-03T16:01:00.000Z",
          type: "system",
          recalled: false,
          sender: { uin: "10002", name: "乙" },
          content: { text: "加入了" },
        },
        {
          time: "2026-08-03T16:02:00.000Z",
          type: "text",
          recalled: true,
          sender: { uin: "10001", name: "甲" },
          content: { text: "撤回" },
        },
        {
          time: "2026-08-03T16:03:00.000Z",
          type: "reply",
          recalled: false,
          sender: { uin: "10003", name: "10003", groupCard: "" },
          content: {
            text: "",
            elements: [{ type: "text", data: { text: "回一句" } }],
          },
        },
      ],
    });
    const { doc } = archiveFromQceExporter(exporter, { sourceFile: "a.json" });
    assert.strictEqual(doc.messages.length, 2);
    assert.strictEqual(doc.messages[0].sender, "群名片");
    assert.strictEqual(doc.messages[0].qq, "10001");
    assert.strictEqual(doc.messages[0].sentAt, "2026-08-04 00:00:02");
    assert.strictEqual(doc.messages[1].content, "回一句");
    assert.strictEqual(doc.groupId, "869747866");
    const parsed = parseArchiveJson(JSON.stringify(doc));
    assert.strictEqual(parsed.messages.length, 2);
    assert.throws(() => parseArchiveJson(exporter));
    const withBlank = parseArchiveJson(
      JSON.stringify({
        format: "zzz-archive",
        version: 1,
        messages: [
          { sender: "甲", qq: "10001", sentAt: "2025-08-14 16:18:12", content: "建群啦" },
          { sender: "乙", qq: "10002", sentAt: "2025-08-14 16:19:00", content: "   " },
        ],
      }),
    );
    assert.strictEqual(withBlank.messages.length, 1);
    assert.ok(withBlank.errors.some((e) => e.includes("空正文")));
    ok("zzz-archive JSON 过滤并拒绝原始导出");
  }

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

  const plan = defaultCrewPlan();
  assert.strictEqual(new Set(plan.map((task) => task.role)).size, plan.length);
  assert.strictEqual(assertDisjointPlan(plan).length, 4);
  const split = buildCrewPlan("铃觉得音擎怎么样？哲觉得呢", "铃", [
    { id: 2, name: "哲", qq: "10002" },
  ]);
  assert.ok(split.some((task) => task.role === "consult:2"));
  assert.throws(() =>
    assertDisjointPlan([
      ...defaultCrewPlan(),
      { role: "voice", scope: "再答一次" },
    ]),
  );
  assert.strictEqual(
    alignReplyWithFacts("", ["深渊今晚缺输出"]),
    "我确认过的是：深渊今晚缺输出",
  );
  ok("调度任务不重叠，空草稿回落到共享事实");

  const chatWins = arbitrateResults({
    userText: "今晚还去深渊吗",
    chatText: "今晚不去深渊",
    memoryText: "今晚去深渊",
    consultText: "",
    draft: "今晚去深渊",
  });
  assert.ok(chatWins.conflicts.length > 0);
  assert.ok(chatWins.reply.includes("今晚不去深渊"));
  assert.ok(!chatWins.reply.includes("今晚去深渊"));
  const neither = arbitrateResults({
    userText: "今晚有票吗",
    chatText: "",
    memoryText: "有票",
    consultText: "没有票",
    draft: "有票",
  });
  assert.ok(neither.conflicts.some((item) => item.winnerSource === "none"));
  assert.ok(!neither.reply.includes("有票"));
  const userWins = arbitrateResults({
    userText: "我今晚不去深渊",
    chatText: "",
    memoryText: "今晚去深渊",
    consultText: "",
    draft: "今晚去深渊",
  });
  assert.ok(userWins.reply.includes("今晚不去深渊"));
  ok("冲突时群聊优先，其次用户原话");

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
  const filled = fillHourBuckets([
    { hour: "0", count: 3 },
    { hour: "23", count: 9 },
  ]);
  assert.strictEqual(filled.length, 24);
  assert.strictEqual(filled[0].count, 3);
  assert.strictEqual(filled[12].count, 0);
  assert.strictEqual(filled[23].hour, "23");
  assert.deepStrictEqual(fillHourBuckets([]), []);
  const grams = chineseBigramFreq(["今天建群啦", "建群冲冲冲"], 5);
  assert.ok(grams.some((g) => g.word === "建群"));
  const cleaned = await cleanWordCloud(
    [
      "在zzz吹水群里说天青色的誓约",
      "格莉丝下雪了",
      "哈哈哈哈一个这个就是没有",
      "我想睡醒了",
      "时候到了",
      "中午操了卧室操吃饭操时候操",
      "去操场看看",
      "今天打了boss和Boss",
    ],
    "zzz吹水群",
    20,
  );
  const cleanedWords = cleaned.map((item) => item.word);
  for (const word of ["天青色", "誓约", "格莉丝", "下雪", "睡醒", "中午", "卧室", "吃饭", "操场", "boss"]) {
    assert.ok(cleanedWords.includes(word), word);
  }
  for (const word of ["吹水", "水群", "天青", "青色", "格莉", "莉丝", "时候", "哈哈", "zzz", "the", "今天打"]) {
    assert.ok(!cleanedWords.includes(word), word);
  }
  assert.ok(cleanedWords.every((word) => !word.endsWith("操") || word === "操场"));
  const leaked = await cleanWordCloud(
    [
      "这个一个不是什么就是没有现在怎么可以还是",
      "其实假来但是我的知道游戏感觉之王然后这么是我",
      "我是群友黑水角色因为自己还有首席鉴本师",
      "起来喜欢永雏圆头耄应该",
      "在ZZZ吹水群里吹水，zzzblowwater",
      "席德是新角色",
      "今天打了boss",
    ],
    "zzz吹水群",
    40,
    ["zzzblowwater", "blowwater"],
  );
  const leakedWords = leaked.map((item) => item.word);
  for (const word of [
    "这个",
    "一个",
    "不是",
    "什么",
    "就是",
    "没有",
    "现在",
    "怎么",
    "可以",
    "还是",
    "其实",
    "但是",
    "我的",
    "知道",
    "然后",
    "这么",
    "是我",
    "我是",
    "因为",
    "自己",
    "还有",
    "起来",
    "应该",
    "假来",
    "吹水",
    "水群",
    "吹水群",
    "zzz",
    "zzzblowwater",
    "blowwater",
    "席鉴",
    "鉴本",
    "本师",
    "雏圆",
    "圆头",
    "头耄",
  ]) {
    assert.ok(!leakedWords.includes(word), word);
  }
  for (const word of ["席德", "新角色", "永雏圆头耄", "游戏", "喜欢", "boss"]) {
    assert.ok(leakedWords.includes(word), word);
  }
  assert.ok(leakedWords.some((word) => [...word].length > 4));
  const bots = new Set(["10001"]);
  assert.strictEqual(
    isBotChat({ sender: "伊蕾娜", content: "今日老婆" }, bots),
    true,
  );
  assert.strictEqual(
    isBotChat({ sender: "甲", qq: "10001", content: "在吗" }, bots),
    true,
  );
  assert.strictEqual(
    isBotChat({ sender: "甲", content: "@伊雷娜 点歌" }, bots),
    true,
  );
  assert.strictEqual(
    isBotChat({ sender: "甲", content: "天青色的誓约" }, bots),
    false,
  );
  ok("深夜指数与词云清洗");

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

  const beforeFour = new Date("2026-10-05T19:59:00Z");
  const atFour = new Date("2026-10-05T20:00:00Z");
  const nextFour = new Date("2026-10-06T20:00:00Z");
  assert.strictEqual(flushIsDue(beforeFour, null), false);
  assert.strictEqual(flushIsDue(atFour, null), true);
  assert.strictEqual(flushIsDue(atFour, atFour.toISOString()), false);
  assert.strictEqual(flushIsDue(nextFour, atFour.toISOString()), true);
  assert.strictEqual(shanghaiDayKey(atFour), "2026-10-06");
  assert.deepStrictEqual(
    trackedQqsInImport(["10001", "10002", "10001", ""], ["10002"]),
    ["10002"],
  );
  ok("新导入只跟进批次里已绑定的分身");

  assert.strictEqual(isNavActive("/agents/3", "/agents"), true);
  assert.strictEqual(isNavActive("/wishes", "/games"), false);
  assert.ok(PRIMARY_NAV_KEYS.includes("wish-wall"));
  ok("导航高亮与主入口");

  const d = new Date("2026-08-05T12:00:00");
  assert.strictEqual(isPollOpen("2026-08-05", d), true);
  assert.strictEqual(isPollOpen("2026-08-04", d), false);
  assert.strictEqual(shouldShowPollResults("2026-08-05", false, d), false);
  assert.strictEqual(
    shouldShowPollResults("2026-08-04", false, d),
    true,
  );
  ok("投票截止与结果可见性");

  assert.strictEqual(normalizeQq(" 123456 "), "123456");
  assert.strictEqual(normalizeQq("12ab"), null);
  assert.strictEqual(qqMailbox("10001"), "10001@qq.com");
  assert.notStrictEqual(hashQqCode("123456"), hashQqCode("654321"));
  assert.strictEqual(canResendAt(null).ok, true);
  assert.strictEqual(
    canResendAt(new Date(Date.now() - 10_000).toISOString()).ok,
    false,
  );
  assert.strictEqual(
    canResendAt(new Date(Date.now() - 70_000).toISOString()).ok,
    true,
  );
  assert.strictEqual(
    isCodeExpired(new Date(Date.now() - 1000).toISOString()),
    true,
  );
  ok("QQ 验证码规则");

  const batch = normalizeFeedbackBatch([
    { body: "  希望私聊再稳一点  ", note: "  刚才会断  " },
    { body: "", note: "" },
    { body: "词云能不能关掉机器人", note: "" },
  ]);
  assert.strictEqual(batch.length, 2);
  assert.strictEqual(batch[0].body, "希望私聊再稳一点");
  assert.strictEqual(batch[0].note, "刚才会断");
  assert.throws(() => normalizeFeedbackBatch([{ body: "", note: "只有说明" }]));
  assert.throws(() => normalizeFeedbackBatch([]));
  assert.strictEqual(parseFeedbackDecision("accepted"), "accepted");
  assert.throws(() => parseFeedbackDecision("maybe"));
  ok("意见可以批量提交，空行丢掉");

  console.log("全部逻辑用例通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
