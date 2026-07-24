/**
 * 实时语音通话页（桌宠·文字回复）。
 *
 * 进屏即接通：麦克风流式转写（服务端 VAD 自动断句），桌宠逐字文字回复。
 * 仅真机 Android 可用；不可用时给出提示并允许退出。
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PhoneOff } from "lucide-react-native";

import { AgentBubble, PetPlaceholder, UserBubble, WarmDot } from "../components";
import { palette, useNight } from "../theme";
import { useRealtimeCall, type CallStatus } from "../useRealtimeCall";
import { createScene } from "../api";

function statusLabel(status: CallStatus, error: string | null): string {
  if (error) return error;
  switch (status) {
    case "connecting":
      return "正在接通…";
    case "listening":
      return "在听你说";
    case "thinking":
      return "在想怎么回你…";
    case "ended":
      return "通话结束";
    case "error":
      return "出了点问题";
    default:
      return "准备中…";
  }
}

export function VoiceCall({ petName, petEmoji, onEnd, onEnterScene, onToast }: {
  petName: string; petEmoji: string; onEnd: () => void;
  onEnterScene: (sceneId: number, theaterId?: string) => void;
  onToast?: (msg: string) => void;
}) {
  const night = useNight();
  const C = palette(night);
  const [voiceReply, setVoiceReply] = useState(false);
  const [building, setBuilding] = useState(false);
  const call = useRealtimeCall(voiceReply);
  const scrollRef = useRef<ScrollView>(null);
  const ring = useRef(new Animated.Value(1)).current;

  // 进屏接通、离屏挂断（仅执行一次）
  useEffect(() => {
    call.start();
    return () => call.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 麦克风音量驱动光环律动
  useEffect(() => {
    Animated.timing(ring, {
      toValue: 1 + Math.min(call.level, 1) * 0.55,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, [call.level, ring]);

  // 语音回复开关：本地记忆，下次进入沿用
  useEffect(() => {
    AsyncStorage.getItem("mindoff.voiceReply").then((v) => {
      if (v === "1") setVoiceReply(true);
    });
  }, []);
  const toggleVoice = () => {
    setVoiceReply((prev) => {
      const next = !prev;
      AsyncStorage.setItem("mindoff.voiceReply", next ? "1" : "0").catch(() => {});
      return next;
    });
  };

  const hangup = () => {
    call.stop();
    onEnd();
  };

  // 一键即时建场景并进入片场：用意图种子（含 theater_id）建场景 → 挂断 → 跳 ScenePlay
  const enterScene = async () => {
    const sug = call.sceneSuggestion;
    if (!sug || building) return;
    setBuilding(true);
    try {
      const seed = sug.seed ?? {};
      const scene = await createScene({
        title: seed.title ?? undefined,
        people: seed.people ?? undefined,
        place: seed.place ?? undefined,
        plot: seed.plot ?? undefined,
        intent: seed.intent ?? undefined,
        theater_id: sug.theater_id,
      });
      call.dismissSuggestion();
      call.stop();
      onEnterScene(scene.id, scene.theater_id ?? sug.theater_id ?? undefined);
    } catch {
      setBuilding(false);
      onToast?.("场景没搭起来，待会儿再试试");
    }
  };

  const listening = call.status === "listening";

  return (
    <View style={{ flex: 1, paddingTop: 56 }}>
      {/* 顶部：桌宠名 + 通话状态 */}
      <View style={{ alignItems: "center", paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 17, fontWeight: "500", color: C.text }}>{petName}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
          {listening && <WarmDot />}
          <Text style={{ fontSize: 13, color: C.text2 }}>{statusLabel(call.status, call.error)}</Text>
        </View>
      </View>

      {/* 中部：桌宠 + 音量律动光环 */}
      <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 24 }}>
        <Animated.View
          style={{
            position: "absolute",
            width: 240, height: 240, borderRadius: 120,
            backgroundColor: "rgba(246,231,168,0.35)",
            transform: [{ scale: ring }],
          }}
        />
        <PetPlaceholder size={180} emoji={petEmoji} />
      </View>

      {/* 正在说：未定稿的用户转写 */}
      {call.liveUser ? (
        <View style={{ alignItems: "center", paddingHorizontal: 32, marginBottom: 4 }}>
          <Text style={{ fontSize: 14, color: C.muted, fontStyle: "italic" }} numberOfLines={2}>
            “{call.liveUser}”
          </Text>
        </View>
      ) : null}

      {/* 桌宠语音回复开关（方向 D · 带说明的开关行） */}
      <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
        <Pressable
          onPress={toggleVoice}
          style={{
            flexDirection: "row", alignItems: "center", gap: 10,
            paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16,
            backgroundColor: "rgba(255,252,245,0.78)",
            borderWidth: 1, borderColor: "rgba(255,255,255,0.6)",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: C.text }}>桌宠语音回复</Text>
            <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
              开启后{petName}会出声，也保留字幕
            </Text>
          </View>
          <View
            style={{
              width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: "center",
              backgroundColor: voiceReply ? "rgba(196,149,58,0.9)" : "rgba(120,110,100,0.28)",
              alignItems: voiceReply ? "flex-end" : "flex-start",
            }}
          >
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#FFF" }} />
          </View>
        </Pressable>
      </View>

      {/* 场景邀请提示条（方案B）：通话中听出场景意图时浮现，一键即时建场景并进入 */}
      {call.sceneSuggestion ? (
        <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
          <View style={{
            borderRadius: 16, padding: 14,
            backgroundColor: "rgba(246,231,168,0.5)",
            borderWidth: 1, borderColor: "rgba(196,149,58,0.4)",
          }}>
            <Text style={{ fontSize: 13, color: C.text, marginBottom: 10 }}>
              要现在就走进《{call.sceneSuggestion.seed?.title || "这一幕"}》吗？
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={enterScene}
                disabled={building}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center",
                  backgroundColor: building ? "rgba(196,149,58,0.5)" : "rgba(196,149,58,0.95)",
                }}
              >
                <Text style={{ fontSize: 14, color: "#FFF", fontWeight: "500" }}>
                  {building ? "在搭场景…" : "进入"}
                </Text>
              </Pressable>
              <Pressable
                onPress={call.dismissSuggestion}
                disabled={building}
                style={{
                  paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: "center",
                  backgroundColor: "rgba(255,252,245,0.8)",
                  borderWidth: 1, borderColor: "rgba(255,255,255,0.6)",
                }}
              >
                <Text style={{ fontSize: 14, color: C.text2 }}>以后再说</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {/* 对话流：用户整句 + 桌宠回复 */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {call.turns.map((t) =>
          t.role === "pet"
            ? <AgentBubble key={t.id} text={t.text || "…"} emoji={petEmoji} />
            : <UserBubble key={t.id} text={t.text} />
        )}
      </ScrollView>

      {/* 底部：挂断 */}
      <View style={{ alignItems: "center", paddingBottom: 40, paddingTop: 8 }}>
        <Pressable
          onPress={hangup}
          style={({ pressed }) => [{
            width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(214,90,90,0.92)",
            transform: [{ scale: pressed ? 0.92 : 1 }],
          }]}
        >
          <PhoneOff size={26} color="#FFF" />
        </Pressable>
        <Text style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
          {call.available ? "点击挂断" : "实时通话需在真机上使用"}
        </Text>
      </View>
    </View>
  );
}
