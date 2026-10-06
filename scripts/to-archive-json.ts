/**
 * 把 QCE xlsx 或 QQChatExporter JSON 转成站点用的 zzz-archive JSON。
 * 多个输入会再写一份按时间去重后的合并文件。
 *
 * npx tsx scripts/to-archive-json.ts <输入1> [输入2 ...]
 */
import fs from "fs";
import path from "path";
import {
  archiveFromQceExporter,
  archiveFromXlsx,
  type ArchiveDocument,
} from "../src/lib/chat-json";
import type { ParsedMessage } from "../src/lib/chat-parser";

function groupFromFilename(filePath: string): {
  groupName: string;
  groupId: string;
} {
  const base = path.basename(filePath);
  // group_群名_群号_导出时间，群名本身不含下划线时用非贪婪匹配
  const matched = base.match(/group_(.+?)_(\d{6,})_\d+/);
  return {
    groupName: matched?.[1] || "",
    groupId: matched?.[2] || "",
  };
}

function outputPathFor(input: string): string {
  const ext = path.extname(input).toLowerCase();
  if (ext === ".xlsx") return input.slice(0, -ext.length) + ".json";
  if (ext === ".json") {
    if (input.endsWith(".archive.json")) return input;
    return input.slice(0, -".json".length) + ".archive.json";
  }
  throw new Error(`不支持的文件：${path.basename(input)}`);
}

function convertOne(input: string): {
  doc: ArchiveDocument;
  notes: string[];
  outPath: string;
} {
  const ext = path.extname(input).toLowerCase();
  const sourceFile = path.basename(input);
  const outPath = outputPathFor(input);
  if (ext === ".xlsx") {
    const meta = groupFromFilename(input);
    const result = archiveFromXlsx(fs.readFileSync(input), {
      ...meta,
      sourceFile,
    });
    return { ...result, outPath };
  }
  if (ext === ".json") {
    const raw = fs.readFileSync(input, "utf8");
    const result = archiveFromQceExporter(raw, { sourceFile });
    if (!result.doc.groupId) {
      const meta = groupFromFilename(input);
      result.doc.groupId = meta.groupId;
      result.doc.groupName = result.doc.groupName || meta.groupName;
    }
    return { ...result, outPath };
  }
  throw new Error(`不支持的文件：${sourceFile}`);
}

function timeRange(messages: ParsedMessage[]): {
  start: string | null;
  end: string | null;
} {
  const times = messages
    .map((m) => m.sentAt)
    .filter((t): t is string => !!t)
    .sort();
  return { start: times[0] ?? null, end: times[times.length - 1] ?? null };
}

function messageKey(m: ParsedMessage): string {
  return `${m.sentAt || ""}\0${m.qq || ""}\0${m.content}`;
}

function mergeDocs(docs: ArchiveDocument[]): {
  doc: ArchiveDocument;
  dup: number;
} {
  const first = docs[0];
  const tagged = docs.flatMap((doc) =>
    doc.messages.map((m, index) => ({ m, index })),
  );
  tagged.sort((a, b) => {
    const ta = a.m.sentAt || "";
    const tb = b.m.sentAt || "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.index - b.index;
  });
  const seen = new Set<string>();
  const messages: ParsedMessage[] = [];
  let dup = 0;
  for (const row of tagged) {
    const key = messageKey(row.m);
    if (seen.has(key)) {
      dup++;
      continue;
    }
    seen.add(key);
    messages.push(row.m);
  }
  return {
    dup,
    doc: {
      format: "zzz-archive",
      version: 1,
      groupName: first.groupName,
      groupId: first.groupId,
      source: "merged",
      sourceFile: docs.map((d) => d.sourceFile).join(" + "),
      messages,
    },
  };
}

function writeDoc(outPath: string, doc: ArchiveDocument) {
  fs.writeFileSync(outPath, JSON.stringify(doc));
  const bytes = fs.statSync(outPath).size;
  const range = timeRange(doc.messages);
  const withQq = doc.messages.filter((m) => m.qq).length;
  console.log(
    [
      path.basename(outPath),
      `条数 ${doc.messages.length}`,
      `带QQ ${withQq}`,
      `时间 ${range.start || "?"} ~ ${range.end || "?"}`,
      `大小 ${(bytes / 1024 / 1024).toFixed(1)} MB`,
    ].join(" · "),
  );
}

function main() {
  const inputs = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (!inputs.length) {
    console.error("用法：npx tsx scripts/to-archive-json.ts <xlsx或json> [更多文件]");
    process.exit(1);
  }
  const converted = inputs.map((input) => {
    if (!fs.existsSync(input)) {
      throw new Error(`找不到文件：${input}`);
    }
    const result = convertOne(input);
    if (result.notes.length) {
      console.log(`${path.basename(input)}：${result.notes.join("；")}`);
    }
    writeDoc(result.outPath, result.doc);
    return result;
  });

  if (converted.length < 2) return;

  const { doc: merged, dup } = mergeDocs(converted.map((c) => c.doc));
  const dir = path.dirname(converted[converted.length - 1].outPath);
  const groupId = merged.groupId || "group";
  const mergedName = merged.groupName
    ? `group_${merged.groupName}_${groupId}.archive.json`
    : `group_${groupId}.archive.json`;
  const mergedPath = path.join(dir, mergedName);
  writeDoc(mergedPath, merged);
  console.log(`合并时去掉重复 ${dup} 条`);
}

main();
