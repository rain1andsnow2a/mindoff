/**
 * 语音输入钩子：按住/点击录音，松手后转文字。
 *
 * 优先走原生 PCM 采集（真机 Android）：录 16k/mono/PCM16 → 写临时 .pcm → POST /ai/stt(type=pcm)。
 * 这是因为阶跃 ASR 只吃 wav/mp3/flac/opus/pcm，而 expo-audio 在安卓只能产出 m4a，对不上。
 * 原生模块不可用时（web / 未编进原生）降级到 expo-audio 录文件上传（best-effort）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as FileSystem from "expo-file-system";
import type { EventSubscription } from "expo-modules-core";
import {
  addAudioChunkListener,
  isPcmAvailable,
  startPcmCapture,
  stopPcmCapture,
} from "mindoff-companion";

import { sttOnce, wsAuthUrl } from "./api";

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

let voiceEventId = 0;
const nextVoiceEventId = () => `voice_${Date.now()}_${++voiceEventId}`;

const STREAMING_SESSION_UPDATE = {
  type: "session.update",
  session: {
    audio: {
      input: {
        format: { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 },
        transcription: {
          model: "stepaudio-2.5-asr-stream",
          language: "zh",
          enable_itn: true,
        },
        turn_detection: { type: "server_vad", silence_duration_ms: 1200, threshold: 0.6 },
      },
    },
  },
};

export function useVoiceInput(
  onResult: (text: string) => void,
  onPartial?: (text: string) => void,
): VoiceInputState {
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 原生 PCM 路径的录音态（不经 expo-audio）
  const [pcmRecording, setPcmRecording] = useState(false);
  const usingPcm = useRef(false);
  const streamSocket = useRef<WebSocket | null>(null);
  const chunkSubscription = useRef<EventSubscription | null>(null);
  const completedTranscript = useRef("");
  const partialCallback = useRef(onPartial);
  partialCallback.current = onPartial;

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);

  const closeStreaming = useCallback(() => {
    chunkSubscription.current?.remove();
    chunkSubscription.current = null;
    const ws = streamSocket.current;
    streamSocket.current = null;
    try {
      ws?.close();
    } catch {
      /* best-effort cleanup */
    }
  }, []);

  useEffect(() => () => {
    closeStreaming();
    if (usingPcm.current) void stopPcmCapture();
  }, [closeStreaming]);

  const connectStreaming = useCallback(async (): Promise<boolean> => {
    completedTranscript.current = "";
    const ws = new WebSocket(wsAuthUrl("/ai/stt/stream"));
    streamSocket.current = ws;
    ws.onmessage = (event) => {
      let message: any;
      try {
        message = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        return;
      }
      if (message?.type === "conversation.item.input_audio_transcription.delta"
          && typeof message.text === "string") {
        partialCallback.current?.(`${completedTranscript.current}${message.text}`);
      }
      if (message?.type === "conversation.item.input_audio_transcription.completed") {
        const transcript = typeof message.transcript === "string" ? message.transcript : "";
        if (transcript) {
          completedTranscript.current += transcript;
          partialCallback.current?.(completedTranscript.current);
        }
      }
    };

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ready);
      };
      const timer = setTimeout(() => finish(false), 4000);
      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ event_id: nextVoiceEventId(), ...STREAMING_SESSION_UPDATE }));
          finish(true);
        } catch {
          finish(false);
        }
      };
      ws.onerror = () => finish(false);
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError("需要麦克风权限才能录音");
        return;
      }
      if (isPcmAvailable) {
        const streamingReady = await connectStreaming();
        const ok = await startPcmCapture();
        if (ok) {
          usingPcm.current = true;
          setPcmRecording(true);
          if (streamingReady && streamSocket.current?.readyState === WebSocket.OPEN) {
            chunkSubscription.current = addAudioChunkListener(({ base64 }) => {
              if (streamSocket.current?.readyState === WebSocket.OPEN) {
                streamSocket.current.send(JSON.stringify({
                  event_id: nextVoiceEventId(),
                  type: "input_audio_buffer.append",
                  audio: base64,
                }));
              }
            });
          } else {
            // 流式链路不可用时保留原有整段识别，用户仍可正常录音。
            closeStreaming();
          }
          return;
        }
        closeStreaming();
      }
      usingPcm.current = false;
      await recorder.record();
    } catch (e: any) {
      setError(e?.message || "无法启动录音");
    }
  }, [closeStreaming, connectStreaming, recorder]);

  const stop = useCallback(async () => {
    try {
      if (usingPcm.current) {
        setPcmRecording(false);
        chunkSubscription.current?.remove();
        chunkSubscription.current = null;
        const base64 = await stopPcmCapture();
        usingPcm.current = false;
        closeStreaming();
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
  }, [closeStreaming, recorder, state.isRecording, onResult]);

  return {
    isRecording: usingPcm.current ? pcmRecording : state.isRecording,
    transcribing,
    error,
    durationMillis: state.durationMillis,
    start,
    stop,
  };
}
