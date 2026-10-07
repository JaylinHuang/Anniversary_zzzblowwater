/**
 * 群友分身的记忆分层和工具回路自测。
 * 对照 gauntlet/bars/agent-memory-bar.md 里的 9 条行为，每条都要有会失败的断言。
 *
 * 不联网、不读生产库：临时开一个内存 sql.js 库，建表语句和 db.ts 共用一份；
 * 向量一律用本地字面向量或假向量注入。
 */
import assert from "assert";
import path from "path";
import initSqlJs, { Database } from "sql.js";

import { migrateAgentMemory } from "../src/lib/db";
import { localEmbed } from "../src/lib/local-embed";
import {
  decayUnusedSync,
  embedOrNull,
  getCompressedUptoSync,
  listWorkingNotesSync,
  loadActiveMemoriesSync,
  loadAllMemoriesSync,
  mergeDuplicatesSync,
  noteWorkingSync,
  rememberSync,
  runIdleMaintenanceSync,
  searchMemorySync,
  sqlNow,
  type EmbedPort,
} from "../src/lib/agent-memory";
import {
  IMPORTANCE_CHAT,
  IMPORTANCE_CRITICAL,
  IMPORTANCE_EXPLICIT,
  MEMORY_SCORE_FLOOR,
  acceptSummary,
  classifyImportance,
  detectExplicitRemember,
  extractTurnMemory,
  foldedText,
  hasFactContent,
  keyConstraints,
  keywordBoost,
  memoryScore,
  memoryTopic,
  planWindowCompression,
  rankMemories,
  timeDecay,
  type MemoryItem,
  type WindowMessage,
} from "../src/lib/memory-score";
import {
  AGENT_TOOL_NAMES,
  FORBIDDEN_TOOL_NAMES,
  assertSafeRegistry,
  buildToolRegistry,
  findTool,
} from "../src/lib/agent-tools";
import {
  MAX_TURN_STEPS,
  TURN_CAP_REPLY,
  runToolLoop,
  type StepFn,
} from "../src/lib/agent-loop";
import {
  buildTurnPorts,
  buildTurnSystemPrompt,
  compressDmWindow,
  formatMemoryBlock,
  formatWorkingBlock,
  planTurnMemory,
  runMemberTurnDetailed,
} from "../src/lib/agent-turn";
import type { ChatMessage } from "../src/lib/llm";
import {
  claimsSelfIdentity,
  correctOtherReply,
  correctSelfReply,
  formatSpeakerIdentity,
  sameQq,
} from "../src/lib/agent-crew";

const AGENT = 7;
const JIA = 101;
const YI = 102;
const AGENT_QQ = "10001";

/** 每一节单独开一个内存库，互不污染，也不碰 data/app.db */
async function freshDb(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
  });
  const db = new SQL.Database();
  migrateAgentMemory(db);
  return db;
}

/** 假向量：本地字面向量，纯计算、不出网 */
const fakeEmbed: EmbedPort = async (texts) => texts.map((t) => localEmbed(t));
/** 向量接口挂掉的情形 */
const brokenEmbed: EmbedPort = async () => {
  throw new Error("向量接口不可用");
};

function ok(name: string) {
  console.log(`  ✓ ${name}`);
}

function item(over: Partial<MemoryItem> & { id: number }): MemoryItem {
  return {
    topic: "称呼",
    kind: "fact",
    fact: "",
    importance: IMPORTANCE_CHAT,
    updatedAt: "2026-10-07 00:00:00",
    vector: null,
    superseded: false,
    ...over,
  };
}

/** 1. 私聊记忆按网站用户分开 */
async function testPerUserIsolation() {
  const db = await freshDb();
  const now = new Date("2026-10-07T02:00:00Z");
  rememberSync(db, {
    agentId: AGENT,
    userId: JIA,
    fact: "甲：我叫阿黄",
    topic: memoryTopic("我叫阿黄"),
    importance: IMPORTANCE_EXPLICIT,
    vector: localEmbed("我叫阿黄"),
    now,
  });
  // 「你就是我」这种只对一位成立的话，也只能落在那一位名下
  rememberSync(db, {
    agentId: AGENT,
    userId: JIA,
    fact: "甲：你就是我",
    importance: IMPORTANCE_EXPLICIT,
    vector: localEmbed("你就是我"),
    now,
  });

  const query = "我叫什么名字";
  const jia = searchMemorySync(db, {
    agentId: AGENT,
    userId: JIA,
    query,
    queryVector: localEmbed(query),
    now,
  });
  assert.ok(jia.some((hit) => hit.fact.includes("阿黄")), "本人查得到阿黄");

  const yi = searchMemorySync(db, {
    agentId: AGENT,
    userId: YI,
    query,
    queryVector: localEmbed(query),
    now,
  });
  assert.strictEqual(yi.length, 0, "用户乙查不到任何东西");
  assert.ok(!yi.some((hit) => hit.fact.includes("阿黄")));
  assert.ok(
    !loadActiveMemoriesSync(db, AGENT, YI).some((row) =>
      claimsSelfIdentity(row.fact),
    ),
    "「你就是我」没有变成跨用户共享记忆",
  );

  // 分不清对面是谁：既不读也不写
  assert.deepStrictEqual(
    searchMemorySync(db, { agentId: AGENT, userId: 0, query, now }),
    [],
  );
  const blind = rememberSync(db, {
    agentId: AGENT,
    userId: 0,
    fact: "不知道是谁说的：我叫阿黄",
    now,
  });
  assert.strictEqual(blind.saved, false);
  assert.strictEqual(loadAllMemoriesSync(db, AGENT, 0).length, 0);
  ok("私聊记忆按网站用户隔离，身份不明时不碰记忆");
}

/** 2. 显式「记住」立刻落库；闲聊不落库；一轮最多一条 */
async function testWritePolicy() {
  const db = await freshDb();
  const now = new Date("2026-10-07T02:00:00Z");

  assert.strictEqual(detectExplicitRemember("记住我叫阿黄").explicit, true);
  assert.strictEqual(detectExplicitRemember("记住我叫阿黄").fact, "我叫阿黄");
  assert.strictEqual(detectExplicitRemember("请记住我住1408房").explicit, true);
  assert.strictEqual(detectExplicitRemember("别忘了我对花生过敏").explicit, true);
  assert.strictEqual(detectExplicitRemember("今晚去深渊吗").explicit, false);

  const explicit = planTurnMemory({ userText: "记住我叫阿黄", userName: "甲" });
  assert.ok(explicit);
  assert.strictEqual(explicit!.explicit, true);
  assert.strictEqual(explicit!.importance, IMPORTANCE_EXPLICIT);
  assert.ok(explicit!.fact.includes("阿黄"));
  assert.ok(
    explicit!.importance > classifyImportance("今晚吃面条", false),
    "点名记住的重要性高于日常闲聊",
  );

  // 没有事实的话一条都不写
  for (const filler of ["哈哈", "哈哈哈哈哈", "666", "好的", "嗯嗯"]) {
    assert.strictEqual(planTurnMemory({ userText: filler }), null, filler);
    assert.strictEqual(hasFactContent(filler), false, filler);
  }
  // 分身自己的回复不参与：策略只看用户原话
  assert.strictEqual(planTurnMemory({ userText: "哈哈", userName: "甲" }), null);
  assert.strictEqual(loadAllMemoriesSync(db, AGENT, JIA).length, 0);

  // 一轮结束最多一条：一句里讲三件事也只抽一条
  const multi = extractTurnMemory({
    userText: "我叫阿黄，我住1408房，我生日是7月10号",
    userName: "甲",
  });
  assert.ok(multi);
  rememberSync(db, {
    agentId: AGENT,
    userId: JIA,
    fact: multi!.fact,
    topic: multi!.topic,
    importance: multi!.importance,
    vector: localEmbed(multi!.fact),
    now,
  });
  assert.strictEqual(loadAllMemoriesSync(db, AGENT, JIA).length, 1);
  ok("点名记住才立刻落库，没有事实就一条都不写，一轮最多一条");
}

/** 3. 冲突是更新：旧事实被取代，不并存 */
async function testConflictReplaces() {
  const db = await freshDb();
  const t1 = new Date("2026-09-01T02:00:00Z");
  const t2 = new Date("2026-10-07T02:00:00Z");

  const first = rememberSync(db, {
    agentId: AGENT,
    userId: JIA,
    fact: "甲：我叫阿黄",
    topic: memoryTopic("我叫阿黄"),
    importance: IMPORTANCE_EXPLICIT,
    vector: localEmbed("我叫阿黄"),
    now: t1,
  });
  const second = rememberSync(db, {
    agentId: AGENT,
    userId: JIA,
    fact: "甲：我改名叫阿白",
    topic: memoryTopic("我改名叫阿白"),
    importance: IMPORTANCE_EXPLICIT,
    vector: localEmbed("我改名叫阿白"),
    now: t2,
  });
  assert.strictEqual(memoryTopic("我叫阿黄"), memoryTopic("我改名叫阿白"));
  assert.deepStrictEqual(second.replaced, [first.id], "旧行被这条取代");

  const rows = loadAllMemoriesSync(db, AGENT, JIA);
  const old = rows.find((row) => row.id === first.id)!;
  assert.strictEqual(old.supersededBy, second.id, "旧行标记被取代");
  assert.strictEqual(old.superseded, true);
  assert.strictEqual(old.updatedAt, sqlNow(t2), "旧行时间戳更新");

  const hits = searchMemorySync(db, {
    agentId: AGENT,
    userId: JIA,
    query: "我叫什么名字",
    queryVector: localEmbed("我叫什么名字"),
    now: t2,
  });
  assert.ok(hits.some((hit) => hit.fact.includes("阿白")));
  assert.ok(!hits.some((hit) => hit.fact.includes("阿黄")), "检索里只剩阿白");
  assert.strictEqual(
    loadActiveMemoriesSync(db, AGENT, JIA).filter(
      (row) => row.topic === "称呼",
    ).length,
    1,
    "同一主题不会两条同时有效",
  );
  ok("改名就是覆盖：旧事实被取代，不再被检索");
}

