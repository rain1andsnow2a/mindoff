/**
 * 桌宠语音回复：阶跃 TTS（后端 /ai/tts）+ expo-audio 播放。
 *
 * 「桌宠语音回复」开关开启时，用它把桌宠的文字回复读出来。
 * 音色为阶跃「元气少女」(yuanqishaonv)，偏可爱活泼；不再使用设备内置嗓音。
 * 链路：文本 -> 后端 /ai/tts（阶跃合成并转存）-> 返回 mp3 URL -> createAudioPlayer 播放。
 * 合成失败 / web 无播放器时静默降级（仍保留字幕）。
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

import { absUrl, synthTts } from "./api";

let _player: AudioPlayer | null = null;
// 递增序号：新的一句合成开始时作废前一句，避免旧音频抢在新音频后面播放
let _seq = 0;

function releasePlayer(): void {
  const p = _player;
  _player = null;
  try {
    p?.remove();
  } catch {
    /* ignore */
  }
}

/** 合成并播放（fire-and-forget）。调用方无需 await。 */
export function speakReply(text: string): void {
  const t = (text || "").trim();
  if (!t) return;
  stopSpeaking(); // 打断上一句
  const seq = ++_seq;

  void (async () => {
    try {
      const { url } = await synthTts(t);
      const full = absUrl(url);
      // 期间被打断（用户又说话 / 挂断），丢弃这次播放
      if (seq !== _seq || !full) return;

      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      if (seq !== _seq) return;

      const player = createAudioPlayer({ uri: full });
      _player = player;
      // 播完自动释放，避免播放器堆积
      player.addListener("playbackStatusUpdate", (s) => {
        if (s.didJustFinish && _player === player) releasePlayer();
      });
      player.play();
    } catch {
      /* 合成/播放失败静默降级：仍有字幕 */
    }
  })();
}

export function stopSpeaking(): void {
  _seq++; // 作废进行中的合成
  releasePlayer();
}
