/**
 * 睡前倾倒三屏（移植自 proto: SleepDump / ProcessingScreen / ReceiptScreen）。
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Clock, Mic } from "lucide-react-native";
import {
  CreamRipple, GlassCard, PrimaryBtn, SafeHeader, SecondaryBtn,
} from "../components";
import { GOLD_DEEP, palette, useNight } from "../theme";

// ─── Sleep Dump ──────────────────────────────────────────────────────────────

export function SleepDump({ onBack, onProcess }: { onBack: () => void; onProcess: (text: string) => void }) {
  const night = useNight();
  const C = palette(night);
  const [text, setText] = useState("");
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
          <Pressable style={{
            width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
          }}>
            <Mic size={19} color={C.text2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <PrimaryBtn onClick={() => onProcess(text)} full>说完了，帮我整理</PrimaryBtn>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Processing ──────────────────────────────────────────────────────────────

const FRAGMENTS = [
  "明天的会议", "担心妈妈", "那本书", "睡前运动",
  "和朋友的事", "灵感：旅行", "今天好累", "想喝奶茶",
  "下周计划", "一直没做的事",
];

export function ProcessingScreen({ onDone }: { onDone: () => void }) {
  const night = useNight();
  const C = palette(night);
  const [showRipple, setShowRipple] = useState(false);
  const anims = useRef(FRAGMENTS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // 碎片依次飞入
    Animated.stagger(110, anims.map(a =>
      Animated.timing(a, { toValue: 1, duration: 500, useNativeDriver: true })
    )).start();
    // 2.6s 后涟漪 + 收尾
    const t = setTimeout(() => {
      setShowRipple(true);
      setTimeout(() => { setShowRipple(false); onDone(); }, 600);
    }, 2600);
    return () => clearTimeout(t);
  }, [anims, onDone]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 32 }}>
      <CreamRipple active={showRipple} />
      <View style={{ width: 288, height: 288, alignItems: "center", justifyContent: "center" }}>
        {FRAGMENTS.map((f, i) => {
          const angle = (i / FRAGMENTS.length) * Math.PI * 2;
          const r = 85 + (i % 3) * 12;
          const fx = Math.cos(angle) * r;
          const fy = Math.sin(angle) * r;
          const anim = anims[i];
          return (
            <Animated.View key={i}
              style={{
                position: "absolute",
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                backgroundColor: "rgba(255,252,245,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
                opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }),
                transform: [
                  { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [fx, 0] }) },
                  { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [fy, 0] }) },
                  { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) },
                ],
              }}>
              <Text style={{ fontSize: 12, fontWeight: "500", color: "#655D61" }}>{f}</Text>
            </Animated.View>
          );
        })}
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

// ─── Receipt ─────────────────────────────────────────────────────────────────

const RECEIPT_ITEMS = [
  { icon: "📅", label: "明天要接住", value: "3 件事" },
  { icon: "💡", label: "值得留下的想法", value: "2 条" },
  { icon: "🫂", label: "被听见的感受", value: "1 个" },
  { icon: "🌊", label: "今晚无需处理", value: "3 个" },
];

export function ReceiptScreen({ onDone, onView }: { onDone: () => void; onView: () => void }) {
  const night = useNight();
  const C = palette(night);
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fade]);

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={{ paddingTop: 52, paddingHorizontal: 24, paddingBottom: 16, opacity: fade }}>
        <Text style={{ fontSize: 14, marginBottom: 4, color: C.text2 }}>今晚</Text>
        <Text style={{ fontSize: 28, fontWeight: "500", lineHeight: 36, letterSpacing: -0.5, color: C.text }}>
          已替你接住{"\n"}<Text style={{ color: GOLD_DEEP }}>9 个念头</Text>
        </Text>
      </Animated.View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          {RECEIPT_ITEMS.map((item, i) => (
            <GlassCard key={i} style={{ padding: 16, width: "47%", flexGrow: 1 }}>
              <Text style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</Text>
              <Text style={{ fontSize: 22, fontWeight: "500", marginBottom: 2, color: C.text }}>{item.value}</Text>
              <Text style={{ fontSize: 12, color: C.text2 }}>{item.label}</Text>
            </GlassCard>
          ))}
        </View>
        <GlassCard style={{ padding: 20, backgroundColor: "rgba(246,231,168,0.42)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Clock size={13} color={GOLD_DEEP} />
            <Text style={{ fontSize: 12, fontWeight: "500", color: GOLD_DEEP }}>明天最值得关注</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: "500", color: C.text }}>与朋友的约定 · 下午 3 点</Text>
          <Text style={{ fontSize: 13, marginTop: 2, color: C.text2 }}>你担心会迟到，我帮你留着了</Text>
        </GlassCard>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: 100, gap: 12, paddingTop: 12 }}>
        <PrimaryBtn onClick={onDone} full>今晚到这里</PrimaryBtn>
        <SecondaryBtn onClick={onView}>看看我替你放在哪里</SecondaryBtn>
      </View>
    </View>
  );
}