/** 4. 检索分数四项都参与，且是纯函数 */
async function testScoring() {
  const base = {
    similarity: 0.5,
    keywordBoost: 1.4,
    ageDays: 3,
    importance: 0.6,
  };
  assert.strictEqual(memoryScore(base), memoryScore({ ...base }));
  assert.ok(memoryScore({ ...base, similarity: 0.9 }) > memoryScore(base));
  assert.ok(memoryScore({ ...base, keywordBoost: 2.4 }) > memoryScore(base));
  assert.ok(memoryScore({ ...base, ageDays: 300 }) < memoryScore(base));
  assert.ok(memoryScore({ ...base, importance: 1 }) > memoryScore(base));
  assert.ok(timeDecay(1) > timeDecay(100));
  assert.ok(keywordBoost("阿黄是谁", "甲：我叫阿黄") > keywordBoost("阿黄是谁", "今天天气不错"));

  const now = new Date("2026-10-07T02:00:00Z");
  const query = "阿黄是谁";
  const queryVector = localEmbed(query);
  const name = item({
    id: 1,
    fact: "甲：我叫阿黄",
    topic: "称呼",
    importance: IMPORTANCE_EXPLICIT,
    updatedAt: "2026-10-06 00:00:00",
    // 故意给一条相似度很低的向量
    vector: localEmbed("明天中午吃什么比较好"),
  });
  const smalltalk = item({
    id: 2,
    fact: "甲：今天也随便聊聊而已",
    topic: "原文:今天也随便聊聊而已",
    importance: IMPORTANCE_CHAT,
    updatedAt: "2026-10-06 12:00:00",
    // 和问题一模一样的向量，相似度满分
    vector: queryVector,
  });
  const ranked = rankMemories({
    query,
    items: [name, smalltalk],
    now,
    queryVector,
  });
  assert.strictEqual(ranked[0].id, 1, "专有名词压过更相似的闲聊");
  assert.ok(ranked[0].similarity < ranked[1].similarity);

  // 同等相似度和重要性时，更新的排前面
  const sameVector = localEmbed("我住在1408房");
  const tie = rankMemories({
    query: "1408",
    items: [
      item({ id: 11, fact: "甲：我住1408房", topic: "房间", importance: 0.6, updatedAt: "2026-09-01 00:00:00", vector: sameVector }),
      item({ id: 12, fact: "甲：我住1408房", topic: "房间", importance: 0.6, updatedAt: "2026-10-05 00:00:00", vector: sameVector }),
    ],
    now,
    queryVector: sameVector,
  });
  assert.deepStrictEqual(tie.map((hit) => hit.id), [12, 11]);

  // 救命和点名记住的，高于日常闲聊
  const urgent = memoryScore({ similarity: 0.5, keywordBoost: 1, ageDays: 1, importance: IMPORTANCE_CRITICAL });
  const chatty = memoryScore({ similarity: 0.5, keywordBoost: 1, ageDays: 1, importance: IMPORTANCE_CHAT });
  assert.ok(urgent > chatty);
  assert.strictEqual(classifyImportance("我对花生过敏", false), IMPORTANCE_CRITICAL);

  // 向量失败时关键词那一路仍然能找回名字
  assert.strictEqual(await embedOrNull(["阿黄"], brokenEmbed), null);
  const noVector = rankMemories({
    query: "阿黄",
    items: [name, smalltalk],
    now,
    queryVector: null,
  });
  assert.strictEqual(noVector[0].id, 1);
  assert.strictEqual(noVector[0].similarity, 0);

  const db = await freshDb();
  rememberSync(db, {
    agentId: AGENT,
    userId: JIA,
    fact: "甲：我叫阿黄",
    topic: memoryTopic("我叫阿黄"),
    importance: IMPORTANCE_EXPLICIT,
    vector: null,
    now,
  });
  const keywordOnly = searchMemorySync(db, {
    agentId: AGENT,
    userId: JIA,
    query: "阿黄",
    queryVector: null,
    now,
  });
  assert.ok(keywordOnly.some((hit) => hit.fact.includes("阿黄")));
  ok("四项相乘的纯函数打分，向量挂了关键词仍然命中专有名词");
}

/** 5. 短期窗口超长压成长期摘要，摘要丢关键信息就拒绝压缩 */
async function testWindowCompression() {
  const db = await freshDb();
  const now = new Date("2026-10-07T02:00:00Z");
  const messages: WindowMessage[] = [
    { role: "user", content: "我住1408房，别告诉别人" },
    { role: "assistant", content: "行，记着了" },
    ...Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `第${i}句闲聊`,
    })),
  ];
  const plan = planWindowCompression(messages, 6);
  assert.strictEqual(plan.keep.length, 6);
  assert.strictEqual(plan.fold.length, messages.length - 6);
  const source = foldedText(plan.fold);
  const keys = keyConstraints(source);
  assert.ok(keys.includes("1408"));
  assert.ok(keys.includes("别告诉别人"));
  assert.strictEqual(acceptSummary(source, "就是聊了聊住处").ok, false);
  assert.ok(acceptSummary(source, "就是聊了聊住处").missing.includes("1408"));
  assert.strictEqual(
    acceptSummary(source, "对面住1408房，交代过别告诉别人").ok,
    true,
  );

  const refused = await compressDmWindow({
    db,
    agentId: AGENT,
    userId: JIA,
    messages,
    maxMessages: 6,
    summarize: async () => "就是聊了聊住处和一些日常",
    embed: fakeEmbed,
    now,
  });
  assert.strictEqual(refused.refused, true);
  assert.strictEqual(refused.summary, null);
  assert.strictEqual(
    refused.window.length,
    messages.length,
    "拒绝压缩时旧对话留在窗口里",
  );
  assert.strictEqual(
    loadActiveMemoriesSync(db, AGENT, JIA).filter((row) => row.kind === "summary")
      .length,
    0,
  );

  const accepted = await compressDmWindow({
    db,
    agentId: AGENT,
    userId: JIA,
    messages,
    maxMessages: 6,
    summarize: async () => "对面住1408房，并交代过别告诉别人，其余是闲聊",
    embed: fakeEmbed,
    now,
  });
  assert.strictEqual(accepted.refused, false);
  assert.strictEqual(accepted.window.length, 6);
  const summaries = loadActiveMemoriesSync(db, AGENT, JIA).filter(
    (row) => row.kind === "summary",
  );
  assert.strictEqual(summaries.length, 1);
  assert.ok(summaries[0].fact.includes("1408"));
  assert.ok(summaries[0].fact.includes("别告诉别人"));
  ok("超窗口压成长期摘要，丢了房间号或保密约定就不压");
}

