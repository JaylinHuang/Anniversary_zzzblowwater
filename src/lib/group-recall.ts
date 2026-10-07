/**
 * 从整段群聊里认出对方在问谁，并带回这个人自己的发言、以及别人怎么说他。
 * 网站群友名片不参与。别人的话是听见的，不是这个分身的经历。
 */
import { isBotGroupName } from "@/lib/bot-chat";
import { escapeLikePattern } from "@/lib/capsule-rules";
import { isAgentCorpusText } from "@/lib/chat-parser";
import { getDb, rowFrom, rowsFrom } from "@/lib/db";
import {
  formatWhen,
  judgeTimeline,
  resolveSubject,
  searchNeedles,
  topicNeedles,
  type DatedLine,
} from "@/lib/fact-timeline";

export type GroupSpeaker = { name: string; qq: string };

const RECALL_STOP = new Set([
  "群友",
  "这个",
  "那个",
  "我们",
  "你们",
  "他们",
  "自己",
  "什么",
  "怎么",
  "怎么样",
  "厉害",
  "觉得",
  "感觉",
  "一下",
  "有点",
  "还是",
  "就是",
  "没有",
  "知道",
  "真的",
  "绝区零",
]);

let speakerCache: { at: number; rows: GroupSpeaker[] } | null = null;

function sameDigits(a: string, b: string): boolean {
  const left = a.replace(/\D/g, "");
  const right = b.replace(/\D/g, "");
  return left.length >= 5 && left === right;
}

