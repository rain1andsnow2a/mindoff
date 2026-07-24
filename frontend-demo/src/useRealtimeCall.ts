/**
 * 实时语音通话钩子（桌宠版·文字回复）。
 *
 * 链路：麦克风裸 PCM → WS /ai/stt/stream（开 server_vad，服务端自动断句）
 *   → conversation.item.input_audio_transcription.delta/completed
 *   → 整句喂带记忆的 /conversations/{id}/messages（streamChatReply）
 *   → 桌宠逐字文字回复。
 *
 * 仅真机 Android（原生 PCM 模块）可用；web/未编进原生时 available=false，由页面提示。
 */
import { useCallback, useRef, useState } from "react";
import { requestRecordingPermissionsAsync } from "expo-audio";
import {
  addAudioChunkListener,
  isPcmAvailable,
  startPcmCapture,
  stopPcmCapture,
} from "mindoff-companion";
import type { EventSubscription } from "expo-modules-core";

import { createConversation, getActivePet, streamChatReply, wsUrl } from "./api";
import { speakReply, stopSpeaking } from "./speak";

export type CallStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "ended"
  | "error";

export interface CallTurn {
  id: number;
  role: "user" | "pet";
  text: string;
}

export interface RealtimeCall {
  available: boolean;
  status: CallStatus;
  /** 当前正在说、尚未定稿的用户转写（累计全量，整体替换展示）。 */
  liveUser: string;
  /** 已定稿的对话轮次（用户整句 + 桌宠回复）。 */
  turns: CallTurn[];
  /** 麦克风音量 0~1，用于律动 UI。 */
  level: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

let _eid = 0;
const eid = () => `evt_${Date.now()}_${++_eid}`;

const SESSION_UPDATE = {
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
        // server_vad：threshold 越高越不灵敏（需更清晰人声才触发，抗风声/背景噪音）；
        // silence_duration_ms 为判定「说完了」所需的静音时长，略放长避免噪音频繁误触发断句。
        turn_detection: { type: "server_vad", silence_duration_ms: 1000, threshold: 0.72 },
      },
    },
  },
};

export function useRealtimeCall(voiceReply: boolean): RealtimeCall {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [liveUser, setLiveUser] = useState("");
  const [turns, setTurns] = useState<CallTurn[]>([]);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const subRef = useRef<EventSubscription | null>(null);
  const convIdRef = useRef<number | null>(null);
  const closedRef = useRef(false);
  const turnIdRef = useRef(0);
  // 语音回复开关的最新值（用 ref 避免回调闭包读到旧值）
  const voiceReplyRef = useRef(voiceReply);
  voiceReplyRef.current = voiceReply;

  const addTurn = useCallback((role: "user" | "pet", text: string): number => {
    const id = ++turnIdRef.current;
    setTurns((prev) => [...prev, { id, role, text }]);
    return id;
  }, []);

  const cleanup = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    void stopPcmCapture();
    const ws = wsRef.current;
    wsRef.current = null;
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    stopSpeaking();
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    closedRef.current = true;
    cleanup();
    setStatus("ended");
  }, [cleanup]);

  // 用户整句定稿 → 走带记忆的 chat，桌宠逐字回复
  const handleUtterance = useCallback(
    (text: string) => {
      const clean = text.trim();
      const convId = convIdRef.current;
      if (!clean || convId == null) return;
      setLiveUser("");
      addTurn("user", clean);
      const petId = addTurn("pet", "");
      setStatus("thinking");
      let full = "";
      streamChatReply(convId, clean, (delta) => {
        full += delta;
        setTurns((prev) =>
          prev.map((t) => (t.id === petId ? { ...t, text: t.text + delta } : t))
        );
      })
        .catch((e: any) => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === petId && !t.text
                ? { ...t, text: e?.message || "刚刚没接住，你再说一遍？" }
                : t
            )
          );
        })
        .finally(() => {
          if (!closedRef.current) {
            setStatus("listening");
            if (voiceReplyRef.current) speakReply(full);
          }
        });
    },
    [addTurn]
  );

  const start = useCallback(async () => {
    if (!isPcmAvailable) {
      setError("实时通话需在真机上使用");
      setStatus("error");
      return;
    }
    setError(null);
    setTurns([]);
    setLiveUser("");
    closedRef.current = false;
    setStatus("connecting");

    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError("需要麦克风权限才能通话");
        setStatus("error");
        return;
      }

      // 复用一个会话，桌宠在整通话里有记忆连续性
      let petId: number | null = null;
      try {
        const pet = await getActivePet();
        petId = pet?.id ?? null;
      } catch {
        /* 无主桌宠也能聊 */
      }
      const conv = await createConversation(petId, "free_chat");
      convIdRef.current = conv.id;

      const ws = new WebSocket(wsUrl("/ai/stt/stream"));
      wsRef.current = ws;

      ws.onopen = async () => {
        if (closedRef.current) return;
        ws.send(JSON.stringify({ event_id: eid(), ...SESSION_UPDATE }));
        const ok = await startPcmCapture();
        if (!ok) {
          setError("麦克风启动失败");
          stop();
          return;
        }
        subRef.current = addAudioChunkListener(({ base64, rms }) => {
          setLevel(rms);
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({ event_id: eid(), type: "input_audio_buffer.append", audio: base64 })
            );
          }
        });
        setStatus("listening");
      };

      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }
        switch (msg?.type) {
          case "input_audio_buffer.speech_started":
            if (!closedRef.current) setStatus("listening");
            break;
          case "conversation.item.input_audio_transcription.delta":
            if (typeof msg.text === "string") setLiveUser(msg.text);
            break;
          case "conversation.item.input_audio_transcription.completed":
            handleUtterance(msg.transcript ?? "");
            break;
          case "error":
            setError(msg?.error?.message || "识别出错了");
            break;
          default:
            break;
        }
      };

      ws.onerror = () => {
        if (closedRef.current) return;
        setError("连接中断，请重试");
        cleanup();
        setStatus("error");
      };

      ws.onclose = () => {
        if (closedRef.current) return;
        cleanup();
        setStatus("ended");
      };
    } catch (e: any) {
      setError(e?.message || "无法开始通话");
      cleanup();
      setStatus("error");
    }
  }, [cleanup, handleUtterance, stop]);

  return {
    available: isPcmAvailable,
    status,
    liveUser,
    turns,
    level,
    error,
    start,
    stop,
  };
}
