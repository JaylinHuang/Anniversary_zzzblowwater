import { LOCAL_EMBED_MODEL, localEmbed } from "@/lib/local-embed";

/** 模型发起的一次工具调用。arguments 是模型给的 JSON 字符串，原样保留 */
export type ToolCallRequest = {
  id: string;
  name: string;
  arguments: string;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** 助手这一步发起的工具调用。回灌给模型时必须原样带上，否则工具结果对不上号 */
  toolCalls?: ToolCallRequest[];
  /** 工具结果所回应的那次调用编号，role 为 tool 时必填 */
  toolCallId?: string;
};

/** OpenAI 兼容的工具声明（DeepSeek 用的是同一套 tools / tool_calls） */
export type LlmToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** 一次模型请求的结果：可能是给用户的话，也可能只是一串工具调用 */
export type ChatTurnResult = {
  content: string;
  toolCalls: ToolCallRequest[];
};

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type EmbeddingConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export function getLlmConfig(): LlmConfig | null {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = (
    process.env.LLM_API_BASE || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = process.env.LLM_MODEL?.trim() || "gpt-4o-mini";
  return { baseUrl, apiKey, model };
}

export function isLlmConfigured() {
  return getLlmConfig() !== null;
}

/**
 * OpenAI 兼容 Embeddings。
 * 可用 EMBEDDING_API_BASE / EMBEDDING_API_KEY 单独配置；
 * 否则回落到 LLM_*（DeepSeek 等可能无 embeddings，需换支持的端点）。
 */
export function getEmbeddingConfig(): EmbeddingConfig | null {
  const apiKey =
    process.env.EMBEDDING_API_KEY?.trim() ||
    process.env.LLM_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = (
    process.env.EMBEDDING_API_BASE ||
    process.env.LLM_API_BASE ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model =
    process.env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
  return { baseUrl, apiKey, model };
}

export function isEmbeddingConfigured() {
  return true;
}

export type EmbedBackend = { model: string; local: boolean };

let resolvedBackend: EmbedBackend | null = null;

function localBackend(): EmbedBackend {
  return { model: LOCAL_EMBED_MODEL, local: true };
}

/** 云端业务空间拒绝密钥时，改用本地字面向量，避免索引按钮直接失败 */
export async function resolveEmbedBackend(): Promise<EmbedBackend> {
  if (resolvedBackend) return resolvedBackend;
  const cfg = getEmbeddingConfig();
  if (!cfg) {
    resolvedBackend = localBackend();
    return resolvedBackend;
  }
  try {
    await embedRemote(cfg, ["通"]);
    resolvedBackend = { model: cfg.model, local: false };
  } catch (err) {
    if (!isEmbedAccessError(err)) throw err;
    resolvedBackend = localBackend();
  }
  return resolvedBackend;
}

function isEmbedAccessError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : "";
  return msg.includes("拒绝访问") || msg.includes("鉴权失败") || msg.includes("地址不对");
}

/** 批量向量化。百炼这个兼容接口单批最多 10 条，本地则逐条哈希 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const backend = await resolveEmbedBackend();
  if (backend.local) return texts.map((text) => localEmbed(text));
  const cfg = getEmbeddingConfig();
  if (!cfg) return texts.map((text) => localEmbed(text));
  return embedRemote(cfg, texts);
}

async function embedRemote(
  cfg: EmbeddingConfig,
  texts: string[],
): Promise<number[][]> {
  const out: number[][] = [];
  const batchSize = 10;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map((t) => t.slice(0, 2000));
    const res = await fetch(`${cfg.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        input: batch,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(explainEmbeddingHttpError(res.status, text));
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
    };
    const items = [...(data.data || [])].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    );
    if (items.length !== batch.length) {
      throw new Error("EMBEDDING_COUNT_MISMATCH");
    }
    for (const item of items) {
      if (!item.embedding?.length) throw new Error("EMBEDDING_EMPTY");
      out.push(item.embedding);
    }
  }
  return out;
}

/** 把向量接口的 HTTP 错误收成可直接展示的中文，避免把原始 JSON 抛到页面上 */
function explainEmbeddingHttpError(status: number, body: string): string {
  const snippet = body.slice(0, 300);
  if (
    status === 403 &&
    /access_denied|Workspace endpoint access denied/i.test(snippet)
  ) {
    return "向量接口拒绝访问：当前密钥不能调用这个业务空间。请换成该空间自己的 API Key，或把 EMBEDDING_API_BASE 改成该密钥所属空间的地址（需以 /compatible-mode/v1 结尾），然后重启服务再重建索引。";
  }
  if (status === 401 || status === 403) {
    return "向量接口鉴权失败。请检查 EMBEDDING_API_KEY 是否属于 EMBEDDING_API_BASE 对应的业务空间。";
  }
  if (status === 404) {
    return "向量接口地址不对（404）。EMBEDDING_API_BASE 需要是 OpenAI 兼容根路径，例如以 /compatible-mode/v1 结尾，程序会自行请求 /embeddings。";
  }
  let detail = "";
  try {
    const data = JSON.parse(body) as { error?: { message?: string }; message?: string };
    detail = data.error?.message || data.message || "";
  } catch {
    detail = "";
  }
  const brief = detail.replace(/\s+/g, " ").slice(0, 120);
  return `向量接口返回 ${status}${brief ? `：${brief}` : ""}，索引未建立。`;
}

/** 内部消息转成 OpenAI 线上格式。工具相关字段只在用到时才出现 */
function toWireMessage(msg: ChatMessage): Record<string, unknown> {
  if (msg.role === "tool") {
    return {
      role: "tool",
      tool_call_id: msg.toolCallId || "",
      content: msg.content,
    };
  }
  if (msg.role === "assistant" && msg.toolCalls?.length) {
    return {
      role: "assistant",
      content: msg.content || null,
      tool_calls: msg.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: msg.role, content: msg.content };
}

/**
 * OpenAI 兼容 Chat Completions，带工具调用。
 * 不传 tools 时和原来的纯文本请求完全一样。
 */
export async function chatCompletionWithTools(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    tools?: LlmToolSpec[];
  },
): Promise<ChatTurnResult> {
  const cfg = getLlmConfig();
  if (!cfg) throw new Error("LLM_NOT_CONFIGURED");

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: messages.map(toWireMessage),
    temperature: options?.temperature ?? 0.8,
    max_tokens: options?.maxTokens ?? 800,
  };
  if (options?.tools?.length) {
    body.tools = options.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    body.tool_choice = "auto";
  }

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM_HTTP_${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };
  const message = data.choices?.[0]?.message;
  const content = (message?.content || "").trim();
  const toolCalls: ToolCallRequest[] = (message?.tool_calls || [])
    .map((call, index) => ({
      id: call.id || `call_${index}`,
      name: call.function?.name || "",
      arguments: call.function?.arguments || "{}",
    }))
    .filter((call) => Boolean(call.name));
  if (!content && !toolCalls.length) throw new Error("LLM_EMPTY_RESPONSE");
  return { content, toolCalls };
}

/** 只要文本的老调用方继续用这个：返回值仍是字符串 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const out = await chatCompletionWithTools(messages, options);
  if (!out.content) throw new Error("LLM_EMPTY_RESPONSE");
  return out.content;
}

export async function chatCompletionJson<T>(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<T> {
  const raw = await chatCompletion(messages, options);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = (fenced?.[1] || raw).trim();
  return JSON.parse(jsonText) as T;
}
