/**
 * 工具注册表。借 DeepSeek Harness 的分层：回路只认注册表，不认具体实现。
 *
 * 本站不是编程助手，所以注册表里只有四件事：
 * 查自己这位用户的长期记忆、写或覆盖一条记忆、在整个群聊里找是谁说了什么、记一条本轮工作记忆。
 * 没有 shell、没有读写文件、不跑代码、不联网搜索。
 */
import type { LlmToolSpec } from "@/lib/llm";

export type ToolArgs = Record<string, unknown>;

export type MemoryHit = { fact: string; topic: string; score: number };

/** 工具实际干活的接口。生产接数据库和检索，自测接内存库和假数据 */
export type ToolPorts = {
  searchMemory(query: string, limit: number): Promise<MemoryHit[]>;
  remember(input: {
    fact: string;
    topic?: string;
    importance?: number;
  }): Promise<{ saved: boolean; replaced: number; reason?: string }>;
  searchGroupLines(query: string, limit: number): Promise<string[]>;
  workingNote(note: string, step: number): Promise<void>;
};

export type ToolContext = {
  /** 当前是这一轮的第几步 */
  step: number;
  /** 对面是哪位网站用户已经确认。没确认就不准碰私聊记忆 */
  identified: boolean;
  ports: ToolPorts;
};

export type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run(args: ToolArgs, ctx: ToolContext): Promise<string>;
};

export const AGENT_TOOL_NAMES = [
  "search_memory",
  "remember",
  "search_group_lines",
  "working_note",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/** 这些名字一旦出现在注册表里就是跑偏了，自检直接报错 */
export const FORBIDDEN_TOOL_NAMES = [
  "shell",
  "bash",
  "sh",
  "exec",
  "run_command",
  "terminal",
  "read_file",
  "write_file",
  "edit_file",
  "list_dir",
  "run_code",
  "python",
  "node",
  "web_search",
  "browser",
  "fetch_url",
  "http_request",
];

function readString(args: ToolArgs, key: string): string {
  const value = args?.[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function readNumber(args: ToolArgs, key: string): number | null {
  const value = args?.[key];
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function readBool(args: ToolArgs, key: string): boolean {
  const value = args?.[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return /^(1|true|yes|是)$/i.test(value.trim());
  return false;
}

function clampLimit(n: number | null, fallback: number, max: number): number {
  if (n === null) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

export function buildToolRegistry(): ToolDef[] {
  return [
    {
      name: "search_memory",
      description:
        "查你和当前这位用户之间的长期记忆。只返回这位用户的记忆，查不到别人的。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "要查什么，用关键词或原话" },
          limit: { type: "integer", description: "最多返回几条，默认 5" },
        },
        required: ["query"],
      },
      async run(args, ctx) {
        const query = readString(args, "query");
        if (!query) return "没给查询词，这次什么都没查。";
        if (!ctx.identified) {
          return "还没确认对面是哪位网站用户，这一轮不读私聊记忆。";
        }
        const limit = clampLimit(readNumber(args, "limit"), 5, 10);
        const hits = await ctx.ports.searchMemory(query, limit);
        if (!hits.length) return `关于「${query}」，长期记忆里没有。`;
        return [
          `关于「${query}」查到 ${hits.length} 条长期记忆：`,
          ...hits.map(
            (hit, i) =>
              `${i + 1}. ${hit.fact}（主题：${hit.topic}，分数 ${hit.score.toFixed(3)}）`,
          ),
        ].join("\n");
      },
    },
    {
      name: "remember",
      description:
        "把一条事实写进你和当前这位用户的长期记忆。同一主题已有旧事实时，旧的被这条取代，不会两条并存。",
      parameters: {
        type: "object",
        properties: {
          fact: { type: "string", description: "要记住的一句事实" },
          topic: {
            type: "string",
            description: "主题键，例如 称呼 / 房间 / 生日。不给就自动归类",
          },
          important: {
            type: "boolean",
            description: "用户点名要记住、或者是救命级别的信息时为 true",
          },
        },
        required: ["fact"],
      },
      async run(args, ctx) {
        const fact = readString(args, "fact");
        if (!fact) return "没给内容，这条没有写进去。";
        if (!ctx.identified) {
          return "还没确认对面是哪位网站用户，这一轮不写私聊记忆。";
        }
        const topic = readString(args, "topic") || undefined;
        const important = readBool(args, "important");
        const out = await ctx.ports.remember({
          fact,
          topic,
          importance: important ? 1 : 0.6,
        });
        if (!out.saved) return `没有写进去：${out.reason || "内容不合格"}`;
        return out.replaced > 0
          ? `已记住，并且取代了同主题的 ${out.replaced} 条旧记忆：${fact}`
          : `已记住：${fact}`;
      },
    },
    {
      name: "search_group_lines",
      description:
        "在整个群聊里找某个人或某件事，问你自己时也查。返回的每条会写明时间和是谁说的。互相矛盾时以时间更晚的那条为准，不要整句贴成回复。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "要找哪方面的原话" },
          limit: { type: "integer", description: "最多返回几条，默认 5" },
        },
        required: ["query"],
      },
      async run(args, ctx) {
        const query = readString(args, "query");
        if (!query) return "没给查询词，这次什么都没查。";
        const limit = clampLimit(readNumber(args, "limit"), 5, 10);
        const lines = await ctx.ports.searchGroupLines(query, limit);
        if (!lines.length) {
          return `关于「${query}」，群聊里没有对上的发言。具体战绩和水平不要编；问看法时也不要凭空安一个性格。`;
        }
        return [
          `关于「${query}」，群聊里有这些发言。用来形成印象，不要整句贴回去：`,
          ...lines.map((line, i) => `${i + 1}. ${line}`),
        ].join("\n");
      },
    },
    {
      name: "working_note",
      description:
        "记一条本轮工作记忆：查过什么、打算怎么答。只在这一轮有效，不会变成长期记忆。",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string", description: "本轮的中间状态" },
        },
        required: ["note"],
      },
      async run(args, ctx) {
        const note = readString(args, "note");
        if (!note) return "没给内容，这条工作记忆没有记。";
        await ctx.ports.workingNote(note, ctx.step);
        return `第 ${ctx.step} 步的工作记忆已记下。`;
      },
    },
  ];
}

export function toolSpecs(defs: ToolDef[]): LlmToolSpec[] {
  return defs.map((def) => ({
    name: def.name,
    description: def.description,
    parameters: def.parameters,
  }));
}

export function findTool(defs: ToolDef[], name: string): ToolDef | null {
  return defs.find((def) => def.name === name) || null;
}

/** 注册表自检：只能是约定的四个工具，不能混进执行类工具 */
export function assertSafeRegistry(defs: ToolDef[]): ToolDef[] {
  const names = defs.map((def) => def.name);
  if (new Set(names).size !== names.length) {
    throw new Error("工具注册表里有重名");
  }
  for (const name of names) {
    if (!(AGENT_TOOL_NAMES as readonly string[]).includes(name)) {
      throw new Error(`不允许的工具：${name}`);
    }
    if (FORBIDDEN_TOOL_NAMES.includes(name)) {
      throw new Error(`禁止注册执行类工具：${name}`);
    }
  }
  return defs;
}