/** 5b. 同一会话连续两轮超窗口：已折进摘要的消息不再重复摘要，会话摘要始终只有一条 */
async function testWindowWatermark() {
  const db = await freshDb();
  const now = new Date("2026-10-07T02:00:00Z");
  const SESSION = 55;
  const WINDOW = 6;
  // 每条消息带库内 id；前几条是会被折掉的旧话，用不含数字的字母标记方便断言
  const marks = "甲乙丙丁戊己庚辛壬癸子丑";
  const all = Array.from({ length: 12 }, (_, i) => ({
    id: 100 + i,
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content:
      i === 0
        ? "我住1408房，别告诉别人 旧话甲"
        : i === 4
          ? "开黑定在2030 旧话戊"
          : `旧话${marks[i]}`,
  }));

  const inputs: string[] = [];
  const wordings = [
    "对面住1408房，交代过别告诉别人",
    "住1408房，保密约定别告诉别人，另约了2030开黑",
  ];
  const summarize = async (text: string) => {
    inputs.push(text);
    return wordings[inputs.length - 1] ?? wordings[wordings.length - 1];
  };
  const scope = { sessionId: SESSION, userId: JIA, agentId: AGENT };

  // 第一轮：10 条历史，折出最早 4 条（甲乙丙丁）
  const first = await compressDmWindow({
    db,
    agentId: AGENT,
    userId: JIA,
    sessionId: SESSION,
    messages: all.slice(0, 10),
    maxMessages: WINDOW,
    summarize,
    embed: fakeEmbed,
    now,
  });
  assert.strictEqual(first.refused, false);
  assert.strictEqual(first.window.length, WINDOW);
  assert.strictEqual(getCompressedUptoSync(db, scope), 103, "水位压到第 4 条");

  // 第二轮：历史又长了两条（调用方仍把整段历史带进来），再次超出窗口
  const second = await compressDmWindow({
    db,
    agentId: AGENT,
    userId: JIA,
    sessionId: SESSION,
    messages: all,
    maxMessages: WINDOW,
    summarize,
    embed: fakeEmbed,
    now,
  });
  assert.strictEqual(second.refused, false);
  assert.strictEqual(inputs.length, 2);
  // 第二次摘要的「新增对话」只能是水位之后折出去的那两条（戊己），不得再含甲乙丙丁
  const fresh = inputs[1].split("新增对话：")[1] || "";
  for (const mark of ["旧话甲", "旧话乙", "旧话丙", "旧话丁"]) {
    assert.ok(!fresh.includes(mark), `不得再摘要已折进摘要的 ${mark}`);
  }
  assert.ok(fresh.includes("旧话戊") && fresh.includes("旧话己"));
  assert.deepStrictEqual(
    second.window.map((msg) => msg.id),
    all.slice(6).map((msg) => msg.id),
    "旧内容真正离开窗口，只剩水位之后的消息",
  );
  assert.strictEqual(getCompressedUptoSync(db, scope), 105);

  // 摘要措辞变了也是就地更新，有效的会话摘要只有一条，库里也没叠出第二条摘要行
  const active = loadActiveMemoriesSync(db, AGENT, JIA).filter(
    (row) => row.kind === "summary",
  );
  assert.strictEqual(active.length, 1);
  assert.strictEqual(active[0].fact, wordings[1]);
  assert.strictEqual(
    loadAllMemoriesSync(db, AGENT, JIA).filter((row) => row.kind === "summary")
      .length,
    1,
  );

  // 水位之内没有新的超窗口内容时不再调摘要
  const third = await compressDmWindow({
    db,
    agentId: AGENT,
    userId: JIA,
    sessionId: SESSION,
    messages: all,
    maxMessages: WINDOW,
    summarize,
    embed: fakeEmbed,
    now,
  });
  assert.strictEqual(inputs.length, 2, "窗口没超就不再摘要");
  assert.strictEqual(third.window.length, WINDOW);

  // 摘要丢了数字被拒绝时水位不动，没折进去的消息继续留在窗口里
  const moreMsgs = [
    ...all,
    { id: 112, role: "user" as const, content: "改到2145见面" },
    { id: 113, role: "assistant" as const, content: "好的" },
  ];
  const refused = await compressDmWindow({
    db,
    agentId: AGENT,
    userId: JIA,
    sessionId: SESSION,
    messages: moreMsgs,
    maxMessages: WINDOW,
    summarize: async () => "只是聊了些日常",
    embed: fakeEmbed,
    now,
  });
  assert.strictEqual(refused.refused, true);
  assert.strictEqual(getCompressedUptoSync(db, scope), 105);
  assert.strictEqual(refused.window.length, moreMsgs.length - 6);
  assert.strictEqual(
    loadActiveMemoriesSync(db, AGENT, JIA).find((row) => row.kind === "summary")
      ?.fact,
    wordings[1],
    "被拒绝时已有摘要原样不动",
  );

  // 别的用户读不到这个会话的水位和摘要
  assert.strictEqual(
    getCompressedUptoSync(db, { sessionId: SESSION, userId: YI, agentId: AGENT }),
    0,
  );
  assert.strictEqual(
    loadActiveMemoriesSync(db, AGENT, YI).filter((row) => row.kind === "summary")
      .length,
    0,
  );
  ok("同一会话连续两轮超窗口：不重复摘要旧段，会话摘要就地更新只有一条");
}

/** 6. 降权、取代、淘汰 */
async function testDecayAndPrune() {
  const db = await freshDb();
  const now = new Date("2026-10-07T02:00:00Z");
  const longAgo = new Date("2026-07-09T02:00:00Z");

  rememberSync(db, {
    agentId: AGENT,
    userId: JIA,
    fact: "甲：我昨天随口说喜欢喝冰美式",
    topic: "原文:我昨天随口说喜欢喝冰美式",
    importance: IMPORTANCE_CHAT,
    vector: localEmbed("我昨天随口说喜欢喝冰美式"),
    now: longAgo,
  });
  const before = loadActiveMemoriesSync(db, AGENT, JIA)[0];
  const changed = decayUnusedSync(db, { agentId: AGENT, userId: JIA, now });
  assert.strictEqual(changed, 1);
  const after = loadActiveMemoriesSync(db, AGENT, JIA)[0];
  assert.ok(after.importance < before.importance, "长期不被检索的降权");

  const stale = searchMemorySync(db, {
    agentId: AGENT,
    userId: JIA,
    query: "今晚几点开黑",
    queryVector: null,
    now,
  });
  assert.strictEqual(stale.length, 0, "低到门槛以下的淘汰出检索结果");
  assert.ok(
    memoryScore({
      similarity: 0,
      keywordBoost: 1,
      ageDays: 90,
      importance: after.importance,
    }) < MEMORY_SCORE_FLOOR,
  );

  // 被新事实取代的不再被检索
  rememberSync(db, {
    agentId: AGENT,
    userId: JIA,
    fact: "甲：我叫阿黄",
    topic: memoryTopic("我叫阿黄"),
    importance: IMPORTANCE_EXPLICIT,
    vector: localEmbed("我叫阿黄"),
    now,
  });
  rememberSync(db, {
    agentId: AGENT,
    userId: JIA,
    fact: "甲：我改名叫阿白",
    topic: memoryTopic("我改名叫阿白"),
    importance: IMPORTANCE_EXPLICIT,
    vector: localEmbed("我改名叫阿白"),
    now,
  });
  const live = searchMemorySync(db, {
    agentId: AGENT,
    userId: JIA,
    query: "阿黄",
    queryVector: null,
    now,
  });
  assert.ok(!live.some((hit) => hit.fact.includes("阿黄")));

  // 空闲归并去重：同一句话两条，只留最新的一条
  const dupDb = await freshDb();
  for (const stamp of ["2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z"]) {
    dupDb.run(
      `INSERT INTO agent_user_memory
         (agent_id, user_id, topic, fact, kind, importance, hit_count,
          vector_json, superseded_by, last_hit_at, created_at, updated_at)
       VALUES (?, ?, '房间', '甲：我住1408房', 'fact', 0.6, 0, '', NULL, NULL, ?, ?)`,
      [AGENT, JIA, sqlNow(new Date(stamp)), sqlNow(new Date(stamp))],
    );
  }
  assert.strictEqual(loadActiveMemoriesSync(dupDb, AGENT, JIA).length, 2);
  const merged = mergeDuplicatesSync(dupDb, {
    agentId: AGENT,
    userId: JIA,
    now,
  });
  assert.strictEqual(merged, 1);
  const kept = loadActiveMemoriesSync(dupDb, AGENT, JIA);
  assert.strictEqual(kept.length, 1);
  assert.strictEqual(kept[0].createdAt, sqlNow(new Date("2026-10-02T00:00:00Z")));
  const maintained = runIdleMaintenanceSync(dupDb, {
    agentId: AGENT,
    userId: JIA,
    now,
  });
  assert.strictEqual(maintained.merged, 0, "再跑一次没有新的可合并");
  ok("不被检索的降权、被取代的不再出现、低分的淘汰、重复的归并");
}

/** 7. 工作记忆只属于当前用户的当前一轮 */
async function testWorkingMemory() {
  const db = await freshDb();
  const now = new Date("2026-10-07T02:00:00Z");
  const turnId = "turn-work-1";
  noteWorkingSync(db, {
    turnId,
    agentId: AGENT,
    userId: JIA,
    step: 1,
    tool: "search_memory",
    note: "查过 房间 → 命中 1408",
    now,
  });
  noteWorkingSync(db, {
    turnId,
    agentId: AGENT,
    userId: JIA,
    step: 2,
    tool: "working_note",
    note: "准备直接回房间号",
    now,
  });
  const notes = listWorkingNotesSync(db, { turnId, userId: JIA });
  assert.strictEqual(notes.length, 2);
  assert.strictEqual(notes[0].step, 1);
  assert.strictEqual(notes[0].tool, "search_memory");
  assert.ok(notes[0].note.includes("1408"));
  assert.strictEqual(notes[1].step, 2);
  assert.deepStrictEqual(
    listWorkingNotesSync(db, { turnId, userId: YI }),
    [],
    "别的用户读不到",
  );
  assert.deepStrictEqual(
    listWorkingNotesSync(db, { turnId: "turn-work-2", userId: JIA }),
    [],
    "别的轮读不到",
  );
  runIdleMaintenanceSync(db, {
    agentId: AGENT,
    userId: JIA,
    keepTurnId: "turn-work-2",
    now,
  });
  assert.deepStrictEqual(listWorkingNotesSync(db, { turnId, userId: JIA }), []);
  ok("工作记忆记下第几步用了哪个工具，别人和别轮都读不到");
}

