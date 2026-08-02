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
};

/** 统一 fetch：解析 JSON、抛出可读错误 */
export async function apiFetch<T = unknown>(
  url: string,
  options: ApiOptions = {},
): Promise<T> {
  const { json = true, headers, body, ...rest } = options;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    ...rest,
    body,
    headers: isForm
      ? headers
      : {
          "Content-Type": "application/json",
          ...headers,
        },
  });

  const text = await res.text();
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
