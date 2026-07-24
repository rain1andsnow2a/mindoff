/**
 * SSE 帧解析——纯函数、无任何依赖，便于 node 单测。
 * 后端 SSE 帧：多行 `event: xxx` / `data: {...}`，帧之间空行分隔。
 */
export interface SSEEvent {
  event: string;
  data: any;
}

export function parseSSEFrame(frame: string): SSEEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const raw of frame.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue; // 空行 / 注释
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  const text = dataLines.join("\n");
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* 保留原始字符串 */
  }
  return { event, data };
}