/** 8. 工具回路：多步、结果回灌、写在回复前、步数有上限、注册表干净 */
async function testToolLoop() {
  const tools = assertSafeRegistry(buildToolRegistry());
  assert.deepStrictEqual(
    tools.map((tool) => tool.name).sort(),
    [...AGENT_TOOL_NAMES].sort(),
  );
  for (const bad of FORBIDDEN_TOOL_NAMES) {
    assert.strictEqual(findTool(tools, bad), null, bad);
  }
  assert.throws(() =>
    assertSafeRegistry([
      ...tools,
      {
        name: "shell",
        description: "跑命令",
        parameters: {},
        run: async () => "",
      },
    ]),
  );

  const db = await freshDb();
  const now = new Date("2026-10-07T02:00:00Z");
  const turnId = "turn-loop-1";
  rememberSync(db, {
    agentId: AGENT,
    userId: JIA,
    fact: "甲：我住1408房",
    topic: memoryTopic("我住1408房"),
    importance: IMPORTANCE_EXPLICIT,
    vector: localEmbed("我住1408房"),
    now,
  });
  const ports = buildTurnPorts({
    db,
    agentId: AGENT,
    agentQq: AGENT_QQ,
    userId: JIA,
    turnId,
    identified: true,
    embed: fakeEmbed,
    groupLines: async () => ["今晚深渊还缺一个输出"],
    now,
  });

  // 第一次只发起 search_memory，第二次根据工具结果说出其中的词
  let round = 0;
  const twoStep: StepFn = async (messages, specs) => {
    round++;
    if (round === 1) {
      assert.ok(specs.some((spec) => spec.name === "search_memory"));
      assert.ok(!specs.some((spec) => spec.name === "shell"));
      return {
        content: "",
        toolCalls: [
          {
            id: "c1",
            name: "search_memory",
            arguments: JSON.stringify({ query: "房间" }),
          },
        ],
      };
    }
    const last = messages[messages.length - 1];
    assert.strictEqual(last.role, "tool", "工具结果回到同一轮");
    assert.strictEqual(last.toolCallId, "c1");
    const room = last.content.includes("1408") ? "1408" : "没查到";
    return { content: `你住${room}房`, toolCalls: [] };
  };
  const out = await runToolLoop({
    messages: [
      { role: "system", content: "测试用系统提示" },
      { role: "user", content: "我住哪间来着" },
    ],
    tools,
    ports,
    identified: true,
    step: twoStep,
    onCall(record) {
      noteWorkingSync(db, {
        turnId,
        agentId: AGENT,
        userId: JIA,
        step: record.step,
        tool: record.tool,
        note: `查过 ${record.args} → ${record.result.slice(0, 60)}`,
        now,
      });
    },
  });
  assert.strictEqual(out.steps, 2);
  assert.strictEqual(out.hitCap, false);
  assert.ok(out.reply.includes("1408"), "说出了工具结果里的词");
  assert.strictEqual(out.calls.length, 1);
  assert.strictEqual(out.calls[0].tool, "search_memory");
  assert.strictEqual(out.calls[0].step, 1);
  const trace = listWorkingNotesSync(db, { turnId, userId: JIA });
  assert.ok(trace.some((note) => note.tool === "search_memory" && note.step === 1));

  // remember 在回复发出前已经落库
  let wrote = false;
  const writer: StepFn = async () => {
    if (!wrote) {
      wrote = true;
      return {
        content: "",
        toolCalls: [
          {
            id: "r1",
            name: "remember",
            arguments: JSON.stringify({
              fact: "甲：我改名叫阿白",
              topic: "称呼",
              important: true,
            }),
          },
        ],
      };
    }
    // 走到这一步说明工具已经执行完，库里必须已经有这条
    assert.ok(
      loadActiveMemoriesSync(db, AGENT, JIA).some((row) =>
        row.fact.includes("阿白"),
      ),
      "remember 在回复发出前已经落库",
    );
    return { content: "行，以后叫你阿白", toolCalls: [] };
  };
  const written = await runToolLoop({
    messages: [{ role: "user", content: "记住我改名叫阿白" }],
    tools,
    ports,
    identified: true,
    step: writer,
  });
  assert.strictEqual(written.reply, "行，以后叫你阿白");
  assert.ok(
    loadActiveMemoriesSync(db, AGENT, JIA).some((row) =>
      row.fact.includes("阿白"),
    ),
  );

  // 身份没确认时，工具自己拦掉记忆读写
  const blindPorts = buildTurnPorts({
    db,
    agentId: AGENT,
    agentQq: AGENT_QQ,
    userId: 0,
    turnId: "turn-blind",
    identified: false,
    embed: fakeEmbed,
    groupLines: async () => [],
    now,
  });
  const blind = await runToolLoop({
    messages: [{ role: "user", content: "我叫什么" }],
    tools,
    ports: blindPorts,
    identified: false,
    step: async (messages) => {
      const last = messages[messages.length - 1];
      if (last.role === "tool") {
        assert.ok(last.content.includes("不读私聊记忆"));
        return { content: "这我没在群里确认过。", toolCalls: [] };
      }
      return {
        content: "",
        toolCalls: [
          {
            id: "b1",
            name: "search_memory",
            arguments: JSON.stringify({ query: "我叫什么" }),
          },
        ],
      };
    },
  });
  assert.strictEqual(blind.reply, "这我没在群里确认过。");

  // 步数有上限：到顶时不把带工具调用的内容发给用户
  const greedy: StepFn = async () => ({
    content: "我还想再查一次",
    toolCalls: [
      {
        id: "g1",
        name: "working_note",
        arguments: JSON.stringify({ note: "还得再查" }),
      },
    ],
  });
  const capped = await runToolLoop({
    messages: [{ role: "user", content: "说点什么" }],
    tools,
    ports,
    identified: true,
    step: greedy,
    maxSteps: 3,
  });
  assert.strictEqual(capped.steps, 3);
  assert.strictEqual(capped.hitCap, true);
  assert.strictEqual(capped.reply, TURN_CAP_REPLY);
  assert.ok(!capped.reply.includes("我还想再查一次"));
  assert.strictEqual(capped.calls.length, 3);
  assert.ok(MAX_TURN_STEPS >= 2 && MAX_TURN_STEPS <= 12);

  // 没注册的工具只会拿到一句拒绝，不会被执行
  const sneaky = await runToolLoop({
    messages: [{ role: "user", content: "跑个命令" }],
    tools,
    ports,
    identified: true,
    step: async (messages) => {
      const last = messages[messages.length - 1];
      if (last.role === "tool") {
        assert.ok(last.content.includes("没有注册这个工具"));
        return { content: "这事我干不了。", toolCalls: [] };
      }
      return {
        content: "",
        toolCalls: [
          { id: "s1", name: "shell", arguments: JSON.stringify({ cmd: "ls" }) },
        ],
      };
    },
  });
  assert.strictEqual(sneaky.reply, "这事我干不了。");
  assert.strictEqual(sneaky.calls[0].ok, false);

  // 本轮工作记忆要进入后续步骤：第一步写笔记并再要一步，第二步收到的消息里必须有这条笔记
  const workTurn = "turn-loop-work";
  const workPorts = buildTurnPorts({
    db,
    agentId: AGENT,
    agentQq: AGENT_QQ,
    userId: JIA,
    turnId: workTurn,
    identified: true,
    embed: fakeEmbed,
    groupLines: async () => [],
    now,
  });
  const marker = "先确认房号再回答";
  const seen: string[][] = [];
  let workRound = 0;
  const workModel: StepFn = async (messages) => {
    workRound++;
    seen.push(messages.map((msg) => msg.content));
    if (workRound === 1) {
      return {
        content: "",
        toolCalls: [
          {
            id: "w1",
            name: "working_note",
            arguments: JSON.stringify({ note: marker }),
          },
        ],
      };
    }
    return { content: "好", toolCalls: [] };
  };
  const worked = await runToolLoop({
    messages: [
      { role: "system", content: "测试用系统提示" },
      { role: "user", content: "我住哪间来着" },
    ],
    tools,
    ports: workPorts,
    identified: true,
    step: workModel,
    workingContext: () =>
      formatWorkingBlock(
        listWorkingNotesSync(db, { turnId: workTurn, userId: JIA }),
      ),
  });
  assert.strictEqual(worked.steps, 2);
  assert.ok(
    !seen[0].some((text) => text.includes(marker)),
    "第一步时本轮还没有笔记",
  );
  const second = seen[1].join("\n");
  assert.ok(second.includes(marker), "第二步的消息里看得到本轮工作笔记");
  assert.ok(second.includes("working_note"), "第二步看得到调用了哪个工具");
  assert.ok(/第 2 步/.test(second), "第二步看得到走到第几步");
  assert.strictEqual(
    seen[1].filter((text) => text.includes("本轮进度")).length,
    1,
    "进度只留一份",
  );
  ok("一轮多步、结果回灌、写在回复前落库、步数有上限、注册表没有执行类工具");
}

/**
 * 8b. 打到真正的私聊入口 runMemberTurnDetailed（不是只测回路骨架）：
 * - 假模型第一步调 search_memory，第二步收到的消息里必须有这条调用记录（本轮工作笔记）；
 * - 用户话里带「记住」时，回复返回前长期记忆里已经有这一条，且只有一条。
 * 注入内存库和假模型，不联网、不碰 data/app.db。
 */
