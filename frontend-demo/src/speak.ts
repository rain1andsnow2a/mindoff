/**
 * 桌宠语音回复：设备端 TTS（expo-speech，中文）。
 *
 * 「桌宠语音回复」开关开启时，用它把桌宠的文字回复读出来。
 * 说明：这是设备内置嗓音；换成米露/波比的专属音色需走 StepFun TTS 或
 * 实时音频管道（后端），属后续升级。web / 无 TTS 环境自动静默降级。
 */
import * as Speech from "expo-speech";

export function speakReply(text: string): void {
  const t = (text || "").trim();
  if (!t) return;
  try {
    Speech.stop();
    Speech.speak(t, { language: "zh-CN", rate: 1.0, pitch: 1.05 });
  } catch {
    /* 无 TTS 环境（如 web）静默降级 */
  }
}

export function stopSpeaking(): void {
  try {
    Speech.stop();
  } catch {
    /* ignore */
  }
}
