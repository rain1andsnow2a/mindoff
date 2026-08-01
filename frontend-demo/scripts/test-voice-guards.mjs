import assert from "node:assert/strict";
import {
  createSpeechGate,
  observeSpeech,
  replaceCumulativeTranscript,
} from "../src/voice/speechGuards.ts";

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

console.log("voice guards: all assertions passed");