async function testPrivateEntry() {
  const now = new Date("2026-10-07T02:00:00Z");
  const agent = {
    id: AGENT,
    qq: AGENT_QQ,
    display_name: "厂夏",
    system_prompt: "这是人设",
  };

  // 一、工作笔记要从入口送进下一步
  {
    const db = await freshDb();
    rememberSync(db, {
      agentId: AGENT,
      userId: JIA,
      fact: "甲：我住1408房",
      topic: memoryTopic("我住1408房"),
      importance: IMPORTANCE_EXPLICIT,
      vector: localEmbed("我住1408房"),
      now,
    });
    const seen: ChatMessage[][] = [];
    const queryArgs = JSON.stringify({ query: "房间" });
    const model: StepFn = async (messages) => {
      seen.push(messages.map((msg) => ({ ...msg })));
      if (seen.length === 1) {
        return {
          content: "",
          toolCalls: [{ id: "e1", name: "search_memory", arguments: queryArgs }],
        };
      }
      return { content: "你住1408房", toolCalls: [] };
    };
    const result = await runMemberTurnDetailed({
      agent,
      userId: JIA,
      userName: "甲",
      userQq: "20001",
      userAliases: ["甲"],
      userText: "我住哪间来着",
      history: [],
      deps: { db, step: model, embed: fakeEmbed, now },
    });
    assert.strictEqual(result.steps, 2);
    assert.strictEqual(result.reply, "你住1408房");
    assert.strictEqual(seen.length, 2);
    assert.ok(
      !seen[0].some((msg) => msg.content.includes("本轮工作记忆")),
      "第一步时本轮还没有工作笔记",
    );
    const second = seen[1].map((msg) => msg.content).join("\n");
    assert.ok(second.includes("本轮工作记忆"), "第二步的消息里有本轮工作记忆块");
    assert.ok(
      second.includes(`第 1 步·search_memory：查过 ${queryArgs}`),
      "第二步的消息里有第一步 search_memory 的调用记录",
    );
    assert.ok(second.includes("1408"), "记录里带着查到的结果");
    // 工作笔记确实写进了库，而不只是拼在消息里
    assert.ok(
      listWorkingNotesSync(db, { turnId: result.turnId, userId: JIA }).some(
        (note) => note.tool === "search_memory" && note.step === 1,
      ),
    );
  }

  // 二、用户说「记住」：回复返回前长期记忆里已经有，且只有一条
  {
    const db = await freshDb();
    const snapshots: number[] = [];
    let calls = 0;
    const model: StepFn = async () => {
      calls++;
      // 模型还没出声时，库里就得有了：这是模型第一次被调用时看到的库
      snapshots.push(
        loadActiveMemoriesSync(db, AGENT, JIA).filter((row) =>
          row.fact.includes("阿黄"),
        ).length,
      );
      return { content: "行，记着了", toolCalls: [] };
    };
    const result = await runMemberTurnDetailed({
      agent,
      userId: JIA,
      userName: "甲",
      userQq: "20001",
      userAliases: ["甲"],
      userText: "记住我叫阿黄",
      history: [],
      deps: { db, step: model, embed: fakeEmbed, now },
    });
    assert.strictEqual(calls, 1);
    assert.strictEqual(result.reply, "行，记着了");
    assert.deepStrictEqual(snapshots, [1], "模型出声前库里已经有这一条");
    const rows = loadAllMemoriesSync(db, AGENT, JIA).filter(
      (row) => row.kind !== "summary",
    );
    assert.strictEqual(rows.length, 1, "整轮下来长期记忆只有一条");
    assert.ok(rows[0].fact.includes("阿黄"));
    assert.strictEqual(result.written, 1);

    // 别的用户名下什么都没有
    assert.strictEqual(loadAllMemoriesSync(db, AGENT, YI).length, 0);
  }

  // 三、模型自己又调了 remember 写同一句：有效记忆仍然只有一条
  {
    const db = await freshDb();
    let round = 0;
    const model: StepFn = async () => {
      round++;
      if (round === 1) {
        return {
          content: "",
          toolCalls: [
            {
              id: "e2",
              name: "remember",
              arguments: JSON.stringify({
                fact: "甲：我叫阿黄",
                topic: memoryTopic("我叫阿黄"),
              }),
            },
          ],
        };
      }
      return { content: "记下了", toolCalls: [] };
    };
    await runMemberTurnDetailed({
      agent,
      userId: JIA,
      userName: "甲",
      userQq: "20001",
      userAliases: ["甲"],
      userText: "记住我叫阿黄",
      history: [],
      deps: { db, step: model, embed: fakeEmbed, now },
    });
    assert.strictEqual(
      loadActiveMemoriesSync(db, AGENT, JIA).filter((row) =>
        row.fact.includes("阿黄"),
      ).length,
      1,
      "入口先落库、模型再写同一句，有效记忆仍只有一条",
    );
  }
  ok("私聊入口：工作笔记送进第二步，「记住」在回复前落库且只有一条");
}

/**
 * 8c. 私聊入口 runMemberTurnDetailed + sessionId：连续两轮超窗口压缩。
 * 断言模型看到的对话窗口（不含 system）里最早一段已离开；第二轮不再摘要已折进摘要的旧段；
 * 摘要丢 1408 时水位不动、旧话仍留在窗口里。
 */
async function testPrivateEntrySessionWindow() {
  const db = await freshDb();
  const now = new Date("2026-10-07T02:00:00Z");
  const agent = {
    id: AGENT,
    qq: AGENT_QQ,
    display_name: "厂夏",
    system_prompt: "这是人设",
  };
  const SESSION = 88;
  const WINDOW = 6;
  const scope = { sessionId: SESSION, userId: JIA, agentId: AGENT };
  const marks = "甲乙丙丁戊己庚辛壬癸子丑";
  const seed = Array.from({ length: 12 }, (_, i) => ({
    id: 200 + i,
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content:
      i === 0
        ? "我住1408房，别告诉别人 旧话甲"
        : i === 4
          ? "开黑定在2030 旧话戊"
          : `旧话${marks[i]}`,
  }));

  const summarizeInputs: string[] = [];
  const wordings = [
    "对面住1408房，交代过别告诉别人",
    "住1408房，保密约定别告诉别人，另约了2030开黑",
  ];
  const summarize = async (text: string) => {
    summarizeInputs.push(text);
    return wordings[summarizeInputs.length - 1] ?? wordings[wordings.length - 1];
  };

  /** 模型实际看到的 user/assistant 正文（不含 system 里的摘要说明） */
  const chatBodies = (messages: ChatMessage[]) =>
    messages
      .filter((msg) => msg.role === "user" || msg.role === "assistant")
      .map((msg) => msg.content);

  const baseDeps = {
    db,
    embed: fakeEmbed,
    summarize,
    windowSize: WINDOW,
    now,
  };

  // 第一轮：10 条带 id 的历史，窗口只能留 6 条
  let modelSeen: ChatMessage[][] = [];
  const model1: StepFn = async (messages) => {
    modelSeen.push(messages.map((msg) => ({ ...msg })));
    return { content: "行，继续", toolCalls: [] };
  };
  const turn1 = await runMemberTurnDetailed({
    agent,
    userId: JIA,
    userName: "甲",
    userQq: "20001",
    userAliases: ["甲"],
    userText: "接着聊一句",
    history: seed.slice(0, 10),
    sessionId: SESSION,
    deps: { ...baseDeps, step: model1 },
  });
  assert.strictEqual(turn1.reply, "行，继续");
  assert.strictEqual(turn1.written, 1, "压成摘要算这一轮写了一条长期记忆");
  assert.strictEqual(summarizeInputs.length, 1);
  assert.strictEqual(getCompressedUptoSync(db, scope), 203, "第一轮水位压到第 4 条");
  const round1Chat = chatBodies(modelSeen[0]);
  assert.ok(
    !round1Chat.some((text) => text.includes("旧话甲")),
    "返回给模型的窗口里，第一段旧话已离开",
  );
  assert.ok(round1Chat.length <= WINDOW + 1, "窗口里是压缩后的历史加本轮用户话");

  // 第二轮：历史变长（含上一轮问答），仍带 sessionId
  modelSeen = [];
  const history2 = [
    ...seed.slice(0, 10),
    { id: 210, role: "user" as const, content: "接着聊一句" },
    { id: 211, role: "assistant" as const, content: turn1.reply },
  ];
  const model2: StepFn = async (messages) => {
    modelSeen.push(messages.map((msg) => ({ ...msg })));
    return { content: "收到", toolCalls: [] };
  };
  await runMemberTurnDetailed({
    agent,
    userId: JIA,
    userName: "甲",
    userQq: "20001",
    userAliases: ["甲"],
    userText: "再来一句",
    history: history2,
    sessionId: SESSION,
    deps: { ...baseDeps, step: model2 },
  });
  assert.strictEqual(summarizeInputs.length, 2);
  const fresh = summarizeInputs[1].split("新增对话：")[1] || "";
  for (const mark of ["旧话甲", "旧话乙", "旧话丙", "旧话丁"]) {
    assert.ok(!fresh.includes(mark), `第二轮不得再摘要已折进的 ${mark}`);
  }
  assert.ok(fresh.includes("旧话戊") && fresh.includes("旧话己"));
  assert.strictEqual(getCompressedUptoSync(db, scope), 205);
  const round2Chat = chatBodies(modelSeen[0]);
  assert.ok(
    !round2Chat.some((text) => text.includes("旧话甲")),
    "第二轮模型窗口里最早一段仍不在",
  );
  assert.ok(
    !round2Chat.some((text) => text.includes("旧话乙")),
    "已出水位的旧话不会回到窗口",
  );

  const activeSummary = loadActiveMemoriesSync(db, AGENT, JIA).filter(
    (row) => row.kind === "summary",
  );
  assert.strictEqual(activeSummary.length, 1);
  assert.strictEqual(activeSummary[0].fact, wordings[1]);

  // 摘要丢掉 1408：水位不动，没折进去的消息继续留在模型窗口
  const watermarkBefore = getCompressedUptoSync(db, scope);
  const history3 = [
    ...history2,
    { id: 212, role: "user" as const, content: "再来一句" },
    { id: 213, role: "assistant" as const, content: "收到" },
    { id: 214, role: "user" as const, content: "改到2145见面" },
    { id: 215, role: "assistant" as const, content: "好的" },
  ];
  modelSeen = [];
  let refuseCalls = 0;
  const model3: StepFn = async (messages) => {
    modelSeen.push(messages.map((msg) => ({ ...msg })));
    return { content: "好", toolCalls: [] };
  };
  await runMemberTurnDetailed({
    agent,
    userId: JIA,
    userName: "甲",
    userQq: "20001",
    userAliases: ["甲"],
    userText: "确认一下时间",
    history: history3,
    sessionId: SESSION,
    deps: {
      ...baseDeps,
      step: model3,
      summarize: async (text) => {
        refuseCalls++;
        summarizeInputs.push(text);
        return "只是聊了些日常";
      },
    },
  });
  assert.strictEqual(refuseCalls, 1);
  assert.strictEqual(getCompressedUptoSync(db, scope), watermarkBefore, "拒绝时水位不前进");
  const round3Chat = chatBodies(modelSeen[0]);
  assert.ok(
    round3Chat.some((text) => text.includes("改到2145")),
    "拒绝压缩时新折段仍留在窗口",
  );
  assert.ok(
    modelSeen[0].some((msg) =>
      msg.role === "system" && msg.content.includes("没有压缩旧对话"),
    ),
    "system 里提示本轮未压缩",
  );
  assert.strictEqual(activeSummary[0].fact, wordings[1], "已有摘要不被坏摘要覆盖");

  ok("私聊入口 sessionId：两轮水位不重复摘要，丢 1408 则水位不动");
}

