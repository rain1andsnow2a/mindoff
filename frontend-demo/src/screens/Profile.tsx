/**
 * 我的模块（移植自 proto: ProfileScreen / PetChange / PetHandoff）。
 * 设置接 /api/v1/preferences；记忆管理接 /api/v1/memories 与 /api/v1/memory-review。
 */
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Archive, Bell, ChevronRight, Clock, Layers, Moon, Shield, Trash2, Type,
} from "lucide-react-native";
import { GlassCard, PrimaryBtn, SafeHeader } from "../components";
import { palette, useNight } from "../theme";
import { clearMemories, deleteMemory, getMemoryReview, listMemories } from "../api";

export type Preferences = {
  proactive_enabled: boolean;
  proactive_frequency: "安静" | "温和" | "活跃" | string;
  sleep_reminder_time: string;
  keep_raw_dump: boolean;
  ephemeral_ttl_days: number;
  font_size: "小" | "标准" | "大" | string;
  companion_tone: string;
  reduce_transparency: boolean;
};

export function ProfileScreen({
  onChangePet, night, onNightToggle, petName, petEmoji, petSummary,
  onMemory, onMemoryReview, preferences, onSetPreference,
}: {
  onChangePet: () => void; night: boolean; onNightToggle: () => void;
  petName: string; petEmoji: string; petSummary?: string;
  onMemory: () => void; onMemoryReview: () => void;
  preferences: Preferences;
  onSetPreference: (patch: Partial<Preferences>) => void;
}) {
  const C = palette(night);

  const cycleFrequency = () => {
    const order = ["安静", "温和", "活跃"];
    const idx = order.indexOf(preferences.proactive_frequency);
    onSetPreference({ proactive_frequency: order[(idx + 1) % order.length] });
  };

  const cycleSleepTime = () => {
    const times = ["21:30", "22:00", "22:30", "23:00", "23:30"];
    const idx = times.indexOf(preferences.sleep_reminder_time);
    onSetPreference({ sleep_reminder_time: times[(idx + 1) % times.length] });
  };

  const cycleFontSize = () => {
    const sizes = ["小", "标准", "大"];
    const idx = sizes.indexOf(preferences.font_size);
    onSetPreference({ font_size: sizes[(idx + 1) % sizes.length] });
  };

  const sections = [
    { title: "陪伴设置", rows: [
      { icon: <Bell size={16} color={C.text2} />, label: "主动陪伴频率", val: preferences.proactive_frequency, act: cycleFrequency },
      { icon: <Clock size={16} color={C.text2} />, label: "睡前提醒", val: preferences.sleep_reminder_time, act: cycleSleepTime },
    ]},
    { title: "记忆与隐私", rows: [
      { icon: <Archive size={16} color={C.text2} />, label: "记忆管理", val: "", act: onMemory },
      { icon: <Clock size={16} color={C.text2} />, label: "三日寄存规则", val: `${preferences.ephemeral_ttl_days}天` },
      { icon: <Shield size={16} color={C.text2} />, label: "记忆审阅", val: "", act: onMemoryReview },
    ]},
    { title: "界面与体验", rows: [
      { icon: <Moon size={16} color={C.text2} />, label: "夜间氛围", val: night ? "开启" : "关闭", act: onNightToggle },
      { icon: <Type size={16} color={C.text2} />, label: "字体大小", val: preferences.font_size, act: cycleFontSize },
      { icon: <Layers size={16} color={C.text2} />, label: "减少透明度", val: preferences.reduce_transparency ? "开启" : "关闭", act: () => onSetPreference({ reduce_transparency: !preferences.reduce_transparency }) },
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
            <Text style={{ fontSize: 13, marginTop: 2, color: C.text2 }}>{petSummary ?? "你的陪伴伙伴"}</Text>
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

export function PetChange({ pets, activePetId, onBack, onHandoff }: {
  pets: { id: number | string; name: string; emoji: string; summary?: string }[];
  activePetId: number | string | null;
  onBack: () => void;
  onHandoff: (petId: number | string) => void;
}) {
  const night = useNight();
  const C = palette(night);
  const [sel, setSel] = useState<number | null>(null);
  const opts = pets.filter((p) => p.id !== activePetId);
  const currentName = pets.find((p) => p.id === activePetId)?.name ?? "当前伙伴";
  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} title="更换伙伴" />
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100, gap: 16 }}>
        <Text style={{ fontSize: 14, color: C.text2 }}>{currentName}会把粗粒度近况告诉新伙伴，不会复述细节</Text>
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
              <Text style={{ fontSize: 13, marginTop: 2, color: C.text2 }}>{p.summary ?? "陪伴伙伴"}</Text>
            </View>
            {sel === i && (
              <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(196,149,58,0.8)" }}>
                <Text style={{ fontSize: 10, color: "#fff" }}>✓</Text>
              </View>
            )}
          </GlassCard>
        ))}
        <View style={{ marginTop: "auto" }}>
          <PrimaryBtn onClick={() => opts[sel ?? -1] && onHandoff(opts[sel!].id)} full disabled={sel === null}>确认更换</PrimaryBtn>
        </View>
      </View>
    </View>
  );
}

