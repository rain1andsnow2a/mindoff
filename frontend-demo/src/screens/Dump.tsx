/**
 * 睡前倾倒三屏（SleepDump / ProcessingScreen / ReceiptScreen）。
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Clock, Mic, Square } from "lucide-react-native";
import {
  CreamRipple, GlassCard, PrimaryBtn, SafeHeader, SecondaryBtn,
} from "../components";
import { GOLD_DEEP, palette, useNight } from "../theme";
import { useVoiceInput } from "../useVoiceInput";

// ─── Sleep Dump ──────────────────────────────────────────────────────────────

export function SleepDump({ onBack, onProcess, initialText = "" }: { onBack: () => void; onProcess: (text: string) => void; initialText?: string }) {
  const night = useNight();
  const C = palette(night);
  const [text, setText] = useState(initialText);
  const voice = useVoiceInput((t) => setText((prev) => prev ? `${prev}\n${t}` : t));
  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} title="今晚的念头" />
      <View style={{ flex: 1, paddingHorizontal: 20, gap: 16, paddingBottom: 110, paddingTop: 8 }}>
        <Text style={{ fontSize: 14, lineHeight: 20, color: C.text2 }}>
          计划、担忧、灵感、情绪——什么都可以，混在一起说也没关系
        </Text>
        <View style={{
          flex: 1, borderRadius: 24, padding: 20,
          backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
        }}>
          <TextInput
            value={text} onChangeText={setText}
            placeholder={"今天想说的都在这里…\n\n整理是我的事，你只管说。"}
            placeholderTextColor={C.placeholder}
            multiline style={{ flex: 1, fontSize: 15, lineHeight: 25, color: "#484145", minHeight: 220, textAlignVertical: "top" }}
          />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            onPressIn={voice.start}
            onPressOut={voice.stop}
            disabled={voice.transcribing}
            style={{
              width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
              backgroundColor: voice.isRecording ? "rgba(196,149,58,0.22)" : "rgba(255,252,245,0.65)",
              borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
            }}>
            {voice.isRecording
              ? <Square size={17} fill={GOLD_DEEP} color={GOLD_DEEP} />
              : <Mic size={19} color={voice.transcribing ? C.placeholder : C.text2} />}
          </Pressable>
          <View style={{ flex: 1 }}>
            <PrimaryBtn onClick={() => onProcess(text)} full>说完了，帮我整理</PrimaryBtn>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Processing（真实 brain-dumps SSE）────────────────────────────────────

import { streamBrainDump, type SSEEvent } from "../api";

export interface DumpReceipt {
  total: number;
  kind_counts: Record<string, number>;
  items: { kind: string; content: string; memory_id: number }[];
  fallback?: boolean;
  error?: string;
}

/** 单个碎片：挂载时飞入（供动态列表用）。 */
function FlyingChip({ index, total, text }: { index: number; total: number; text: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [anim]);
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const r = 85 + (index % 3) * 12;
  const fx = Math.cos(angle) * r;
  const fy = Math.sin(angle) * r;
  return (
    <Animated.View style={{
      position: "absolute", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
      backgroundColor: "rgba(255,252,245,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
      opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }),
      transform: [
        { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [fx, 0] }) },
        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [fy, 0] }) },
        { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) },
      ],
    }}>
      <Text style={{ fontSize: 12, fontWeight: "500", color: "#655D61" }}>{text}</Text>
    </Animated.View>
  );
}

