/**
 * 语音采集的轻量客户端保护。
 *
 * 原生模块每约 100ms 上报一次归一化 RMS。连续多个分片达到门限才认为用户
 * 确实开口，避免耳机底噪、环境声或纯静音被云端 ASR 猜成一大段文字。
 */
export const SPEECH_RMS_THRESHOLD = 0.025;
export const MIN_SPEECH_CHUNKS = 3;

export type SpeechGate = {
  consecutiveVoiceChunks: number;
  detected: boolean;
};

export function createSpeechGate(): SpeechGate {
  return { consecutiveVoiceChunks: 0, detected: false };
}

export function observeSpeech(
  gate: SpeechGate,
  rms: number,
  threshold = SPEECH_RMS_THRESHOLD,
  minChunks = MIN_SPEECH_CHUNKS,
): SpeechGate {
  if (gate.detected) return gate;
  const voiced = Number.isFinite(rms) && rms >= threshold;
  const consecutiveVoiceChunks = voiced ? gate.consecutiveVoiceChunks + 1 : 0;
  return {
    consecutiveVoiceChunks,
    detected: consecutiveVoiceChunks >= minChunks,
  };
}

/**
 * 阶跃流式 ASR 的 delta.text 是“截至当前的累计全文”，不是新增 token。
 * 因此每次都必须整体替换；把 previous 再拼进去会造成整句重复。
 */
export function replaceCumulativeTranscript(
  _previous: string,
  incoming: unknown,
): string {
  return typeof incoming === "string" ? incoming : "";
}
