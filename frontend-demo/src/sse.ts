/**
 * RN SSE 读取工具。
 *
 * 普通 RN fetch 不支持流式读 res.body，故用 expo/fetch（Expo SDK 52+ 提供流式响应）。
 * 帧解析在 ./sseParse（纯函数，单测覆盖）。
 */
import { fetch as expoFetch } from "expo/fetch";

import { parseSSEFrame, type SSEEvent } from "./sseParse";

export { parseSSEFrame };
export type { SSEEvent };

export interface StreamOptions {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** 发起 SSE 请求，逐帧回调 onEvent；流结束时 resolve。失败抛 Error。 */
export async function streamSSE(
  url: string,
  body: unknown,
  onEvent: (e: SSEEvent) => void,
  opts: StreamOptions = {}
): Promise<void> {
  const res = await expoFetch(url, {
    method: opts.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(opts.headers ?? {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(detail || `SSE 请求失败 (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const evt = parseSSEFrame(frame);
      if (evt) onEvent(evt);
    }
  }
  const tail = buf.trim();
  if (tail) {
    const evt = parseSSEFrame(tail);
    if (evt) onEvent(evt);
  }
}
