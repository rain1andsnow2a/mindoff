/**
 * 陪伴屏（移植自 proto: CompanionIdle / CompanionChat / ModeSheet）。
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { ChevronRight, Mic, Moon, Plus, Send, Sun } from "lucide-react-native";
import {
  AgentBubble, BottomSheet, GlassCard, LiquidGlassShell, PetPlaceholder,
  UserBubble, WarmDot,
} from "../components";
import { CREAM, palette, useNight } from "../theme";

// ─── Idle ────────────────────────────────────────────────────────────────────

export function CompanionIdle({ onChat, onModeSheet, onNightToggle, night, petName, petEmoji }: {
  onChat: () => void; onModeSheet: () => void; onNightToggle: () => void;
  night: boolean; petName: string; petEmoji: string;
}) {
  const C = palette(night);
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: true })
        .start(() => setBubbleVisible(false));
    }, 4200);
    return () => clearTimeout(t);
  }, [fade]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 52, paddingBottom: 8 }}>
        <View>
          <Text style={{ fontSize: 17, fontWeight: "500", color: C.text }}>{petName}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            <WarmDot />
            <Text style={{ fontSize: 12, color: C.text2 }}>在等你</Text>
          </View>
        </View>
        <Pressable onPress={onNightToggle}
          style={{
            width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
          }}>
          {night ? <Sun size={15} color={C.text} /> : <Moon size={15} color={C.text} />}
        </Pressable>
      </View>

      <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center" }} onPress={onChat}>
        {bubbleVisible && (
          <Animated.View style={{
            position: "absolute", top: "8%", opacity: fade,
            transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, borderBottomLeftRadius: 6,
            backgroundColor: "rgba(255,252,245,0.85)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
          }}>
            <Text style={{ fontSize: 15, color: "#484145" }}>今天怎么样？✨</Text>
          </Animated.View>
        )}
        <PetPlaceholder size={215} emoji={petEmoji} />
        <Text style={{ marginTop: 20, fontSize: 13, color: C.muted }}>轻触打招呼</Text>
      </Pressable>

      <View style={{ paddingHorizontal: 20, paddingBottom: 110 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <LiquidGlassShell onClick={onChat}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderRadius: 999 }}>
            <Text style={{ fontSize: 15, flex: 1, color: C.muted }}>说点什么…</Text>
            <Mic size={17} color={C.muted} />
          </LiquidGlassShell>
          <Pressable onPress={onModeSheet}
            style={({ pressed }) => [{
              width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(246,231,168,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
              transform: [{ scale: pressed ? 0.95 : 1 }],
            }]}>
            <Plus size={20} color={C.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export function CompanionChat({ onBack, petName, petEmoji }: {
  onBack: () => void; petName: string; petEmoji: string;
}) {
  const night = useNight();
  const C = palette(night);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "agent", text: "嗯，我在。今天有什么想聊的吗？" },
  ]);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    setMessages(m => [...m, { role: "user", text }]);
    setThinking(true);
    setTimeout(() => {
      setMessages(m => [...m, { role: "agent", text: "我听到了。能多说一点吗？" }]);
      setThinking(false);
    }, 1300);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12 }}>
        <Pressable onPress={onBack} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
          <Text style={{ fontSize: 22, color: C.text }}>‹</Text>
        </Pressable>
        <View style={{
          width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
          backgroundColor: "rgba(255,252,245,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
        }}>
          <Text style={{ fontSize: 18 }}>{petEmoji}</Text>
        </View>
        <View>
          <Text style={{ fontSize: 16, fontWeight: "500", color: C.text }}>{petName}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <WarmDot />
            <Text style={{ fontSize: 12, color: C.text2 }}>在听</Text>
          </View>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 8 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {messages.map((m, i) => (
          m.role === "agent"
            ? <AgentBubble key={i} text={m.text} emoji={petEmoji} />
            : <UserBubble key={i} text={m.text} />
        ))}
        {thinking && (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 16 }}>
            <View style={{
              width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(255,252,245,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
            }}>
              <Text style={{ fontSize: 13 }}>{petEmoji}</Text>
            </View>
            <View style={{
              paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, borderBottomLeftRadius: 6,
              backgroundColor: "rgba(255,252,245,0.75)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
            }}>
              <Text style={{ color: "#C0B5A8", letterSpacing: 3 }}>•••</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: 110, paddingTop: 8 }}>
        <LiquidGlassShell style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24 }}>
          <TextInput
            value={input} onChangeText={setInput}
            placeholder="说点什么…" placeholderTextColor={C.placeholder}
            multiline style={{ flex: 1, fontSize: 15, lineHeight: 21, color: C.text, maxHeight: 80 }}
            onSubmitEditing={send}
          />
          <Pressable onPress={send}
            style={({ pressed }) => [{
              width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center",
              backgroundColor: input.trim() ? CREAM : "rgba(91,79,62,0.07)",
              transform: [{ scale: pressed ? 0.9 : 1 }],
            }]}>
            <Send size={13} color={input.trim() ? "#4B463F" : C.muted} />
          </Pressable>
        </LiquidGlassShell>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Mode Sheet ──────────────────────────────────────────────────────────────

export function ModeSheet({ visible, onClose, onSleepDump, onChat }: {
  visible: boolean; onClose: () => void; onSleepDump: () => void; onChat: () => void;
}) {
  const night = useNight();
  const C = palette(night);
  const modes = [
    { icon: "☁️", label: "自由聊聊", desc: "随便聊点什么，没有主题", act: onChat },
    { icon: "🌊", label: "一股脑倒出来", desc: "把今天的念头一次全说出来", act: onSleepDump },
    { icon: "🪨", label: "说件放不下的事", desc: "有什么在心里反复出现", act: onChat },
    { icon: "📽️", label: "回看一个片段", desc: "回到某段记忆里看看", act: onChat },
  ];
  return (
    <BottomSheet visible={visible} onClose={onClose} title="想怎么聊？">
      <View style={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8, gap: 8 }}>
        {modes.map((m, i) => (
          <Pressable key={i} onPress={m.act}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: 20,
              backgroundColor: "rgba(255,252,245,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)",
              transform: [{ scale: pressed ? 0.97 : 1 }],
            }]}>
            <Text style={{ fontSize: 24 }}>{m.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "500", marginBottom: 2, color: C.lsPri }}>{m.label}</Text>
              <Text style={{ fontSize: 13, color: C.lsSec }}>{m.desc}</Text>
            </View>
            <ChevronRight size={15} color={C.lsTer} />
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}