/* ---------- 私聊入口接线测试的公共小工具 ---------- */

const ENTRY_AGENT = {
  id: AGENT,
  qq: AGENT_QQ,
  display_name: "厂夏",
  system_prompt: "这是人设",
};

/** 经由真正的私聊入口跑一轮。默认对面是用户甲（QQ 和分身不同） */
function runEntry(opts: {
  db: Database;
  step: StepFn;
  text: string;
  userId?: number;
  userName?: string;
  userQq?: string | null;
  aliases?: string[];
  history?: { id?: number; role: string; content: string }[];
  now?: Date;
  embed?: EmbedPort;
  maxSteps?: number;
}) {
  return runMemberTurnDetailed({
    agent: ENTRY_AGENT,
    userId: opts.userId ?? JIA,
    userName: opts.userName ?? "甲",
    userQq: opts.userQq === undefined ? "20001" : opts.userQq,
    userAliases: opts.aliases ?? [opts.userName ?? "甲"],
    userText: opts.text,
    history: opts.history ?? [],
    deps: {
      db: opts.db,
      step: opts.step,
      embed: opts.embed ?? fakeEmbed,
      maxSteps: opts.maxSteps,
      now: opts.now ?? new Date("2026-10-07T02:00:00Z"),
    },
  });
}

/** 长期记忆表里一共有几行（含被取代的、含摘要） */
function countAllRows(db: Database): number {
  return Number(db.exec("SELECT COUNT(*) FROM agent_user_memory")[0].values[0][0]);
}

/** 只回一句话、不调工具的假模型 */
function replyOnly(text: string): StepFn {
  return async () => ({ content: text, toolCalls: [] });
}

function systemTextOf(messages: ChatMessage[]): string {
  return messages
    .filter((msg) => msg.role === "system")
    .map((msg) => msg.content)
    .join("\n");
}

/**
 * 8d. 把标准里没钉在入口上的行为一次钉完。每一块都是打到 runMemberTurnDetailed 的，
 * 删掉入口里对应那一段接线，这里必须变红。
 */
