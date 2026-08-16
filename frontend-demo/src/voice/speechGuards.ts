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

/**
 * 回声比较只保留字母与数字：ASR 常把标点、空格、语气词和数字写法稍作变化，
 * 不能依赖逐字相等。NFKC 同时统一全角/半角字符。
 */
export function normalizeEchoText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** 字符 bigram Dice 系数；比编辑距离更适合中文长句中的少量同音/标点差异。 */
export function playbackEchoSimilarity(first: unknown, second: unknown): number {
  const a = normalizeEchoText(first);
  const b = normalizeEchoText(second);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const pair = a.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }

  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const pair = b.slice(i, i + 2);
    const remaining = counts.get(pair) ?? 0;
    if (remaining <= 0) continue;
    overlap += 1;
    counts.set(pair, remaining - 1);
  }
  return (2 * overlap) / (a.length + b.length - 2);
}

/**
 * 是否很可能是扬声器回灌的 TTS。只对足够长且长度接近的句子生效，降低用户
 * 短句恰好重复几个词时被误杀的概率；调用方还必须限制在最近播放时间窗内。
 */
export function isLikelyPlaybackEcho(
  transcript: unknown,
  spokenText: unknown,
  threshold = 0.72,
): boolean {
  const heard = normalizeEchoText(transcript);
  const spoken = normalizeEchoText(spokenText);
  if (heard.length < 8 || spoken.length < 8) return false;

  const lengthRatio = Math.min(heard.length, spoken.length) / Math.max(heard.length, spoken.length);
  if (lengthRatio < 0.55) return false;
  if ((heard.includes(spoken) || spoken.includes(heard)) && lengthRatio >= 0.62) return true;
  return playbackEchoSimilarity(heard, spoken) >= threshold;
}
