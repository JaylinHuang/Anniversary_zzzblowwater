import { LOCAL_EMBED_MODEL, localEmbed } from "@/lib/local-embed";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
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

/** OpenAI 兼容 Chat Completions（DeepSeek / 月之暗面 / 通义等均可） */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const cfg = getLlmConfig();
  if (!cfg) throw new Error("LLM_NOT_CONFIGURED");

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: options?.temperature ?? 0.8,
      max_tokens: options?.maxTokens ?? 800,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM_HTTP_${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("LLM_EMPTY_RESPONSE");
  return content;
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