async function testPrivateEntryWiring() {
  const t0 = new Date("2026-10-07T02:00:00Z");

  // 一、没说「记住」但带事实：回复返回后才落库，且只有一条，模型说话时库里还没有
  {
    const db = await freshDb();
    const rowsAtCall: number[] = [];
    let call = 0;
    const model: StepFn = async () => {
      call++;
      rowsAtCall.push(countAllRows(db));
      if (call === 1) {
        return {
          content: "",
          toolCalls: [
            {
              id: "f1",
              name: "working_note",
              arguments: JSON.stringify({ note: "先看看" }),
            },
          ],
        };
      }
      return { content: "行，我知道你住2046了", toolCalls: [] };
    };
    const result = await runEntry({ db, step: model, text: "我住1408房" });
    assert.deepStrictEqual(rowsAtCall, [0, 0], "模型每一次说话时库里都还没有这条");
    const rows = loadAllMemoriesSync(db, AGENT, JIA).filter(
      (row) => row.kind !== "summary",
    );
    assert.strictEqual(rows.length, 1, "整轮下来只有一条");
    assert.ok(rows[0].fact.includes("1408"), "里面留着 1408");
    assert.ok(!rows[0].fact.includes("2046"), "分身自己的回复不落库");
    assert.ok(
      rows[0].importance < IMPORTANCE_EXPLICIT,
      "没点名记住，重要性低于点名记住",
    );
    assert.strictEqual(result.written, 1);
    assert.strictEqual(loadAllMemoriesSync(db, AGENT, YI).length, 0);
  }
  {
    const db = await freshDb();
    let seenRows = -1;
    const result = await runEntry({
      db,
      text: "我的生日是7月10号",
      step: async () => {
        seenRows = countAllRows(db);
        return { content: "哈哈好的", toolCalls: [] };
      },
    });
    assert.strictEqual(seenRows, 0, "模型说话时生日这条还没落库");
    const rows = loadAllMemoriesSync(db, AGENT, JIA);
    assert.strictEqual(rows.length, 1);
    assert.ok(rows[0].fact.includes("7月10号"));
    assert.strictEqual(result.written, 1);
  }

  // 二、只说「哈哈」之类：一条长期记忆都不写，即使分身的回复里带着事实
  {
    const db = await freshDb();
    for (const filler of ["哈哈", "哈哈哈哈哈", "666", "好的", "嗯嗯"]) {
      const result = await runEntry({
        db,
        text: filler,
        step: replyOnly("哈哈，那就2046见，我住1408房"),
      });
      assert.strictEqual(result.written, 0, filler);
    }
    assert.strictEqual(countAllRows(db), 0, "哈哈之类一行都不写，回复也不落库");

    // 库里已有记忆时，闲聊也不会新增、不会改动旧的
    rememberSync(db, {
      agentId: AGENT,
      userId: JIA,
      fact: "甲：我叫阿黄",
      topic: memoryTopic("我叫阿黄"),
      importance: IMPORTANCE_EXPLICIT,
      vector: localEmbed("我叫阿黄"),
      now: t0,
    });
    await runEntry({ db, text: "哈哈", step: replyOnly("哈哈") });
    assert.strictEqual(countAllRows(db), 1);
    assert.strictEqual(loadActiveMemoriesSync(db, AGENT, JIA).length, 1);
  }

  // 三、最终回复上的身份纠正
  {
    // QQ 不同：模型回「你就是我」，出口必须改掉
    const db = await freshDb();
    const claimed = await runEntry({
      db,
      userName: "小明",
      userQq: "20002",
      text: "我是谁",
      step: replyOnly("你就是我。群名片是小明，这张卡叫厂夏。"),
    });
    assert.ok(!claimsSelfIdentity(claimed.reply), "出口没有「你就是我」");
    assert.strictEqual(claimed.reply, "你是小明，我是厂夏。咱们不是同一个人。");

    const mixed = await runEntry({
      db,
      userName: "小明",
      userQq: "20002",
      text: "今晚去吗",
      step: replyOnly("你就是我。今晚不去深渊。"),
    });
    assert.strictEqual(mixed.reply, "今晚不去深渊。");

    // QQ 为空也不是本人
    const noQq = await runEntry({
      db,
      userName: "小明",
      userQq: null,
      text: "我是谁",
      step: replyOnly("你就是我"),
    });
    assert.ok(!claimsSelfIdentity(noQq.reply));

    // 别人的普通回复不被改写
    const plain = await runEntry({
      db,
      userName: "小明",
      userQq: "20002",
      text: "在吗",
      step: replyOnly("小明你好啊"),
    });
    assert.strictEqual(plain.reply, "小明你好啊");

    // QQ 相同：本人，说「群里那个」会被纠正，说「你就是我」保持原样
    const selfWrong = await runEntry({
      db,
      userName: "小明",
      userQq: AGENT_QQ,
      text: "我是谁",
      step: replyOnly("知道啊，小明嘛，群里那个"),
    });
    assert.strictEqual(selfWrong.reply, "你就是我。群名片是小明，这张卡叫厂夏。");
    const selfRight = await runEntry({
      db,
      userName: "小明",
      userQq: AGENT_QQ,
      text: "我是谁",
      step: replyOnly("你就是我"),
    });
    assert.strictEqual(selfRight.reply, "你就是我");
    assert.strictEqual(countAllRows(db), 0, "身份对话本身没有事实，不落库");
  }

  // 四、入口给模型的身份提示和历史过滤
  {
    const db = await freshDb();
    const history = [
      { role: "user", content: "我是谁" },
      { role: "assistant", content: "知道啊，群里那个小明" },
    ];
    const chatOf = (messages: ChatMessage[]) =>
      messages
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .map((msg) => msg.content)
        .join("\n");

    let seen: ChatMessage[] = [];
    await runEntry({
      db,
      userName: "小明",
      userQq: AGENT_QQ,
      aliases: ["小明"],
      text: "再问一遍",
      history,
      step: async (messages) => {
        seen = messages.map((msg) => ({ ...msg }));
        return { content: "你就是我", toolCalls: [] };
      },
    });
    assert.ok(systemTextOf(seen).includes("就是你本人"), "QQ 相同才是本人");
    assert.ok(!chatOf(seen).includes("群里那个"), "本人的窗口里滤掉「群里那个」");

    await runEntry({
      db,
      userName: "小明",
      userQq: "20002",
      aliases: ["小明", "厂夏"],
      text: "再问一遍",
      history,
      step: async (messages) => {
        seen = messages.map((msg) => ({ ...msg }));
        return { content: "嗯", toolCalls: [] };
      },
    });
    const otherSystem = systemTextOf(seen);
    assert.ok(otherSystem.includes("不是你本人"));
    assert.ok(!otherSystem.includes("就是你本人"));
    assert.ok(
      !/发送者写成[^。]*「厂夏」/.test(otherSystem),
      "别人的别名里混不进分身的卡名",
    );
    assert.ok(chatOf(seen).includes("群里那个"), "别人的窗口不做这层过滤");
  }

  // 五、开轮检索：只读当前用户的记忆；别的用户读不到；向量挂了关键词仍能找回
  {
    const db = await freshDb();
    const day1 = new Date("2026-10-06T02:00:00Z");
    const first = await runEntry({
      db,
      text: "记住我叫阿黄",
      step: replyOnly("行"),
      now: day1,
    });
    assert.strictEqual(first.written, 1);
    const stored = loadActiveMemoriesSync(db, AGENT, JIA);
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].importance, IMPORTANCE_EXPLICIT, "点名记住的重要性最高");

    let seenJia: ChatMessage[] = [];
    await runEntry({
      db,
      text: "阿黄是谁",
      step: async (messages) => {
        seenJia = messages.map((msg) => ({ ...msg }));
        return { content: "是你", toolCalls: [] };
      },
    });
    assert.ok(
      systemTextOf(seenJia).includes("阿黄"),
      "开轮检索把长期记忆放进了提示词",
    );

    // 用户乙问同一个分身：提示词和工具结果里都不能出现阿黄
    const seenYi: ChatMessage[][] = [];
    const yiModel: StepFn = async (messages) => {
      seenYi.push(messages.map((msg) => ({ ...msg })));
      if (seenYi.length === 1) {
        return {
          content: "",
          toolCalls: [
            {
              id: "y1",
              name: "search_memory",
              arguments: JSON.stringify({ query: "我叫什么名字" }),
            },
          ],
        };
      }
      return { content: "不知道", toolCalls: [] };
    };
    await runEntry({
      db,
      userId: YI,
      userName: "乙",
      userQq: "20003",
      text: "你还记得我吗",
      step: yiModel,
    });
    for (const messages of seenYi) {
      assert.ok(
        !messages.some((msg) => msg.content.includes("阿黄")),
        "用户乙的整轮对话里都没有阿黄",
      );
    }
    assert.strictEqual(loadAllMemoriesSync(db, AGENT, YI).length, 0);
    assert.strictEqual(countAllRows(db), 1);
  }
  {
    // 向量接口挂了：显式记住照样落库，开轮检索靠关键词找回名字
    const db = await freshDb();
    const first = await runEntry({
      db,
      text: "记住我叫阿黄",
      step: replyOnly("行"),
      embed: brokenEmbed,
    });
    assert.strictEqual(first.written, 1);
    let seen: ChatMessage[] = [];
    await runEntry({
      db,
      text: "阿黄",
      embed: brokenEmbed,
      step: async (messages) => {
        seen = messages.map((msg) => ({ ...msg }));
        return { content: "嗯", toolCalls: [] };
      },
    });
    assert.ok(systemTextOf(seen).includes("阿黄"), "向量失败时关键词仍命中");
  }

  // 六、改口是覆盖：旧事实被取代，检索和提示词里只剩新的
  {
    const db = await freshDb();
    await runEntry({
      db,
      text: "记住我叫阿黄",
      step: replyOnly("行"),
      now: new Date("2026-10-05T02:00:00Z"),
    });
    await runEntry({
      db,
      text: "记住我改名叫阿白",
      step: replyOnly("行"),
      now: new Date("2026-10-06T02:00:00Z"),
    });
    const all = loadAllMemoriesSync(db, AGENT, JIA);
    const old = all.find((row) => row.fact.includes("阿黄"))!;
    const fresh = all.find((row) => row.fact.includes("阿白"))!;
    assert.strictEqual(old.supersededBy, fresh.id, "旧行标记被取代");
    assert.strictEqual(
      loadActiveMemoriesSync(db, AGENT, JIA).filter((row) => row.topic === "称呼")
        .length,
      1,
      "同一主题不会两条同时有效",
    );
    let seen: ChatMessage[] = [];
    await runEntry({
      db,
      text: "我叫什么名字",
      step: async (messages) => {
        seen = messages.map((msg) => ({ ...msg }));
        return { content: "阿白", toolCalls: [] };
      },
    });
    const system = systemTextOf(seen);
    assert.ok(system.includes("阿白"));
    assert.ok(!system.includes("阿黄"), "提示词里只剩阿白");
  }

  // 七、身份没确认：整轮不读不写私聊记忆，包括点名记住和带事实的话
  {
    const db = await freshDb();
    rememberSync(db, {
      agentId: AGENT,
      userId: JIA,
      fact: "甲：我叫阿黄",
      topic: memoryTopic("我叫阿黄"),
      importance: IMPORTANCE_EXPLICIT,
      vector: localEmbed("我叫阿黄"),
      now: t0,
    });
    const seen: ChatMessage[][] = [];
    const model: StepFn = async (messages) => {
      seen.push(messages.map((msg) => ({ ...msg })));
      if (seen.length === 1) {
        return {
          content: "",
          toolCalls: [
            {
              id: "u1",
              name: "search_memory",
              arguments: JSON.stringify({ query: "阿黄" }),
            },
          ],
        };
      }
      if (seen.length === 2) {
        return {
          content: "",
          toolCalls: [
            {
              id: "u2",
              name: "remember",
              arguments: JSON.stringify({ fact: "我住1408房" }),
            },
          ],
        };
      }
      return { content: "好", toolCalls: [] };
    };
    const result = await runEntry({
      db,
      userId: 0,
      userName: "路人",
      userQq: null,
      text: "记住我住1408房，阿黄",
      step: model,
    });
    assert.strictEqual(result.written, 0);
    assert.strictEqual(countAllRows(db), 1, "只剩事先放进去的那一行，什么都没新增");
    assert.ok(!systemTextOf(seen[0]).includes("阿黄"), "开轮不检索共享记忆");
    assert.ok(seen[1][seen[1].length - 1].content.includes("不读私聊记忆"));
    assert.ok(seen[2][seen[2].length - 1].content.includes("不写私聊记忆"));
    assert.strictEqual(loadAllMemoriesSync(db, AGENT, 0).length, 0);
  }

  // 八、轮末归并：重复合并、久不检索的降权、旧轮工作笔记清掉（只清当前用户的）
  {
    const db = await freshDb();
    const longAgo = new Date("2026-07-09T02:00:00Z");
    rememberSync(db, {
      agentId: AGENT,
      userId: JIA,
      fact: "甲：我昨天随口说喜欢喝冰美式",
      topic: "原文:我昨天随口说喜欢喝冰美式",
      importance: IMPORTANCE_CHAT,
      vector: localEmbed("我昨天随口说喜欢喝冰美式"),
      now: longAgo,
    });
    for (const stamp of ["2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z"]) {
      db.run(
        `INSERT INTO agent_user_memory
           (agent_id, user_id, topic, fact, kind, importance, hit_count,
            vector_json, superseded_by, last_hit_at, created_at, updated_at)
         VALUES (?, ?, '房间', '甲：我住1408房', 'fact', 0.6, 0, '', NULL, NULL, ?, ?)`,
        [AGENT, JIA, sqlNow(new Date(stamp)), sqlNow(new Date(stamp))],
      );
    }
    noteWorkingSync(db, {
      turnId: "turn-old-jia",
      agentId: AGENT,
      userId: JIA,
      step: 1,
      tool: "search_memory",
      note: "旧轮笔记",
      now: longAgo,
    });
    noteWorkingSync(db, {
      turnId: "turn-old-yi",
      agentId: AGENT,
      userId: YI,
      step: 1,
      tool: "search_memory",
      note: "乙的旧笔记",
      now: longAgo,
    });
    assert.strictEqual(loadActiveMemoriesSync(db, AGENT, JIA).length, 3);

    let round = 0;
    const result = await runEntry({
      db,
      text: "哈哈",
      step: async () => {
        round++;
        if (round === 1) {
          return {
            content: "",
            toolCalls: [
              {
                id: "m1",
                name: "working_note",
                arguments: JSON.stringify({ note: "本轮笔记" }),
              },
            ],
          };
        }
        return { content: "哈哈", toolCalls: [] };
      },
    });
    const active = loadActiveMemoriesSync(db, AGENT, JIA);
    assert.strictEqual(
      active.filter((row) => row.fact.includes("1408")).length,
      1,
      "轮末把重复的两条合成一条",
    );
    const coffee = active.find((row) => row.fact.includes("冰美式"))!;
    assert.ok(coffee.importance < IMPORTANCE_CHAT, "久不检索的降权");
    assert.deepStrictEqual(
      listWorkingNotesSync(db, { turnId: "turn-old-jia", userId: JIA }),
      [],
      "旧轮的工作笔记被清掉",
    );
    assert.ok(
      listWorkingNotesSync(db, { turnId: result.turnId, userId: JIA }).length >= 1,
      "本轮的工作笔记留着",
    );
    assert.strictEqual(
      listWorkingNotesSync(db, { turnId: "turn-old-yi", userId: YI }).length,
      1,
      "别的用户的笔记不受影响",
    );
  }

  // 九、入口上的工具回路：注册表只有四件、没注册的工具不执行、步数有上限
  {
    const db = await freshDb();
    let specNames: string[] = [];
    let shellReply = "";
    let round = 0;
    const result = await runEntry({
      db,
      text: "跑个命令",
      step: async (messages, specs) => {
        round++;
        if (round === 1) {
          specNames = specs.map((spec) => spec.name);
          return {
            content: "",
            toolCalls: [
              { id: "x1", name: "shell", arguments: JSON.stringify({ cmd: "ls" }) },
            ],
          };
        }
        shellReply = messages[messages.length - 1].content;
        return { content: "这事我干不了。", toolCalls: [] };
      },
    });
    assert.deepStrictEqual(specNames.sort(), [...AGENT_TOOL_NAMES].sort());
    for (const bad of FORBIDDEN_TOOL_NAMES) {
      assert.ok(!specNames.includes(bad), bad);
    }
    assert.ok(shellReply.includes("没有注册这个工具"));
    assert.strictEqual(result.calls[0].ok, false);

    const greedy: StepFn = async () => ({
      content: "我还想再查一次",
      toolCalls: [
        {
          id: "g1",
          name: "working_note",
          arguments: JSON.stringify({ note: "还得再查" }),
        },
      ],
    });
    const capped = await runEntry({ db, text: "说点什么", step: greedy, maxSteps: 3 });
    assert.strictEqual(capped.steps, 3, "入口把步数上限接到了回路上");
    assert.strictEqual(capped.hitCap, true);
    assert.strictEqual(capped.reply, TURN_CAP_REPLY);
    const defaulted = await runEntry({ db, text: "说点什么", step: greedy });
    assert.strictEqual(defaulted.steps, MAX_TURN_STEPS, "不传就用默认上限");
    assert.strictEqual(defaulted.hitCap, true);
  }
  ok("私聊入口接线：事实话回复后落库、哈哈不写、身份出口纠正、开轮检索、覆盖、未确认身份、轮末归并、工具上限");
}