export function PetHandoff({ onBack, onDone, oldPet, newPet, handoffContent }: {
  onBack: () => void; onDone: () => void;
  oldPet?: { name: string; emoji: string };
  newPet?: { name: string; emoji: string };
  handoffContent?: string | null;
}) {
  const night = useNight();
  const C = palette(night);
  const oldName = oldPet?.name ?? "前任伙伴";
  const newEmoji = newPet?.emoji ?? "☀️";
  const bodyText = handoffContent && handoffContent.trim()
    ? handoffContent
    : "嗨。\n\n这位朋友最近在处理一些需要时间消化的事情，心情整体还不错，偶尔会有点累。\n\n喜欢睡前说说话。有几件事放在信箱里还没处理完。\n\n好好陪着她。";
  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} />
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 100, gap: 20, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 56 }}>{newEmoji}</Text>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 22, fontWeight: "500", marginBottom: 4, color: C.text }}>来自{oldName}的交接信</Text>
          <Text style={{ fontSize: 14, color: C.text2 }}>给新来的伙伴看的</Text>
        </View>
        <GlassCard style={{ padding: 24, alignSelf: "stretch", backgroundColor: "rgba(246,231,168,0.35)" }}>
          <Text style={{ fontSize: 15, lineHeight: 26, color: C.text }}>{bodyText}</Text>
        </GlassCard>
        <View style={{ alignSelf: "stretch" }}>
          <PrimaryBtn onClick={onDone} full>认识新伙伴</PrimaryBtn>
        </View>
      </View>
    </View>
  );
}

// ─── 记忆管理 ────────────────────────────────────────────────────────────────

function SensitivityBadge({ label, night }: { label: string; night: boolean }) {
  const colors: Record<string, string> = {
    "日常": "#A3C9A8",
    "个人": "#D4B483",
    "较私密": "#C98B8B",
    "很私密": "#A88B9A",
  };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors[label] ?? "#D4B483" }}>
      <Text style={{ fontSize: 11, color: night ? "#2A252E" : "#4B463F" }}>{label}</Text>
    </View>
  );
}

export function MemoryScreen({ onBack, onToast }: { onBack: () => void; onToast: (msg: string) => void }) {
  const night = useNight();
  const C = palette(night);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listMemories();
      setItems(data as any[]);
    } catch (e: any) {
      onToast(e?.message || "读取记忆失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: number) => {
    try {
      await deleteMemory(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      onToast("已删除");
    } catch (e: any) {
      onToast(e?.message || "删除失败");
    }
  };

  const clearAll = async () => {
    try {
      await clearMemories();
      setItems([]);
      onToast("已清空全部记忆");
    } catch (e: any) {
      onToast(e?.message || "清空失败");
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} title="记忆管理" rightEl={
        items.length > 0 ? (
          <Pressable onPress={clearAll} style={{ padding: 6 }}>
            <Trash2 size={18} color={C.text2} />
          </Pressable>
        ) : null
      } />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 8 }}>
        {loading ? (
          <Text style={{ textAlign: "center", marginTop: 40, color: C.text2 }}>加载中…</Text>
        ) : items.length === 0 ? (
          <Text style={{ textAlign: "center", marginTop: 40, color: C.text2 }}>还没有需要管理的记忆</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {items.map((item) => (
              <GlassCard key={item.id} style={{ padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: C.muted }}>{item.kind}</Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>·</Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>{item.updated_at?.slice(0, 10)}</Text>
                </View>
                <Text style={{ fontSize: 15, lineHeight: 22, color: C.text }}>{item.surface_text || item.content}</Text>
                <Pressable onPress={() => remove(item.id)} style={{ alignSelf: "flex-end", marginTop: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(201,139,139,0.18)" }}>
                  <Text style={{ fontSize: 12, color: "#8B5A5A" }}>删除</Text>
                </Pressable>
              </GlassCard>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export function MemoryReviewScreen({ onBack, onToast }: { onBack: () => void; onToast: (msg: string) => void }) {
  const night = useNight();
  const C = palette(night);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMemoryReview()
      .then((data) => setItems(data as any[]))
      .catch((e: any) => onToast(e?.message || "读取审阅面失败"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} title="记忆审阅" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 8 }}>
        <Text style={{ fontSize: 14, lineHeight: 20, color: C.text2, marginBottom: 12 }}>
          这里只显示日常/个人/较私密/很私密软标签，不暴露诊断或轴名。
        </Text>
        {loading ? (
          <Text style={{ textAlign: "center", marginTop: 40, color: C.text2 }}>加载中…</Text>
        ) : items.length === 0 ? (
          <Text style={{ textAlign: "center", marginTop: 40, color: C.text2 }}>暂无可审阅的记忆</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {items.map((item) => (
              <GlassCard key={item.id} style={{ padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: C.muted }}>{item.kind}</Text>
                  <SensitivityBadge label={item.sensitivity} night={night} />
                </View>
                <Text style={{ fontSize: 15, lineHeight: 22, color: C.text }}>{item.surface_text}</Text>
              </GlassCard>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
