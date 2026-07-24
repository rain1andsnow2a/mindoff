/**
 * 实时语音通话页（桌宠·文字回复）。
 *
 * 进屏即接通：麦克风流式转写（服务端 VAD 自动断句），桌宠逐字文字回复。
 * 仅真机 Android 可用；不可用时给出提示并允许退出。
 */
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { PhoneOff } from "lucide-react-native";

import { AgentBubble, PetPlaceholder, UserBubble, WarmDot } from "../components";
import { palette, useNight } from "../theme";
import { useRealtimeCall, type CallStatus } from "../useRealtimeCall";

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

export function VoiceCall({ petName, petEmoji, onEnd }: {
  petName: string; petEmoji: string; onEnd: () => void;
}) {
  const night = useNight();
  const C = palette(night);
  const call = useRealtimeCall();
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

  const hangup = () => {
    call.stop();
    onEnd();
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