/**
 * 8e. 不矛盾的长期记忆不能互相覆盖（打到 runMemberTurnDetailed）：
 * 过敏、忌口、不吃同属「身体忌讳」，但对花生过敏和不吃香菜是两件事，必须并存；
 * 只有同一件事的新说法才取代旧的，并给旧行打上新时间戳。
 */
async function testDistinctFactsCoexist() {
  const day1 = new Date("2026-10-05T02:00:00Z");
  const day2 = new Date("2026-10-06T02:00:00Z");
  const day3 = new Date("2026-10-07T02:00:00Z");
  const db = await freshDb();

  await runEntry({ db, text: "记住我对花生过敏", step: replyOnly("行"), now: day1 });
  const second = await runEntry({
    db,
    text: "记住我不吃香菜",
    step: replyOnly("行"),
    now: day2,
  });
  assert.strictEqual(second.written, 1);

  // 两条都还在，谁也没被标记为被取代
  const rows = loadAllMemoriesSync(db, AGENT, JIA);
  const peanut = rows.find((row) => row.fact.includes("花生"))!;
  const cilantro = rows.find((row) => row.fact.includes("香菜"))!;
  assert.ok(peanut && cilantro, "两条事实都落了库");
  assert.strictEqual(peanut.superseded, false, "花生过敏没被后一句取代");
  assert.strictEqual(cilantro.superseded, false);
  assert.notStrictEqual(peanut.topic, cilantro.topic, "两件事不共用一个主题");
  assert.strictEqual(peanut.updatedAt, sqlNow(day1), "没被覆盖的旧行时间戳不动");
  assert.strictEqual(loadActiveMemoriesSync(db, AGENT, JIA).length, 2);

  // 检索都能命中，开轮提示词里也都在
  for (const [query, word] of [
    ["我对什么过敏", "花生"],
    ["花生", "花生"],
    ["香菜", "香菜"],
  ]) {
    const hits = searchMemorySync(db, {
      agentId: AGENT,
      userId: JIA,
      query,
      queryVector: localEmbed(query),
      now: day3,
    });
    assert.ok(hits.some((hit) => hit.fact.includes(word)), `${query} 命中 ${word}`);
  }
  let seen: ChatMessage[] = [];
  await runEntry({
    db,
    text: "我花生和香菜怎么说来着",
    step: async (messages) => {
      seen = messages.map((msg) => ({ ...msg }));
      return { content: "记得", toolCalls: [] };
    },
    now: day3,
  });
  const system = systemTextOf(seen);
  assert.ok(system.includes("花生") && system.includes("香菜"), "提示词里两条都在");

  // 轮末归并也不能把两件事并成一条
  assert.strictEqual(loadActiveMemoriesSync(db, AGENT, JIA).length, 2);

  // 模型自己调 remember 时随手填粗主题「身体忌讳」，也不能顶掉别的忌讳
  let round = 0;
  await runEntry({
    db,
    text: "顺便跟你说个事",
    now: day3,
    step: async () => {
      round++;
      if (round === 1) {
        return {
          content: "",
          toolCalls: [
            {
              id: "t1",
              name: "remember",
              arguments: JSON.stringify({
                fact: "甲：我吃不了海鲜",
                topic: "身体忌讳",
              }),
            },
          ],
        };
      }
      return { content: "记下了", toolCalls: [] };
    },
  });
  const afterTool = loadActiveMemoriesSync(db, AGENT, JIA);
  assert.ok(afterTool.some((row) => row.fact.includes("花生")), "花生还在");
  assert.ok(afterTool.some((row) => row.fact.includes("香菜")), "香菜还在");
  assert.ok(afterTool.some((row) => row.fact.includes("海鲜")), "海鲜也记下了");

  // 同一件事的新说法才取代：花生改口，旧行被取代并打上新时间戳，香菜不受影响
  await runEntry({
    db,
    text: "记住我对花生不过敏了",
    step: replyOnly("行"),
    now: day3,
  });
  const all = loadAllMemoriesSync(db, AGENT, JIA);
  const oldPeanut = all.find((row) => row.id === peanut.id)!;
  const newPeanut = all.find((row) => row.fact.includes("不过敏"))!;
  assert.strictEqual(oldPeanut.superseded, true, "同一件事旧说法被取代");
  assert.strictEqual(oldPeanut.supersededBy, newPeanut.id);
  assert.strictEqual(oldPeanut.updatedAt, sqlNow(day3), "旧行打上新时间戳");
  const cilantroNow = all.find((row) => row.id === cilantro.id)!;
  assert.strictEqual(cilantroNow.superseded, false, "香菜不受花生改口影响");
  const peanutHits = searchMemorySync(db, {
    agentId: AGENT,
    userId: JIA,
    query: "花生",
    queryVector: localEmbed("花生"),
    now: day3,
  });
  assert.ok(peanutHits.some((hit) => hit.fact.includes("不过敏")));
  assert.ok(
    !peanutHits.some((hit) => hit.id === peanut.id),
    "检索里只剩花生的新说法",
  );

  // 手机号和微信是两件事，也不互相覆盖
  const contactDb = await freshDb();
  await runEntry({ db: contactDb, text: "记住我微信是abc123", step: replyOnly("行"), now: day1 });
  await runEntry({ db: contactDb, text: "记住我手机号是13800001111", step: replyOnly("行"), now: day2 });
  assert.strictEqual(loadActiveMemoriesSync(contactDb, AGENT, JIA).length, 2);
  await runEntry({ db: contactDb, text: "记住我微信是xyz789", step: replyOnly("行"), now: day3 });
  const contacts = loadActiveMemoriesSync(contactDb, AGENT, JIA);
  assert.strictEqual(contacts.length, 2);
  assert.ok(contacts.some((row) => row.fact.includes("xyz789")));
  assert.ok(!contacts.some((row) => row.fact.includes("abc123")));
  assert.ok(contacts.some((row) => row.fact.includes("13800001111")));
  ok("私聊入口：不矛盾的事实并存，只有同一件事的新说法才取代旧的");
}

/** 9. 已有身份行为不退步 */
async function testIdentityUnchanged() {
  assert.strictEqual(sameQq(10001, "10001"), true);
  assert.strictEqual(sameQq("10001", "10002"), false);
  assert.strictEqual(sameQq("123", "123"), false);
  assert.strictEqual(sameQq(null, null), false);

  const self = formatSpeakerIdentity("sr.11", ["sr.11"], {
    self: true,
    agentName: "厂夏",
  });
  assert.ok(self.includes("就是你本人"));
  assert.ok(self.includes("这张卡叫「厂夏」"));
  assert.ok(self.includes("你就是我"));

  const other = formatSpeakerIdentity("小明", ["小明"], {
    self: false,
    agentName: "厂夏",
  });
  assert.ok(other.includes("不是你本人"));
  assert.ok(other.includes("发送者写成 「小明」 的，才是他"));
  assert.ok(!/发送者写成[^。]*「厂夏」/.test(other), "别人的别名里没有分身卡名");

  assert.strictEqual(
    correctSelfReply("知道啊，sr.11嘛，群里那个", "sr.11", "厂夏"),
    "你就是我。群名片是sr.11，这张卡叫厂夏。",
  );
  assert.strictEqual(
    correctOtherReply("你就是我。群名片是小明，这张卡叫厂夏。", "小明", "厂夏"),
    "你是小明，我是厂夏。咱们不是同一个人。",
  );
  assert.strictEqual(
    correctOtherReply("今晚不去深渊。", "小明", "厂夏"),
    "今晚不去深渊。",
  );
  assert.strictEqual(claimsSelfIdentity("你就是我"), true);

  // 新回路的提示词里，身份提示和硬性事实边界都还在
  const prompt = buildTurnSystemPrompt({
    agentName: "厂夏",
    systemPrompt: "这是人设",
    userName: "小明",
    userAliases: ["小明"],
    self: false,
    memoryBlock: formatMemoryBlock([]),
  });
  assert.ok(prompt.includes("不是你本人"));
  assert.ok(prompt.includes("一个字都不要补"), "硬性事实边界仍在");
  assert.ok(prompt.includes("search_memory"));
  assert.ok(prompt.includes("只属于当前这位用户"));
  assert.ok(!/shell|read_file|write_file|跑代码/.test(prompt));
  ok("QQ 相同才是本人，别名不混卡名，硬性边界和身份提示都还在");
}

async function main() {
  console.log("== test-memory ==");
  await testPerUserIsolation();
  await testWritePolicy();
  await testConflictReplaces();
  await testScoring();
  await testWindowCompression();
  await testWindowWatermark();
  await testDecayAndPrune();
  await testWorkingMemory();
  await testToolLoop();
  await testPrivateEntry();
  await testPrivateEntrySessionWindow();
  await testPrivateEntryWiring();
  await testDistinctFactsCoexist();
  await testIdentityUnchanged();
  console.log("记忆分层与工具回路用例通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
