/**
 * 管理后台看的运行日志。
 * 只留短句，追加到 data/logs，不写进 sql.js，避免每记一条就把整库再导出一次。
 */
import fs from "fs";
import path from "path";

export type SiteLogLevel = "info" | "warn" | "error";

export type SiteLogEntry = {
  at: string;
  level: SiteLogLevel;
  scope: string;
  message: string;
  rssMb: number;
  heapMb: number;
};

const RING_MAX = 80;
const FILE_MAX = 200_000;
const ring: SiteLogEntry[] = [];

function logDir(): string {
  return path.join(process.cwd(), "data", "logs");
}

function logFile(): string {
  return path.join(logDir(), "site.log");
}

function beijingStamp(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const num = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  let hour = num("hour");
  if (hour === "24") hour = "00";
  return `${num("year")}-${num("month")}-${num("day")} ${hour}:${num("minute")}:${num("second")}`;
}

/** 去掉长数字、邮箱和密钥，日志里不留 QQ 和口令 */
export function redactLogText(raw: string): string {
  return String(raw || "")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-#")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "#@#")
    .replace(/\d{5,}/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function memoryMb(): { rssMb: number; heapMb: number } {
  const mem = process.memoryUsage();
  return {
    rssMb: Math.round(mem.rss / (1024 * 1024)),
    heapMb: Math.round(mem.heapUsed / (1024 * 1024)),
  };
}

function appendFile(entry: SiteLogEntry) {
  try {
    const dir = logDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = logFile();
    if (fs.existsSync(file) && fs.statSync(file).size > FILE_MAX) {
      const prev = `${file}.1`;
      if (fs.existsSync(prev)) fs.unlinkSync(prev);
      fs.renameSync(file, prev);
    }
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
  } catch {
    /* 磁盘写失败时内存里仍有这一条 */
  }
}

function parseLine(line: string): SiteLogEntry | null {
  try {
    const row = JSON.parse(line) as SiteLogEntry;
    if (!row || !row.at || !row.message) return null;
    if (row.level !== "info" && row.level !== "warn" && row.level !== "error") return null;
    return {
      at: String(row.at),
      level: row.level,
      scope: redactLogText(String(row.scope || "site")).slice(0, 24),
      message: redactLogText(String(row.message)),
      rssMb: Number(row.rssMb) || 0,
      heapMb: Number(row.heapMb) || 0,
    };
  } catch {
    return null;
  }
}

function readFileTail(): SiteLogEntry[] {
  const chunks: string[] = [];
  for (const name of [`${logFile()}.1`, logFile()]) {
    try {
      if (!fs.existsSync(name)) continue;
      chunks.push(fs.readFileSync(name, "utf8"));
    } catch {
      /* 读不到就跳过 */
    }
  }
  const lines = chunks.join("\n").split("\n").filter(Boolean);
  const out: SiteLogEntry[] = [];
  for (const line of lines.slice(-RING_MAX)) {
    const row = parseLine(line);
    if (row) out.push(row);
  }
  return out;
}

/** 记一条。scope 用英文短词，message 用中文短句 */
export function siteLog(level: SiteLogLevel, scope: string, message: string) {
  const entry: SiteLogEntry = {
    at: beijingStamp(),
    level,
    scope: redactLogText(scope).slice(0, 24) || "site",
    message: redactLogText(message) || "（空）",
    ...memoryMb(),
  };
  ring.push(entry);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  appendFile(entry);
}

/** 管理后台读取。文件里的记录能活过重启，内存里的是这一进程刚写下的 */
export function readSiteLog(): {
  entries: SiteLogEntry[];
  rssMb: number;
  heapMb: number;
  uptimeSec: number;
} {
  const merged = [...readFileTail()];
  for (const entry of ring) {
    const seen = merged.some(
      (item) =>
        item.at === entry.at &&
        item.scope === entry.scope &&
        item.message === entry.message,
    );
    if (!seen) merged.push(entry);
  }
  const mem = memoryMb();
  return {
    entries: merged.slice(-RING_MAX).reverse(),
    rssMb: mem.rssMb,
    heapMb: mem.heapMb,
    uptimeSec: Math.round(process.uptime()),
  };
}