function cleanLine(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** 从问句里剥掉套话，留下可能的称呼。群名片对不上时，用这些词去正文里找 */
export function recallNameTokens(talk: string): string[] {
  const strip = [
    "你觉得",
    "这个群友",
    "厉不厉害",
    "厉害吗",
    "喜不喜欢",
    "怎么样",
    "怎么看",
    "绝区零",
    "群友",
    "觉得",
    "这个",
    "那个",
    "他打",
    "她打",
    "怎么",
    "什么",
  ].sort((a, b) => b.length - a.length);
  let text = talk.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ");
  for (const word of strip) text = text.split(word).join(" ");
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (token: string) => {
    const name = token.trim();
    if (name.length < 2 || name.length > 8) return;
    if (RECALL_STOP.has(name)) return;
    if (seen.has(name)) return;
    seen.add(name);
    out.push(name);
  };
  for (const part of text.split(/\s+/)) {
    if (/^[a-zA-Z0-9]/.test(part)) {
      if (part.length >= 3) push(part);
      continue;
    }
    push(part);
  }
  return out.slice(0, 4);
}
export function matchSpeakersInTalk(
  talk: string,
  speakers: GroupSpeaker[],
): GroupSpeaker[] {
  const text = talk.replace(/\s+/g, "");
  if (!text) return [];
  const found: GroupSpeaker[] = [];
  const seen = new Set<string>();
  const sorted = [...speakers].sort((a, b) => b.name.length - a.name.length);
  for (const speaker of sorted) {
    const name = speaker.name.trim();
    if (name.length < 2 || name.length > 16) continue;
    if (RECALL_STOP.has(name)) continue;
    if (isBotGroupName(name)) continue;
    if (!text.includes(name)) continue;
    if (found.some((item) => item.name.includes(name))) continue;
    const key = `${speaker.qq}\n${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(speaker);
    if (found.length >= 3) break;
  }
  return found;
}

export function formatRecalledLine(params: {
  sender: string;
  qq: string;
  content: string;
  selfQq: string;
  sentAt?: string | null;
}): string {
  const body = cleanLine(params.content);
  const when = formatWhen(params.sentAt || null);
  const at = when ? `在 ${when} ` : "";
  if (sameDigits(params.qq, params.selfQq)) return `你自己${at}说过：${body}`;
  const name = params.sender.trim() || "群友";
  return `「${name}」${at}说过：${body}`;
}

/** 拼进这一轮系统提示。没有对上的人就返回空，避免再写一句「群里没有」 */
export function formatGroupRecallBlock(names: string[], lines: string[]): string {
  if (!names.length || !lines.length) return "";
  const who = names.map((name) => `「${name}」`).join("、");
  return [
    `群聊里和${who}有关的发言（只来自群聊归档）：`,
    ...lines.map((line, index) => `${index + 1}. ${line}`),
    "你泡在这个群里，对这些人的印象要对上这些发言。别人说的是你听见的，不是你的经历。上面没有的战绩、水平和隐私不要编。不要用网站上的群友名片。",
    "发言若带了时间，互相矛盾或和人设矛盾时，以时间更晚的那条为准。问的是你自己，就用你的口气按这条回答，不要说成把人记混了。",
  ].join("\n");
}

type LineRow = {
  sender: string;
  qq_number: string;
  content: string;
  sent_at?: string | null;
};

function keepLines(rows: LineRow[], selfQq: string, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const perSender = new Map<string, number>();
  for (const row of rows) {
    if (isBotGroupName(row.sender)) continue;
    if (!isAgentCorpusText(row.content)) continue;
    const body = cleanLine(row.content);
    if (body.length < 4) continue;
    const key = body.slice(0, 40);
    if (seen.has(key)) continue;
    const who = row.sender.trim() || row.qq_number;
    if ((perSender.get(who) || 0) >= 2) continue;
    seen.add(key);
    perSender.set(who, (perSender.get(who) || 0) + 1);
    out.push(
      formatRecalledLine({
        sender: row.sender,
        qq: row.qq_number || "",
        content: body,
        selfQq,
        sentAt: row.sent_at || null,
      }),
    );
    if (out.length >= limit) break;
  }
  return out;
}

/** 活跃归档里的群名片。十分钟内复用，避免每句话都扫一遍全表 */
export async function listGroupSpeakers(): Promise<GroupSpeaker[]> {
  if (speakerCache && Date.now() - speakerCache.at < 10 * 60 * 1000) {
    return speakerCache.rows;
  }
  const db = await getDb();
  const rows = rowsFrom<{ sender: string; qq_number: string }>(
    db,
    `SELECT DISTINCT m.sender AS sender, IFNULL(m.qq_number, '') AS qq_number
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.sender != ''`,
  );
  const speakers = rows
    .map((row) => ({ name: String(row.sender || "").trim(), qq: String(row.qq_number || "") }))
    .filter((row) => row.name.length >= 2 && row.name.length <= 16 && !isBotGroupName(row.name));
  speakerCache = { at: Date.now(), rows: speakers };
  return speakers;
}

async function linesByQq(qq: string, limit: number): Promise<LineRow[]> {
  if (!qq) return [];
  const db = await getDb();
  return rowsFrom<LineRow>(
    db,
    `SELECT m.sender AS sender, IFNULL(m.qq_number, '') AS qq_number,
            m.content AS content, m.sent_at AS sent_at
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.qq_number = ?
     ORDER BY m.id DESC
     LIMIT ?`,
    [qq, limit],
  );
}

async function linesMentioning(name: string, exceptQq: string, limit: number): Promise<LineRow[]> {
  const needle = name.trim();
  if (needle.length < 2) return [];
  const db = await getDb();
  return rowsFrom<LineRow>(
    db,
    `SELECT m.sender AS sender, IFNULL(m.qq_number, '') AS qq_number,
            m.content AS content, m.sent_at AS sent_at
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active'
       AND m.content LIKE ? ESCAPE '\\'
       AND IFNULL(m.qq_number, '') != ?
     ORDER BY m.id DESC
     LIMIT ?`,
    [`%${escapeLikePattern(needle)}%`, exceptQq, limit],
  );
}

/** 把主键切成小段。段数不多时盖住全部 id，避免一条 SQL 把整表排进内存 */
export function idWindows(
  lo: number,
  hi: number,
  width = 8000,
  maxWindows = 80,
): Array<[number, number]> {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return [];
  const span = hi - lo + 1;
  const size = Math.max(1, Math.floor(width));
  const cap = Math.max(2, Math.floor(maxWindows));
  const starts: number[] = [];
  const need = Math.ceil(span / size);
  if (need <= cap) {
    for (let start = lo; start <= hi; start += size) starts.push(start);
  } else {
    const step = Math.max(1, Math.floor((hi - lo) / (cap - 1)));
    for (let i = 0; i < cap; i++) {
      const start = Math.min(hi, lo + i * step);
      if (!starts.includes(start)) starts.push(start);
    }
  }
  return starts.map((start) => [start, Math.min(hi, start + size - 1)]);
}

async function topicWindow(
  qq: string,
  names: string[],
  needles: string[],
  lo: number,
  hi: number,
): Promise<DatedLine[]> {
  const who: string[] = [];
  const params: Array<string | number> = [lo, hi];
  if (qq) {
    who.push("m.qq_number = ?");
    params.push(qq);
  }
  for (const name of names) {
    if (name.length < 2) continue;
    who.push("m.content LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLikePattern(name)}%`);
  }
  if (!who.length || !needles.length) return [];
  const topic = needles.map(() => "m.content LIKE ? ESCAPE '\\'").join(" OR ");
  const db = await getDb();
  return rowsFrom<{
    id: number;
    sender: string;
    qq_number: string;
    content: string;
    sent_at: string | null;
  }>(
    db,
    `SELECT m.id AS id, m.sender AS sender, IFNULL(m.qq_number, '') AS qq_number,
            m.content AS content, m.sent_at AS sent_at
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active'
       AND m.id >= ? AND m.id <= ?
       AND (${who.join(" OR ")})
       AND (${topic})
     LIMIT 3`,
    [...params, ...needles.map((needle) => `%${escapeLikePattern(needle)}%`)],
  )
    .filter((row) => !isBotGroupName(row.sender) && isAgentCorpusText(row.content))
    .map((row) => ({
      id: Number(row.id),
      sender: String(row.sender || ""),
      qq: String(row.qq_number || ""),
      content: String(row.content || ""),
      sentAt: row.sent_at == null ? null : String(row.sent_at),
    }));
}

