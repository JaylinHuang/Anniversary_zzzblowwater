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
  return getEmbeddingConfig() !== null;
}

/** 批量向量化；单次请求最多 64 条 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const cfg = getEmbeddingConfig();
  if (!cfg) throw new Error("EMBEDDING_NOT_CONFIGURED");
  if (!texts.length) return [];

  const out: number[][] = [];
  const batchSize = 64;
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
      throw new Error(`EMBEDDING_HTTP_${res.status}: ${text.slice(0, 300)}`);
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
