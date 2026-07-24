/**
 * 我的模块（移植自 proto: ProfileScreen / PetChange / PetHandoff）。
 */
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Archive, Bell, ChevronRight, Clock, Layers, Moon, Shield, Type,
} from "lucide-react-native";
import { GlassCard, PrimaryBtn, SafeHeader } from "../components";
import { palette, useNight } from "../theme";

export function ProfileScreen({ onChangePet, night, onNightToggle, petName, petEmoji }: {
  onChangePet: () => void; night: boolean; onNightToggle: () => void;
  petName: string; petEmoji: string;
}) {
  const C = palette(night);
  const sections = [
    { title: "陪伴设置", rows: [
      { icon: <Bell size={16} color={C.text2} />, label: "主动陪伴频率", val: "温和" },
      { icon: <Clock size={16} color={C.text2} />, label: "睡前提醒", val: "22:30" },
    ]},
    { title: "记忆与隐私", rows: [
      { icon: <Archive size={16} color={C.text2} />, label: "记忆管理", val: "" },
      { icon: <Clock size={16} color={C.text2} />, label: "三日寄存规则", val: "3天" },
      { icon: <Shield size={16} color={C.text2} />, label: "隐私与数据删除", val: "" },
    ]},
    { title: "界面与体验", rows: [
      { icon: <Moon size={16} color={C.text2} />, label: "夜间氛围", val: night ? "开启" : "关闭", act: onNightToggle },
      { icon: <Type size={16} color={C.text2} />, label: "字体大小", val: "标准" },
      { icon: <Layers size={16} color={C.text2} />, label: "减少透明度", val: "关闭" },
    ]},
  ];
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12 }}>
        <Text style={{ fontSize: 26, fontWeight: "500", letterSpacing: -0.5, color: C.text }}>我的</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        <GlassCard style={{ padding: 20, marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 16 }} onClick={onChangePet}>
          <View style={{
            width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(246,231,168,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
          }}>
            <Text style={{ fontSize: 24 }}>{petEmoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "500", color: C.text }}>{petName}</Text>
            <Text style={{ fontSize: 13, marginTop: 2, color: C.text2 }}>温柔，善于倾听</Text>
          </View>
          <View style={{
            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
            backgroundColor: "rgba(255,252,245,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)",
          }}>
            <Text style={{ fontSize: 13, color: "#655D61" }}>更换伙伴</Text>
          </View>
        </GlassCard>

        {sections.map((sec, si) => (
          <View key={si} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: "500", marginBottom: 8, paddingHorizontal: 4, color: C.text2 }}>{sec.title}</Text>
            <GlassCard>
              {sec.rows.map((row, ri) => (
                <View key={ri}>
                  <Pressable onPress={row.act}
                    style={({ pressed }) => [{
                      flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16,
                      opacity: pressed ? 0.65 : 1,
                    }]}>
                    {row.icon}
                    <Text style={{ flex: 1, fontSize: 15, color: C.text }}>{row.label}</Text>
                    <Text style={{ fontSize: 13, color: C.muted }}>{row.val}</Text>
                    <ChevronRight size={13} color={C.chevron} />
                  </Pressable>
                  {ri < sec.rows.length - 1 && (
                    <View style={{ marginHorizontal: 20, height: 1, backgroundColor: C.rowDivider }} />
                  )}
                </View>
              ))}
            </GlassCard>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function PetChange({ onBack, onHandoff }: { onBack: () => void; onHandoff: (i: number) => void }) {
  const night = useNight();
  const C = palette(night);
  const [sel, setSel] = useState(-1);
  const opts = [
    { name: "晴晴", trait: "活泼，偶尔调皮", emoji: "☀️" },
    { name: "暮云", trait: "沉稳，有时神秘", emoji: "🌙" },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} title="更换伙伴" />
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100, gap: 16 }}>
        <Text style={{ fontSize: 14, color: C.text2 }}>小栖会把粗粒度近况告诉新伙伴，不会复述细节</Text>
        {opts.map((p, i) => (
          <GlassCard key={i} onClick={() => setSel(i)}
            style={{
              padding: 20, flexDirection: "row", alignItems: "center", gap: 16,
              borderWidth: sel === i ? 1.5 : 1,
              borderColor: sel === i ? "rgba(196,149,58,0.5)" : "rgba(255,255,255,0.45)",
              backgroundColor: sel === i ? "rgba(246,231,168,0.42)" : undefined,
            }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,252,245,0.85)" }}>
              <Text style={{ fontSize: 24 }}>{p.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "500", color: C.text }}>{p.name}</Text>
              <Text style={{ fontSize: 13, marginTop: 2, color: C.text2 }}>{p.trait}</Text>
            </View>
            {sel === i && (
              <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(196,149,58,0.8)" }}>
                <Text style={{ fontSize: 10, color: "#fff" }}>✓</Text>
              </View>
            )}
          </GlassCard>
        ))}
        <View style={{ marginTop: "auto" }}>
          <PrimaryBtn onClick={() => onHandoff(sel)} full disabled={sel === -1}>确认更换</PrimaryBtn>
        </View>
      </View>
    </View>
  );
}

export function PetHandoff({ onBack, onDone, newPetEmoji }: {
  onBack: () => void; onDone: () => void; newPetEmoji: string;
}) {
  const night = useNight();
  const C = palette(night);
  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} />
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 100, gap: 20, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 56 }}>{newPetEmoji}</Text>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 22, fontWeight: "500", marginBottom: 4, color: C.text }}>来自小栖的交接信</Text>
          <Text style={{ fontSize: 14, color: C.text2 }}>给新来的伙伴看的</Text>
        </View>
        <GlassCard style={{ padding: 24, alignSelf: "stretch", backgroundColor: "rgba(246,231,168,0.35)" }}>
          <Text style={{ fontSize: 15, lineHeight: 26, color: C.text }}>
            嗨。{"\n\n"}
            这位朋友最近在处理一些需要时间消化的事情，心情整体还不错，偶尔会有点累。{"\n\n"}
            喜欢睡前说说话。有几件事放在信箱里还没处理完。{"\n\n"}
            好好陪着她。{"\n\n"}
            <Text style={{ color: C.muted }}>— 小栖</Text>
          </Text>
        </GlassCard>
        <View style={{ alignSelf: "stretch" }}>
          <PrimaryBtn onClick={onDone} full>认识新伙伴</PrimaryBtn>
        </View>
      </View>
    </View>
  );
}