/** 按主键分段扫整段归档。每段只留几条，不把所有命中行排进内存 */
async function linesAboutTopic(
  qq: string,
  names: string[],
  needles: string[],
): Promise<DatedLine[]> {
  const db = await getDb();
  const span = rowFrom<{ lo: number | null; hi: number | null }>(
    db,
    `SELECT MIN(m.id) AS lo, MAX(m.id) AS hi
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active'`,
  );
  if (!span || span.lo == null || span.hi == null) return [];
  const windows = idWindows(Number(span.lo), Number(span.hi));
  const merged: DatedLine[] = [];
  const push = (line: DatedLine) => {
    if (!merged.some((item) => item.id === line.id)) merged.push(line);
  };
  // 先看最近的段。话题很密时到上限就停，避免一次扫完全表
  for (const [lo, hi] of [...windows].reverse()) {
    for (const line of await topicWindow(qq, names, needles, lo, hi)) push(line);
    if (merged.length >= 36) break;
  }
  const oldest = windows[0];
  if (oldest) {
    for (const line of await topicWindow(qq, names, needles, oldest[0], oldest[1])) {
      push(line);
    }
  }
  return merged;
}

/** 这一轮在问哪些群友，以及能对上的发言。问自己时同样去整段群聊里找 */
export async function collectGroupRecall(params: {
  selfQq: string;
  selfName?: string;
  talk: string;
  /** 只用来判断这一问在问谁、问什么。不传就用 talk */
  focus?: string;
  persona?: string;
  limit?: number;
}): Promise<{ names: string[]; lines: string[]; personaPatch: string | null }> {
  const speakers = await listGroupSpeakers();
  const current = (params.focus || params.talk).trim();
  const matchedNow = matchSpeakersInTalk(current, speakers);
  const matchedTalk = matchSpeakersInTalk(params.talk, speakers);
  const selfName = (params.selfName || "").trim();
  let subject = resolveSubject(
    current,
    selfName,
    matchedNow.map((speaker) => speaker.name),
  );
  let matched = matchedNow;
  if (subject === "none") {
    subject = resolveSubject(
      params.talk,
      selfName,
      matchedTalk.map((speaker) => speaker.name),
    );
    matched = matchedTalk;
  }
  const ignore = [
    selfName,
    ...matched.map((speaker) => speaker.name),
  ].filter(Boolean);
  const needles = topicNeedles(current, ignore);
  if (needles.length && subject !== "none") {
    const other = matched.find((speaker) => speaker.name !== selfName);
    const target =
      subject === "self"
        ? { qq: params.selfQq, name: selfName || "你" }
        : { qq: other?.qq || "", name: other?.name || "" };
    const aliases =
      subject === "self"
        ? selfName.length >= 2
          ? [selfName]
          : []
        : target.name
          ? [target.name]
          : [];
    const dated = await linesAboutTopic(target.qq, aliases, searchNeedles(needles));
    if (dated.length) {
      const verdict = judgeTimeline({
        persona: params.persona || "",
        lines: dated,
        alternatives: needles,
      });
      const lines = verdict.show.map((line) =>
        formatRecalledLine({
          sender: line.sender,
          qq: line.qq,
          content: line.content,
          selfQq: params.selfQq,
          sentAt: line.sentAt,
        }),
      );
      return {
        names: [target.name].filter(Boolean),
        lines,
        personaPatch: verdict.patch,
      };
    }
  }
  const nicknames = recallNameTokens(params.talk).filter(
    (token) => !matched.some((speaker) => speaker.name.includes(token)),
  );
  if (!matched.length && !nicknames.length) {
    return { names: [], lines: [], personaPatch: null };
  }
  const limit = params.limit ?? 8;
  const names = [
    ...matched.map((speaker) => speaker.name),
    ...nicknames,
  ].slice(0, 3);
  const per = Math.max(2, Math.floor(limit / names.length));
  const lines: string[] = [];
  for (const speaker of matched) {
    const own = keepLines(await linesByQq(speaker.qq, 160), params.selfQq, per);
    const heard = keepLines(
      await linesMentioning(speaker.name, speaker.qq, 80),
      params.selfQq,
      Math.max(1, Math.floor(per / 2)),
    );
    for (const line of [...own, ...heard]) {
      if (!lines.includes(line)) lines.push(line);
      if (lines.length >= limit) break;
    }
    if (lines.length >= limit) break;
  }
  for (const token of nicknames) {
    if (lines.length >= limit) break;
    const heard = keepLines(
      await linesMentioning(token, "\n", 120),
      params.selfQq,
      per,
    );
    for (const line of heard) {
      if (!lines.includes(line)) lines.push(line);
      if (lines.length >= limit) break;
    }
  }
  return { names, lines: lines.slice(0, limit), personaPatch: null };
}

/** 重炼人设时看一眼别人怎么提到他，不读网站名片 */
export async function mentionSamplesForQq(
  qq: string,
  displayName: string,
  limit = 8,
): Promise<string[]> {
  const db = await getDb();
  const names = new Set<string>();
  const card = displayName.trim();
  if (card.length >= 2) names.add(card);
  for (const row of rowsFrom<{ sender: string }>(
    db,
    `SELECT m.sender AS sender
     FROM chat_messages m
     JOIN import_batches b ON b.id = m.batch_id
     WHERE b.status = 'active' AND m.qq_number = ? AND m.sender != ''
     GROUP BY m.sender
     ORDER BY COUNT(*) DESC
     LIMIT 3`,
    [qq],
  )) {
    const name = String(row.sender || "").trim();
    if (name.length >= 2 && name.length <= 16) names.add(name);
  }
  const lines: string[] = [];
  for (const name of names) {
    const heard = keepLines(await linesMentioning(name, qq, 40), qq, 4);
    for (const line of heard) {
      if (!lines.includes(line)) lines.push(line);
      if (lines.length >= limit) return lines;
    }
  }
  return lines;
}
