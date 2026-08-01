export interface VoiceStreamError {
  code: string;
  message: string;
  retryAfterMs: number;
}

/** 解析网关统一的 WebSocket 错误帧，避免各语音入口各写一套降级文案。 */
export function parseVoiceStreamError(payload: unknown): VoiceStreamError | null {
  if (!payload || typeof payload !== "object") return null;
  const frame = payload as Record<string, unknown>;
  if (frame.type !== "error" || !frame.error || typeof frame.error !== "object") {
    return null;
  }
  const error = frame.error as Record<string, unknown>;
  const code = typeof error.code === "string" ? error.code : "voice_stream_error";
  const message = typeof error.message === "string" && error.message.trim()
    ? error.message.trim()
    : "语音服务暂时不可用，请稍后重试";
  const retryAfterMs = typeof error.retry_after_ms === "number"
    ? Math.max(0, Math.min(error.retry_after_ms, 30_000))
    : 0;
  return { code, message, retryAfterMs };
}
