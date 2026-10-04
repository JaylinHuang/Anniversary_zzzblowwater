export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiOptions = RequestInit & {
  /** 默认 true：按 JSON 解析；FormData 时自动不设 Content-Type */
  json?: boolean;
  /** 可选：请求超时毫秒数；不传则不设超时。超时会中止请求并抛出 ApiError（status 为 0） */
  timeoutMs?: number;
};

/** 请求超时错误的状态码标记（非 HTTP 状态） */
export const API_TIMEOUT_STATUS = 0;

/** 判断是否为请求层超时错误 */
export function isApiTimeout(err: unknown): boolean {
  return err instanceof ApiError && err.status === API_TIMEOUT_STATUS;
}

/** 统一 fetch：解析 JSON、抛出可读错误 */
export async function apiFetch<T = unknown>(
  url: string,
  options: ApiOptions = {},
): Promise<T> {
  const { json = true, headers, body, timeoutMs, signal, ...rest } = options;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;

  // 超时控制：用内部 AbortController 中止请求，同时兼容调用方传入的 signal
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onOuterAbort, { once: true });
  }
  if (typeof timeoutMs === "number" && timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }

  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      ...rest,
      body,
      signal: controller.signal,
      headers: isForm
        ? headers
        : {
            "Content-Type": "application/json",
            ...headers,
          },
    });
    // 读取响应体也在超时保护范围内（响应头到了但正文一直不来同样会被中止）
    text = await res.text();
  } catch (err) {
    if (timedOut) {
      throw new ApiError("请求超时，请稍后重试", API_TIMEOUT_STATUS);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }

  let data: { error?: string } & Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new ApiError(
          res.status >= 500 ? "服务器异常，请稍后重试" : "请求失败",
          res.status,
        );
      }
      if (json) {
        throw new ApiError("响应不是合法 JSON", res.status);
      }
    }
  }

  if (!res.ok) {
    throw new ApiError(
      String(data.error || `请求失败（${res.status}）`),
      res.status,
    );
  }

  return data as T;
}
