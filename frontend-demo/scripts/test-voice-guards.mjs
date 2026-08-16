import assert from "node:assert/strict";
import {
  createSpeechGate,
  isLikelyPlaybackEcho,
  observeSpeech,
  playbackEchoSimilarity,
  replaceCumulativeTranscript,
} from "../src/voice/speechGuards.ts";
import { parseVoiceStreamError } from "../src/voice/streamErrors.ts";

let gate = createSpeechGate();
for (const rms of [0.002, 0.009, 0.018, 0.003, 0.02]) {
  gate = observeSpeech(gate, rms);
}
assert.equal(gate.detected, false, "持续静音/底噪不应开启转写");

gate = createSpeechGate();
gate = observeSpeech(gate, 0.04);
gate = observeSpeech(gate, 0.05);
assert.equal(gate.detected, false, "短促噪声不应被当成人声");
gate = observeSpeech(gate, 0.06);
assert.equal(gate.detected, true, "连续清晰人声应通过门限");

gate = createSpeechGate();
gate = observeSpeech(gate, 0.05);
gate = observeSpeech(gate, 0.004);
gate = observeSpeech(gate, 0.05);
gate = observeSpeech(gate, 0.05);
assert.equal(gate.detected, false, "不连续的环境脉冲不应累计");

assert.equal(
  replaceCumulativeTranscript("我想回到小时候", "我想回到小时候的那条河边"),
  "我想回到小时候的那条河边",
  "累计 delta 必须整体替换，不能把旧全文再拼一次",
);

const petReply = "哈喽呀～刚醒还是刚出门？重庆今天八点就31度了，出门记得带瓶冰水呀。";
const speakerEcho = "Hello呀，刚醒还是刚出门？重庆今天八点就三十一度了，出门记得带瓶冰水啊。";
assert.ok(
  playbackEchoSimilarity(petReply, speakerEcho) >= 0.72,
  "同一句 TTS 被 ASR 改写少量字符后仍应保持高相似度",
);
assert.equal(
  isLikelyPlaybackEcho(speakerEcho, petReply),
  true,
  "最近播放的喵灵回复不应重新成为用户输入",
);
assert.equal(
  isLikelyPlaybackEcho("我不是在重复，我想问明天会不会下雨", petReply),
  false,
  "无关的真实用户发言不能被回声兜底误杀",
);
assert.equal(
  isLikelyPlaybackEcho("带瓶冰水", petReply),
  false,
  "过短的局部重复不能直接判为扬声器回声",
);

assert.deepEqual(
  parseVoiceStreamError({
    type: "error",
    error: {
      code: "upstream_rate_limited",
      message: "语音服务正在忙，请稍等几秒再试",
      retry_after_ms: 3000,
    },
  }),
  {
    code: "upstream_rate_limited",
    message: "语音服务正在忙，请稍等几秒再试",
    retryAfterMs: 3000,
  },
  "上游 429 应转换为可展示、可冷却的客户端错误",
);
assert.equal(parseVoiceStreamError({ type: "session.updated" }), null);

console.log("voice guards: all assertions passed");
