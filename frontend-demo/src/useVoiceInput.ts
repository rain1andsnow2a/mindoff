/**
 * 语音输入钩子：按住/点击录音，松手后转文字。
 *
 * 优先走原生 PCM 采集（真机 Android）：录 16k/mono/PCM16 → 写临时 .pcm → POST /ai/stt(type=pcm)。
 * 这是因为阶跃 ASR 只吃 wav/mp3/flac/opus/pcm，而 expo-audio 在安卓只能产出 m4a，对不上。
 * 原生模块不可用时（web / 未编进原生）降级到 expo-audio 录文件上传（best-effort）。
 */
import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as FileSystem from "expo-file-system";
import {
  isPcmAvailable,
  startPcmCapture,
  stopPcmCapture,
} from "mindoff-companion";

import { sttOnce } from "./api";

export interface VoiceInputState {
  isRecording: boolean;
  transcribing: boolean;
  error: string | null;
  durationMillis: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/** 根据平台推断 expo-audio HIGH_QUALITY 的实际录音格式（仅降级路径用）。 */
function recordingType(): string {
  if (Platform.OS === "web") return "webm";
  return "m4a";
}

/** 把整段 base64 PCM 落到临时文件，返回可上传的 file uri。 */
async function writePcmTemp(base64: string): Promise<string> {
  const uri = `${FileSystem.cacheDirectory}stt-${Date.now()}.pcm`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

export function useVoiceInput(onResult: (text: string) => void): VoiceInputState {
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 原生 PCM 路径的录音态（不经 expo-audio）
  const [pcmRecording, setPcmRecording] = useState(false);
  const usingPcm = useRef(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);

  const start = useCallback(async () => {
    setError(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError("需要麦克风权限才能录音");
        return;
      }
      if (isPcmAvailable) {
        const ok = await startPcmCapture();
        if (ok) {
          usingPcm.current = true;
          setPcmRecording(true);
          return;
        }
      }
      usingPcm.current = false;
      await recorder.record();
    } catch (e: any) {
      setError(e?.message || "无法启动录音");
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    try {
      if (usingPcm.current) {
        setPcmRecording(false);
        const base64 = await stopPcmCapture();
        usingPcm.current = false;
        if (!base64) {
          setError("录音保存失败");
          return;
        }
        setTranscribing(true);
        const uri = await writePcmTemp(base64);
        const { text } = await sttOnce(uri, "pcm");
        if (text) onResult(text);
        return;
      }

      if (!state.isRecording) return;
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setError("录音保存失败");
        return;
      }
      setTranscribing(true);
      const { text } = await sttOnce(uri, recordingType());
      if (text) onResult(text);
    } catch (e: any) {
      setError(e?.message || "语音识别失败");
    } finally {
      setTranscribing(false);
    }
  }, [recorder, state.isRecording, onResult]);

  return {
    isRecording: usingPcm.current ? pcmRecording : state.isRecording,
    transcribing,
    error,
    durationMillis: state.durationMillis,
    start,
    stop,
  };
}
