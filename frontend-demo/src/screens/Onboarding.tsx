/**
 * Onboarding 四屏（移植自 proto: OnboardWelcome/How/Pet/Permission）。
 */
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { GhostBtn, GlassCard, PetPlaceholder, PrimaryBtn, SafeHeader } from "../components";
import { palette, useNight } from "../theme";

export function OnboardWelcome({ onNext }: { onNext: () => void }) {
  const night = useNight();
  const C = palette(night);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "space-between", paddingHorizontal: 32, paddingBottom: 48, paddingTop: 80 }}>
      <View />
      <View style={{ alignItems: "center", gap: 32 }}>
        <PetPlaceholder size={168} />
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 30, fontWeight: "500", marginBottom: 12, lineHeight: 38, letterSpacing: -0.6, textAlign: "center", color: C.text }}>
            思绪纷乱时，{"\n"}有个地方接住你
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 22, color: C.text2 }}>MindOff 是你的情感陪伴伙伴</Text>
        </View>
      </View>
      <View style={{ alignSelf: "stretch", alignItems: "center", gap: 12 }}>
        <PrimaryBtn onClick={onNext} full>认识一下</PrimaryBtn>
        <GhostBtn onClick={onNext}>已经了解，直接开始</GhostBtn>
      </View>
    </View>
  );
}

export function OnboardHow({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const night = useNight();
  const C = palette(night);
  const items = [
    { icon: "💬", title: "自然聊天", desc: "随时找它说说话，它会静静地听，不催、不评判" },
    { icon: "🌙", title: "睡前清空", desc: "把今天所有的念头一股脑倒出来，整理是它的事" },
    { icon: "📬", title: "内容托管", desc: "它会在合适的时候送来值得的东西" },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 8, justifyContent: "space-between", paddingBottom: 48 }}>
        <View>
          <Text style={{ fontSize: 26, fontWeight: "500", marginBottom: 6, letterSpacing: -0.5, color: C.text }}>陪伴的三种方式</Text>
          <Text style={{ fontSize: 15, marginBottom: 28, color: C.text2 }}>不是工具，更像一个会等你回来的朋友</Text>
          <View style={{ gap: 12 }}>
            {items.map((item, i) => (
              <GlassCard key={i} style={{ padding: 20, flexDirection: "row", alignItems: "center", gap: 16 }}>
                <Text style={{ fontSize: 28 }}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "500", marginBottom: 2, color: C.text }}>{item.title}</Text>
                  <Text style={{ fontSize: 13, lineHeight: 18, color: C.text2 }}>{item.desc}</Text>
                </View>
              </GlassCard>
            ))}
          </View>
        </View>
        <PrimaryBtn onClick={onNext} full>选择你的伙伴</PrimaryBtn>
      </View>
    </View>
  );
}

export function OnboardPet({ onNext, onBack, selected, onSelect }: {
  onNext: () => void; onBack: () => void; selected: number; onSelect: (i: number) => void;
}) {
  const night = useNight();
  const C = palette(night);
  const pets = [
    { name: "小栖", trait: "温柔，善于倾听", desc: "喜欢在安静的傍晚陪你说话", emoji: "🌿" },
    { name: "晴晴", trait: "活泼，偶尔调皮", desc: "会在你沮丧时想办法让你笑一下", emoji: "☀️" },
    { name: "暮云", trait: "沉稳，有时神秘", desc: "话不多，但每句都刚好", emoji: "🌙" },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 48, flexGrow: 1, justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 26, fontWeight: "500", marginBottom: 6, letterSpacing: -0.5, color: C.text }}>选择你的伙伴</Text>
          <Text style={{ fontSize: 15, marginBottom: 24, color: C.text2 }}>之后随时可以更换，记忆会妥善交接</Text>
          <View style={{ gap: 12 }}>
            {pets.map((pet, i) => (
              <GlassCard key={i} onClick={() => onSelect(i)}
                style={{
                  padding: 20, flexDirection: "row", alignItems: "center", gap: 16,
                  borderWidth: selected === i ? 1.5 : 1,
                  borderColor: selected === i ? "rgba(196,149,58,0.5)" : "rgba(255,255,255,0.45)",
                  backgroundColor: selected === i ? "rgba(246,231,168,0.42)" : undefined,
                }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
                  backgroundColor: "rgba(255,252,245,0.85)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
                }}>
                  <Text style={{ fontSize: 24 }}>{pet.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <Text style={{ fontSize: 16, fontWeight: "500", color: C.text }}>{pet.name}</Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(243,216,199,0.6)" }}>
                      <Text style={{ fontSize: 11, color: "#655D61" }}>{pet.trait}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, color: C.text2 }}>{pet.desc}</Text>
                </View>
                {selected === i && (
                  <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(196,149,58,0.8)" }}>
                    <Check size={11} color="#fff" />
                  </View>
                )}
              </GlassCard>
            ))}
          </View>
        </View>
        <PrimaryBtn onClick={onNext} full disabled={selected === -1}>就选它了</PrimaryBtn>
      </ScrollView>
    </View>
  );
}

export function OnboardPermission({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const night = useNight();
  const C = palette(night);
  const items = [
    { icon: "🧠", title: "主动陪伴", desc: "它会在合适的时刻主动出现，随时可以关闭" },
    { icon: "🔐", title: "记忆授权", desc: "对话内容存在你的设备，可以随时查看和删除" },
    { icon: "🔕", title: "不会打扰你", desc: "不依赖通知、连续签到或任何情感绑架" },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 8, justifyContent: "space-between", paddingBottom: 48 }}>
        <View>
          <Text style={{ fontSize: 26, fontWeight: "500", marginBottom: 6, letterSpacing: -0.5, color: C.text }}>在开始之前</Text>
          <Text style={{ fontSize: 15, marginBottom: 28, color: C.text2 }}>你一直掌握主动权</Text>
          <View style={{ gap: 12 }}>
            {items.map((item, i) => (
              <GlassCard key={i} style={{ padding: 20, flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
                <Text style={{ fontSize: 22, marginTop: 2 }}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "500", marginBottom: 2, color: C.text }}>{item.title}</Text>
                  <Text style={{ fontSize: 13, lineHeight: 18, color: C.text2 }}>{item.desc}</Text>
                </View>
              </GlassCard>
            ))}
          </View>
        </View>
        <View style={{ alignItems: "center", gap: 12 }}>
          <PrimaryBtn onClick={onNext} full>开始了</PrimaryBtn>
          <Text style={{ fontSize: 12, textAlign: "center", color: C.muted }}>可以在「我的」里随时修改这些设置</Text>
        </View>
      </View>
    </View>
  );
}