export function ProcessingScreen({ text, onDone }: { text: string; onDone: (r: DumpReceipt | null) => void }) {
  const night = useNight();
  const C = palette(night);
  const [showRipple, setShowRipple] = useState(false);
  const [frags, setFrags] = useState<string[]>([]);
  const doneRef = useRef(false);

  useEffect(() => {
    let receipt: DumpReceipt | null = null;
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setShowRipple(true);
      setTimeout(() => { setShowRipple(false); onDone(receipt); }, 600);
    };
    streamBrainDump(text, (e: SSEEvent) => {
      if (e.event === "item.classified") {
        const t: string = e.data?.surface_text || e.data?.content || "";
        if (t) setFrags((prev) => [...prev, t.length > 10 ? t.slice(0, 10) + "…" : t]);
      } else if (e.event === "receipt") {
        receipt = e.data as DumpReceipt;
      }
    }).then(finish).catch(finish);
  }, [text, onDone]);

  const shown = frags.length ? frags : ["正在整理…"];
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 32 }}>
      <CreamRipple active={showRipple} />
      <View style={{ width: 288, height: 288, alignItems: "center", justifyContent: "center" }}>
        {shown.map((f, i) => <FlyingChip key={i} index={i} total={shown.length} text={f} />)}
        <View style={{
          width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center",
          backgroundColor: "rgba(255,252,245,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
        }}>
          <Text style={{ fontSize: 24 }}>🌿</Text>
        </View>
      </View>
      <Text style={{ fontSize: 15, color: C.text2 }}>正在接住你的念头…</Text>
    </View>
  );
}

// ─── Receipt（真实回执）────────────────────────────────────────────────────

const KIND_META = [
  { key: "待办", icon: "📅", label: "明天要接住", unit: "件事" },
  { key: "灵感", icon: "💡", label: "值得留下的想法", unit: "条" },
  { key: "情绪", icon: "🫂", label: "被听见的感受", unit: "个" },
  { key: "片段", icon: "🌊", label: "今晚静静收着", unit: "个" },
];

export function ReceiptScreen(
  { receipt, onDone, onView }: { receipt: DumpReceipt | null; onDone: () => void; onView: () => void }
) {
  const night = useNight();
  const C = palette(night);
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fade]);

  const counts = receipt?.kind_counts ?? {};
  const total = receipt?.total ?? 0;
  const cards = KIND_META.map((m) => ({
    ...m,
    value: m.key === "灵感" ? (counts["灵感"] || 0) + (counts["小结"] || 0) : counts[m.key] || 0,
  }));
  const topTodo = receipt?.items?.find((it) => it.kind === "待办");

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={{ paddingTop: 52, paddingHorizontal: 24, paddingBottom: 16, opacity: fade }}>
        <Text style={{ fontSize: 14, marginBottom: 4, color: C.text2 }}>今晚</Text>
        <Text style={{ fontSize: 28, fontWeight: "500", lineHeight: 36, letterSpacing: -0.5, color: C.text }}>
          已替你接住{"\n"}<Text style={{ color: GOLD_DEEP }}>{total} 个念头</Text>
        </Text>
      </Animated.View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          {cards.map((item, i) => (
            <GlassCard key={i} style={{ padding: 16, width: "47%", flexGrow: 1 }}>
              <Text style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</Text>
              <Text style={{ fontSize: 22, fontWeight: "500", marginBottom: 2, color: C.text }}>{item.value} {item.unit}</Text>
              <Text style={{ fontSize: 12, color: C.text2 }}>{item.label}</Text>
            </GlassCard>
          ))}
        </View>
        {topTodo ? (
          <GlassCard style={{ padding: 20, backgroundColor: "rgba(246,231,168,0.42)" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Clock size={13} color={GOLD_DEEP} />
              <Text style={{ fontSize: 12, fontWeight: "500", color: GOLD_DEEP }}>明天最值得关注</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: "500", color: C.text }}>{topTodo.content}</Text>
          </GlassCard>
        ) : null}
        {receipt?.fallback ? (
          <Text style={{ fontSize: 12, color: C.text2, marginTop: 12 }}>今晚先替你收着了，明天再慢慢看。</Text>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 100, gap: 12, paddingTop: 12 }}>
        <PrimaryBtn onClick={onDone} full>今晚到这里</PrimaryBtn>
        <SecondaryBtn onClick={onView}>看看我替你放在哪里</SecondaryBtn>
      </View>
    </View>
  );
}

