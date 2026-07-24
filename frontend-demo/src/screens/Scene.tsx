/**
 * 片场模块（移植自 proto）：
 * SceneScreen（内置场景轮播 + 语音创建入口 + 整理预览 + 角色设定三步）
 * ScenePlay（视觉小说式对话 + 暂停/校准「TA 不太像」）
 * SceneEnd（结算卡 + 珍藏/重演/离开）
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated, Dimensions, Easing, Image, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, Mic, Play, Send, Edit3 } from "lucide-react-native";
import { CreamRipple, PrimaryBtn, SafeHeader } from "../components";
import { GOLD_DEEP, palette, useNight } from "../theme";
import { Scene3D } from "./Scene3D";
import {
  listSceneTemplates, listScenes, createScene,
  listCandidates, dismissCandidate, streamConfirmCandidate,
  getScene, streamSceneChoice, streamSceneCustom, calibrateScene, settleScene, absUrl,
} from "../api";
import type { SSEEvent } from "../api";
import { useVoiceInput } from "../useVoiceInput";
import type { TheaterSceneId } from "../theater";

// ─── Data ────────────────────────────────────────────────────────────────────

interface BuiltInScene {
  id: string; title: string; desc: string;
  relationships: string[]; colors: [string, string, ...string[]];
  ambientColor: string; ambientColor2: string;
  /** 进入演练时，ScenePlay 背景挂载的 theater 3D 场景。 */
  theater: TheaterSceneId;
}

const BUILT_IN_SCENES: BuiltInScene[] = [
  {
    id: "night-call", title: "深夜通话",
    desc: "有些话，隔着一通电话才说得出口。",
    relationships: ["恋人", "朋友", "异地家人"],
    colors: ["#261A10", "#3A2618", "#4D3828", "#5C4838"],
    ambientColor: "rgba(255,148,48,0.18)", ambientColor2: "rgba(255,200,100,0.10)",
    theater: "bedroom",
  },
  {
    id: "dinner-table", title: "家中餐桌",
    desc: "最难说出口的话，常常发生在最熟悉的地方。",
    relationships: ["父母", "家庭", "伴侣"],
    colors: ["#F5ECD8", "#EDD9BE", "#E2C9A0"],
    ambientColor: "rgba(255,195,60,0.38)", ambientColor2: "rgba(255,230,140,0.22)",
    theater: "dining",
  },
  {
    id: "leaving-road", title: "离开的路上",
    desc: "有些告别，也许还来得及换一种说法。",
    relationships: ["恋人", "朋友", "同学", "同事"],
    colors: ["#E8D5C0", "#D9C09E", "#C8A882", "#B89878"],
    ambientColor: "rgba(255,175,70,0.32)", ambientColor2: "rgba(240,200,130,0.18)",
    theater: "station",
  },
];

type SceneSubState = "browsing" | "capturing" | "reviewing" | "setup";

// ─── Scene Portal ────────────────────────────────────────────────────────────

const CAROUSEL_CARD_W = 310;
const CAROUSEL_GAP = 16;
const CAROUSEL_SNAP = CAROUSEL_CARD_W + CAROUSEL_GAP;   // 每次吸附一张的间距
const CAROUSEL_SIDE = Math.max(16, (Dimensions.get("window").width - CAROUSEL_CARD_W) / 2); // 两端留白，让首尾卡片也能居中

function ScenePortal({ scene, index, scrollX, isActive, onEnter }: {
  scene: BuiltInScene; index: number; scrollX: Animated.Value; isActive: boolean; onEnter: () => void;
}) {
  // 跟手连续缩放/淡入：当前卡片 1.0，相邻卡片缩到 0.9 且变淡，随滑动平滑过渡。
  const inputRange = [(index - 1) * CAROUSEL_SNAP, index * CAROUSEL_SNAP, (index + 1) * CAROUSEL_SNAP];
  const scale = scrollX.interpolate({ inputRange, outputRange: [0.9, 1, 0.9], extrapolate: "clamp" });
  const opacity = scrollX.interpolate({ inputRange, outputRange: [0.55, 1, 0.55], extrapolate: "clamp" });
  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
    <Pressable onPress={isActive ? onEnter : undefined}
      style={{
        width: CAROUSEL_CARD_W, height: 390, borderRadius: 30, overflow: "hidden",
      }}>
      <LinearGradient colors={scene.colors} style={{ flex: 1 }}>
        {/* 环境光斑近似 */}
        <View style={{
          position: "absolute", top: 60, left: 40, width: 180, height: 180, borderRadius: 90,
          backgroundColor: scene.ambientColor,
        }} />
        <View style={{
          position: "absolute", bottom: 60, right: 30, width: 140, height: 140, borderRadius: 70,
          backgroundColor: scene.ambientColor2,
        }} />
        <View style={{ position: "absolute", top: 20, left: 20 }}>
          <View style={{
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
          }}>
            <Text style={{ fontSize: 10, fontWeight: "500", color: "rgba(255,255,255,0.72)" }}>内置场景</Text>
          </View>
        </View>
        <LinearGradient
          colors={["transparent", "rgba(30,20,12,0.72)"]}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 20, paddingTop: 80 }}>
          <Text style={{ fontSize: 11, marginBottom: 8, color: "rgba(255,255,255,0.55)" }}>
            {scene.relationships.join(" · ")}
          </Text>
          <Text style={{ fontSize: 22, fontWeight: "500", marginBottom: 4, color: "rgba(255,255,255,0.95)" }}>{scene.title}</Text>
          <Text style={{ fontSize: 13, lineHeight: 18, marginBottom: 16, color: "rgba(255,255,255,0.65)" }}>{scene.desc}</Text>
          {isActive && (
            <Pressable onPress={onEnter}
              style={{
                alignSelf: "flex-start", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999,
                backgroundColor: "rgba(255,252,245,0.2)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.32)",
              }}>
              <Text style={{ fontSize: 13, fontWeight: "500", color: "rgba(255,255,255,0.92)" }}>进入场景</Text>
            </Pressable>
          )}
        </LinearGradient>
      </LinearGradient>
    </Pressable>
    </Animated.View>
  );
}

// ─── Voice Create Entry ──────────────────────────────────────────────────────

function CreateSceneEntry({ onStart }: { onStart: () => void }) {
  const night = useNight();
  const C = palette(night);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ marginTop: 32, marginBottom: 16 }}>
      <View style={{ alignItems: "center", marginBottom: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "500", marginBottom: 6, color: C.text }}>描述一个你想进入的场景</Text>
        <Text style={{ fontSize: 13, color: C.muted }}>你来说发生了什么，我们替你搭好片场。</Text>
      </View>
      <View style={{ alignItems: "center", gap: 20 }}>
        <View style={{ width: 88, height: 88, alignItems: "center", justifyContent: "center" }}>
          <Animated.View style={{
            position: "absolute", width: 88, height: 88, borderRadius: 44,
            backgroundColor: "rgba(246,231,168,0.18)", transform: [{ scale: pulse }], opacity: 0.7,
          }} />
          <Pressable onPress={onStart}
            style={({ pressed }) => [{
              width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(255,252,245,0.82)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)",
              transform: [{ scale: pressed ? 0.93 : 1 }],
            }]}>
            <Mic size={20} color={GOLD_DEEP} />
          </Pressable>
        </View>
        <Pressable onPress={onStart}>
          <Text style={{ fontSize: 12, color: C.muted }}>用文字描述</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Narration Capture ───────────────────────────────────────────────────────

function SceneNarrationCapture({ onBack, onConfirm }: {
  onBack: () => void; onConfirm: (text: string) => void;
}) {
  const night = useNight();
  const C = palette(night);
  const [text, setText] = useState("");
  // 真实 STT：按住麦克录音，松手转写后追加到描述框（复用 useVoiceInput，真机走原生 PCM）
  const voice = useVoiceInput((t) => setText((prev) => (prev ? `${prev}${t}` : t)));
  const placeholder = "我想回到上周和朋友吵架之后。地点在学校门口，她准备打车离开。她平时比较敏感，生气后会假装不在意，但其实很希望我先道歉。我想试着把她叫住。";
  const micHint = voice.transcribing ? "正在转写…" : voice.isRecording ? "松开结束录音" : "按住说话";
  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} title="描述你的场景" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}>
        <View>
          <Text style={{ fontSize: 16, fontWeight: "500", marginBottom: 6, color: C.text }}>
            说说你在哪里、谁在你面前，以及发生了什么。
          </Text>
          <Text style={{ fontSize: 13, color: C.muted }}>不用分段，像说话一样讲就好。</Text>
        </View>
        <TextInput
          value={text} onChangeText={setText}
          placeholder={placeholder} placeholderTextColor={C.placeholder}
          multiline
          style={{
            minHeight: 200, paddingHorizontal: 20, paddingVertical: 16, borderRadius: 20, fontSize: 14, lineHeight: 22,
            backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
            color: "#484145", textAlignVertical: "top",
          }}
        />
        <View style={{ alignItems: "center", gap: 12 }}>
          <Pressable
            onPressIn={() => { voice.start(); }} onPressOut={() => { voice.stop(); }}
            disabled={voice.transcribing}
            style={{
              width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center",
              backgroundColor: voice.isRecording ? "rgba(243,216,199,0.88)" : "rgba(246,231,168,0.72)",
              borderWidth: 2, borderColor: voice.isRecording ? "rgba(196,149,58,0.55)" : "rgba(255,255,255,0.55)",
              opacity: voice.transcribing ? 0.6 : 1,
            }}>
            <Mic size={22} color={GOLD_DEEP} />
          </Pressable>
          <Text style={{ fontSize: 12, color: C.muted }}>{micHint}</Text>
          {voice.error ? <Text style={{ fontSize: 12, color: "#C4553A" }}>{voice.error}</Text> : null}
        </View>
        <PrimaryBtn onClick={() => onConfirm(text || placeholder)} full>我说完了</PrimaryBtn>
      </ScrollView>
    </View>
  );
}

// ─── Summary Preview ─────────────────────────────────────────────────────────

function SceneSummaryPreview({ onBack, onConfirm }: {
  onBack: () => void; onConfirm: () => void;
}) {
  const night = useNight();
  const C = palette(night);
  const items = [
    { label: "地点", value: "学校门口" },
    { label: "人物", value: "朋友" },
    { label: "对方当前行动", value: "准备打车离开" },
    { label: "对方性格", value: "敏感、表面冷淡、希望对方先行动" },
    { label: "你想尝试", value: "叫住她并道歉" },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} title="场景整理" />
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}>
        <View>
          <Text style={{ fontSize: 17, fontWeight: "500", marginBottom: 4, color: C.text }}>我整理了一下</Text>
          <Text style={{ fontSize: 13, color: C.muted }}>有不准确的地方可以告诉我。</Text>
        </View>
        <View style={{
          borderRadius: 20, overflow: "hidden",
          backgroundColor: "rgba(255,252,245,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
        }}>
          {items.map((item, i) => (
            <View key={i} style={{
              flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 14,
              borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: "rgba(91,79,62,0.06)",
            }}>
              <Text style={{ fontSize: 12, width: 96, marginTop: 2, color: C.muted }}>{item.label}</Text>
              <Text style={{ fontSize: 14, flex: 1, lineHeight: 20, color: C.text }}>{item.value}</Text>
            </View>
          ))}
        </View>
        <View style={{ gap: 8, marginTop: "auto" }}>
          <PrimaryBtn onClick={onConfirm} full>就是这样，继续</PrimaryBtn>
          <Pressable onPress={onBack} style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: C.muted }}>有些地方不对，我重新说</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Character Setup（三步）───────────────────────────────────────────────────

function CharacterSetupSheet({ scene, onBack, onReady }: {
  scene: BuiltInScene | null; onBack: () => void;
  onReady: (char: { name: string; relation: string; desc: string; adjusted: string }) => void;
}) {
  const night = useNight();
  const C = palette(night);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [rel, setRel] = useState(scene?.relationships[0] ?? "");
  const [desc, setDesc] = useState("");
  const [adjusted, setAdjusted] = useState("");
  const [entryRipple, setEntryRipple] = useState(false);

  const mockTraits = [
    `说话${scene?.id === "dinner-table" ? "直接，语气偏强势" : "温柔，但习惯绕弯"}`,
    "关心你，但不擅长直接表达",
    "遇到冲突时容易先防御",
    "很少主动承认自己说重了",
    "担心常常表现为批评",
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* 模糊场景背景近似 */}
      <LinearGradient
        colors={scene?.colors ?? ["#F2E8D5", "#E8D9C0"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.35 }}
      />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,251,243,0.55)" }} />

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16 }}>
          <Pressable onPress={onBack}
            style={{
              width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
            }}>
            <ChevronLeft size={16} color={C.text2} />
          </Pressable>
          <View style={{ flex: 1, flexDirection: "row", justifyContent: "center", gap: 6 }}>
            {[0, 1, 2].map(i => (
              <View key={i} style={{
                height: 4, width: 32, borderRadius: 2,
                backgroundColor: i <= step ? "rgba(196,149,58,0.65)" : "rgba(91,79,62,0.12)",
              }} />
            ))}
          </View>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}>
          {step === 0 && (
            <>
              <View>
                <Text style={{ fontSize: 20, fontWeight: "500", marginBottom: 6, color: C.text }}>这个场景里，谁在你面前？</Text>
                <Text style={{ fontSize: 13, color: C.muted }}>不需要真实姓名，用你习惯的称呼。</Text>
              </View>
              <View style={{ gap: 12 }}>
                <TextInput
                  value={name} onChangeText={setName}
                  placeholder="比如：妈妈、她、老朋友…" placeholderTextColor={C.placeholder}
                  style={{
                    paddingHorizontal: 20, paddingVertical: 16, borderRadius: 20, fontSize: 15,
                    backgroundColor: "rgba(255,252,245,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)", color: "#484145",
                  }}
                />
                <View>
                  <Text style={{ fontSize: 12, marginBottom: 8, paddingHorizontal: 4, color: C.muted }}>关系</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {(scene?.relationships ?? ["朋友", "家人", "恋人", "同事"]).map(r => (
                      <Pressable key={r} onPress={() => setRel(r)}
                        style={{
                          paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                          backgroundColor: rel === r ? "rgba(246,231,168,0.88)" : "rgba(255,252,245,0.65)",
                          borderWidth: rel === r ? 1.5 : 1,
                          borderColor: rel === r ? "rgba(196,149,58,0.45)" : "rgba(255,255,255,0.45)",
                        }}>
                        <Text style={{ fontSize: 13, color: C.text }}>{r}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
              <View style={{ marginTop: 16 }}>
                <PrimaryBtn onClick={() => setStep(1)} full disabled={!rel}>继续</PrimaryBtn>
              </View>
            </>
          )}

          {step === 1 && (
            <>
              <View>
                <Text style={{ fontSize: 20, fontWeight: "500", marginBottom: 6, color: C.text }}>
                  像向一个没见过 TA 的朋友那样，介绍一下 TA。
                </Text>
                <Text style={{ fontSize: 13, color: C.muted }}>
                  TA 平时怎么说话？遇到冲突时会怎样？有什么话总是不愿意直接说？
                </Text>
              </View>
              <TextInput
                value={desc} onChangeText={setDesc}
                placeholder={`比如：${name || "她"}平时说话比较直，不太表达关心，但其实很在意我…`}
                placeholderTextColor={C.placeholder}
                multiline
                style={{
                  minHeight: 120, paddingHorizontal: 20, paddingVertical: 16, borderRadius: 20, fontSize: 14, lineHeight: 22,
                  backgroundColor: "rgba(255,252,245,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
                  color: "#484145", textAlignVertical: "top",
                }}
              />
              <View style={{ alignItems: "center", gap: 8 }}>
                <Pressable style={{
                  width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
                  backgroundColor: "rgba(246,231,168,0.72)", borderWidth: 2, borderColor: "rgba(255,255,255,0.55)",
                }}>
                  <Mic size={18} color={GOLD_DEEP} />
                </Pressable>
                <Text style={{ fontSize: 11, color: C.muted }}>也可以说</Text>
              </View>
              <PrimaryBtn onClick={() => setStep(2)} full>整理一下</PrimaryBtn>
            </>
          )}

          {step === 2 && (
            <>
              <View>
                <Text style={{ fontSize: 13, marginBottom: 2, color: C.muted }}>根据你说的，</Text>
                <Text style={{ fontSize: 20, fontWeight: "500", color: C.text }}>{name || "TA"}，在这场对话中：</Text>
              </View>
              <View style={{
                borderRadius: 20, overflow: "hidden",
                backgroundColor: "rgba(255,252,245,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
              }}>
                {mockTraits.map((trait, i) => (
                  <View key={i} style={{
                    flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingVertical: 12,
                    borderBottomWidth: i < mockTraits.length - 1 ? 1 : 0, borderBottomColor: "rgba(91,79,62,0.06)",
                  }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 6, backgroundColor: "rgba(196,149,58,0.55)" }} />
                    <Text style={{ fontSize: 14, lineHeight: 20, flex: 1, color: C.text }}>{trait}</Text>
                  </View>
                ))}
              </View>
              <View>
                <TextInput
                  value={adjusted} onChangeText={setAdjusted}
                  placeholder="有一点不像？补充一句…" placeholderTextColor={C.placeholder}
                  style={{
                    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, fontSize: 14,
                    backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", color: "#484145",
                  }}
                />
                <Text style={{ fontSize: 11, marginTop: 12, textAlign: "center", color: C.muted }}>
                  人物设定仅用于本次场景，离开后会清除。
                </Text>
              </View>
              <View style={{ gap: 8, marginTop: 8 }}>
                <View>
                  <CreamRipple active={entryRipple} />
                  <PrimaryBtn onClick={() => {
                    setEntryRipple(true);
                    setTimeout(() => {
                      setEntryRipple(false);
                      onReady({ name: name || "TA", relation: rel, desc, adjusted });
                    }, 380);
                  }} full>就是这样的，进入场景</PrimaryBtn>
                </View>
                <Pressable onPress={() => setStep(1)} style={{ paddingVertical: 12, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: C.muted }}>有一点不像，重新描述</Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Scene Screen ────────────────────────────────────────────────────────────

// 后端模板没有环境光字段，按 id 补默认值（本地卡片渲染用）
const _AMBIENT: Record<string, { ambientColor: string; ambientColor2: string }> = {
  "night-call": { ambientColor: "rgba(255,148,48,0.18)", ambientColor2: "rgba(255,200,100,0.10)" },
  "dinner-table": { ambientColor: "rgba(255,195,60,0.38)", ambientColor2: "rgba(255,230,140,0.22)" },
  "leaving-road": { ambientColor: "rgba(255,175,70,0.32)", ambientColor2: "rgba(240,200,130,0.18)" },
};
const _AMBIENT_DEFAULT = { ambientColor: "rgba(255,195,60,0.25)", ambientColor2: "rgba(255,230,140,0.15)" };

/** 后端 SceneOut（我的场景） */
interface MyScene {
  id: number; title: string; status: string; setting: string; turn: number;
}

/** 后端 CandidateOut（待确认片段） */
interface Candidate {
  id: number; content: string; surface_text: string; status: string | null; created_at: string;
}

export function SceneScreen({ onPlay }: { onPlay: (sceneId: number, theater?: TheaterSceneId) => void }) {
  const night = useNight();
  const C = palette(night);
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [subState, setSubState] = useState<SceneSubState>("browsing");
  const [selectedScene, setSelectedScene] = useState<BuiltInScene | null>(null);
  const [templates, setTemplates] = useState<BuiltInScene[]>(BUILT_IN_SCENES);
  const [myScenes, setMyScenes] = useState<MyScene[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [narration, setNarration] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const refreshCandidates = () =>
    listCandidates()
      .then((list) => setCandidates(Array.isArray(list) ? list : []))
      .catch(() => {});

  useEffect(() => {
    listSceneTemplates()
      .then((list) => {
        if (Array.isArray(list) && list.length) {
          setTemplates(list.map((t: any) => ({
            id: t.id, title: t.title, desc: t.desc,
            relationships: t.relationships ?? [],
            colors: (t.colors?.length ? t.colors : ["#F5ECD8", "#E2C9A0"]) as BuiltInScene["colors"],
            theater: (BUILT_IN_SCENES.find(b => b.id === t.id)?.theater ?? "bedroom") as TheaterSceneId,
            ...(_AMBIENT[t.id] ?? _AMBIENT_DEFAULT),
          })));
        }
      })
      .catch(() => { /* 离线用本地内置模板 */ });
    listScenes()
      .then((list) => setMyScenes(Array.isArray(list) ? list : []))
      .catch(() => {});
    refreshCandidates();
  }, []);

  const handleConfirmCandidate = (c: Candidate) => {
    if (generating) return;
    setGenerating(true);
    setGenError("");
    streamConfirmCandidate(c.id, (e) => {
      if (e.event === "done" && e.data?.scene_id) {
        setGenerating(false);
        onPlay(e.data.scene_id);
      }
    })
      .catch((err) => {
        setGenerating(false);
        setGenError(err?.message ?? "确认失败，再试一次");
      });
  };

  const handleDismissCandidate = (id: number) => {
    dismissCandidate(id).then(refreshCandidates).catch(() => {});
  };

  const handleBack = () => {
    if (subState === "capturing") setSubState("browsing");
    else if (subState === "reviewing") setSubState("capturing");
    else if (subState === "setup") setSubState(selectedScene ? "browsing" : "reviewing");
    else setSubState("browsing");
  };

  // 角色设定完成 → 真实生成开场，拿到 scene_id 进入演练
  // 手动路径走 galgame：非流式 createScene(render_kind=dynamic_image)，后端并发生成背景图+立绘，
  // 进入 ScenePlay 后按 render_kind 渲染动态图场景（DAY-217）。
  const handleCharReady = (char: { name: string; relation: string; desc: string; adjusted: string }) => {
    if (generating) return;
    setGenerating(true);
    setGenError("");
    const fields = {
      title: selectedScene?.title ?? (char.name ? `和${char.name}的那一刻` : "那一刻"),
      people: char.name + (char.relation ? `（${char.relation}）` : ""),
      place: selectedScene?.title ?? "",
      plot: [narration, char.desc].filter(Boolean).join("。"),
      intent: char.adjusted || char.desc || "试着说出没说的话",
      render_kind: "dynamic_image",
    };
    createScene(fields)
      .then((scene) => {
        setGenerating(false);
        // galgame 场景按 render_kind 渲染，theater 参数被忽略，沿用原选择即可
        onPlay(scene.id, selectedScene?.theater);
      })
      .catch((err) => {
        setGenerating(false);
        setGenError(err?.message ?? "生成失败，再试一次");
      });
  };

  if (generating) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
        <CreamRipple active />
        <Text style={{ fontSize: 15, color: C.text2 }}>正在替你搭片场…</Text>
        <Text style={{ fontSize: 12, color: C.muted }}>把场景和 TA 安排好，马上就好</Text>
      </View>
    );
  }

  if (subState === "capturing") {
    return <SceneNarrationCapture onBack={handleBack}
      onConfirm={(text) => { setNarration(text); setSubState("reviewing"); }} />;
  }
  if (subState === "reviewing") {
    return <SceneSummaryPreview onBack={handleBack} onConfirm={() => setSubState("setup")} />;
  }
  if (subState === "setup") {
    return <CharacterSetupSheet scene={selectedScene} onBack={handleBack} onReady={handleCharReady} />;
  }

  return (
    <View style={{ flex: 1 }}>
      {/* 整屏一个纵向滚动：标题 + 轮播 + 列表一起滚，轮播不再固定遮挡下方内容 */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
      <View style={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16 }}>
        <Text style={{ fontSize: 26, fontWeight: "500", letterSpacing: -0.5, color: C.text }}>片场</Text>
        <Text style={{ fontSize: 13, marginTop: 4, color: C.muted }}>进入一个场景，试着说出不同的话。</Text>
      </View>

      {/* Carousel */}
      <View style={{ height: 420 }}>
        <Animated.ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          snapToInterval={CAROUSEL_SNAP} snapToAlignment="start" decelerationRate="fast" disableIntervalMomentum
          contentContainerStyle={{ gap: CAROUSEL_GAP, paddingHorizontal: CAROUSEL_SIDE, alignItems: "center" }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            {
              useNativeDriver: true,
              listener: (e: any) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / CAROUSEL_SNAP);
                setActiveIdx(Math.max(0, Math.min(idx, templates.length - 1)));
              },
            }
          )}
          scrollEventThrottle={16}
        >
          {templates.map((scene, i) => (
            <ScenePortal key={scene.id} scene={scene} index={i} scrollX={scrollX} isActive={activeIdx === i}
              onEnter={() => { setSelectedScene(scene); setSubState("setup"); }} />
          ))}
        </Animated.ScrollView>
        <View style={{ position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {templates.map((_, i) => (
            <View key={i} style={{
              width: activeIdx === i ? 16 : 6, height: 6, borderRadius: 3,
              backgroundColor: activeIdx === i ? "rgba(196,149,58,0.7)" : "rgba(196,149,58,0.25)",
            }} />
          ))}
        </View>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {/* 我的场景（后端） */}
        {myScenes.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "500", marginBottom: 8, color: C.text2 }}>我的场景</Text>
            {myScenes.map(s => (
              <Pressable key={s.id} onPress={() => onPlay(s.id)}
                style={({ pressed }) => [{
                  padding: 16, borderRadius: 20, marginBottom: 8, flexDirection: "row", alignItems: "center",
                  backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "500", color: C.text }}>{s.title}</Text>
                  <Text style={{ fontSize: 12, marginTop: 2, color: C.muted }}>
                    {s.status === "settled" ? "已结算" : `进行中 · 第 ${s.turn} 轮`}
                  </Text>
                </View>
                <ChevronLeft size={15} color={C.muted} style={{ transform: [{ rotate: "180deg" }] }} />
              </Pressable>
            ))}
          </View>
        )}
        {/* 候选片段（后端） */}
        {candidates.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "500", marginBottom: 8, color: C.text2 }}>待确认片段</Text>
            {candidates.map(c => (
              <View key={c.id} style={{
                padding: 16, borderRadius: 20, marginBottom: 8,
                backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
              }}>
                <Text style={{ fontSize: 14, lineHeight: 20, color: C.text }}>
                  {(c.surface_text || c.content).slice(0, 120)}
                  {(c.surface_text || c.content).length > 120 ? "…" : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <Pressable onPress={() => handleConfirmCandidate(c)}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center",
                      backgroundColor: "rgba(246,231,168,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
                    }}>
                    <Text style={{ fontSize: 13, fontWeight: "500", color: "#4D4249" }}>进入场景</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDismissCandidate(c.id)}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center",
                      backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
                    }}>
                    <Text style={{ fontSize: 13, color: "#655D61" }}>忽略</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
        {!!genError && (
          <Text style={{ fontSize: 12, textAlign: "center", marginBottom: 8, color: "#A26458" }}>{genError}</Text>
        )}
        <View style={{ height: 1, marginVertical: 24, backgroundColor: "rgba(91,79,62,0.08)" }} />
        <CreateSceneEntry onStart={() => setSubState("capturing")} />
      </View>
      </ScrollView>
    </View>
  );
}

// ─── Character Artwork ───────────────────────────────────────────────────────

function CharacterArtwork({ name, isSpeaking, isListening, spriteUrl }: {
  name: string; isSpeaking: boolean; isListening: boolean; spriteUrl: string;
}) {
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isSpeaking) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(bounce, { toValue: -4, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(bounce, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [isSpeaking, bounce]);

  // 动态 galgame 立绘：图片人物（保留呼吸浮动 + 说话声波动效）
  return (
    <Animated.View style={{ alignItems: "center", transform: [{ translateY: bounce }] }}>
      {isListening && (
        <View style={{
          position: "absolute", top: 20, width: 260, height: 260, borderRadius: 130,
          backgroundColor: "rgba(246,231,168,0.18)",
        }} />
      )}
      <Image source={{ uri: spriteUrl }} resizeMode="contain"
        style={{ width: 300, height: 380 }} />
      {isSpeaking && (
        <View style={{ flexDirection: "row", gap: 3, marginTop: 6, alignItems: "flex-end", height: 14 }}>
          {[1, 2, 3].map(j => (
            <View key={j} style={{ width: 3, height: 4 + j * 3, backgroundColor: "rgba(255,255,255,0.75)", borderRadius: 1.5 }} />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ─── Scene Play ──────────────────────────────────────────────────────────────

interface SceneBeat { speaker: string; text: string; }
interface SceneChoice { id: string; label: string; }
interface SceneCharacter { name: string; sprite_url: string | null; }
interface SceneDetail {
  id: number; title: string; status: string; setting: string;
  beats: SceneBeat[] | null; choices: SceneChoice[] | null;
  history: any[] | null; turn: number;
  render_kind?: string | null;
  theater_id?: string | null;
  bg_image?: string | null;
  characters?: SceneCharacter[] | null;
}

export function ScenePlay({ sceneId, theater, onEnd }: {
  sceneId?: number | null;
  /** 背景 theater 3D 场景，默认家中餐桌 */
  theater?: TheaterSceneId;
  onEnd: () => void;
}) {
  const [phase, setPhase] = useState<"intro" | "playing" | "paused" | "busy">("intro");
  const [scene, setScene] = useState<SceneDetail | null>(null);
  const [error, setError] = useState("");
  const [streamText, setStreamText] = useState("");
  const [adjustInput, setAdjustInput] = useState("");
  const [showAdjust, setShowAdjust] = useState(false);
  const [showCustom, setShowCustom] = useState(false);   // 「自己说」输入行是否展开
  const [customText, setCustomText] = useState("");

  const loadScene = async () => {
    if (!sceneId) return;
    try {
      const s = await getScene(sceneId);
      setScene(s);
      setError("");
    } catch (err) {
      setError((err as any)?.message ?? "加载场景失败");
    }
  };

  useEffect(() => { loadScene(); }, [sceneId]);

  const speakers = new Set((scene?.beats ?? []).map(b => b.speaker).filter(s => s && s !== "旁白"));
  const charName = speakers.size > 0 ? Array.from(speakers)[0] : (scene?.title ?? "TA");
  const isDynamic = scene?.render_kind === "dynamic_image";
  const bgImageUrl = isDynamic ? absUrl(scene?.bg_image) : null;
  const spriteUrl = isDynamic ? absUrl(scene?.characters?.[0]?.sprite_url) : null;
  const spriteCharName = scene?.characters?.[0]?.name;
  // theater 优先用后端下发的 theater_id，其次 props，最后兜底 dining
  const effectiveTheater = ((scene?.theater_id as TheaterSceneId | undefined) ?? theater ?? "dining");
  const sceneName = scene?.title ?? "片场";
  const latestBeat = scene?.beats?.[scene.beats.length - 1];
  const isStreaming = phase === "busy" && streamText.length > 0;
  const isSpeaking = isStreaming || (phase === "playing" && latestBeat?.speaker === "旁白");

  // 推进剧情的公共 SSE 回调：逐字收 token，done 时刷新场景 / 结束。
  const advanceCb = (e: SSEEvent) => {
    if (e.event === "token" && e.data?.delta) setStreamText(t => t + e.data.delta);
    if (e.event === "done") {
      setTimeout(() => {
        loadScene().then(() => {
          setStreamText("");
          if (e.data?.ended) {
            onEnd();
          } else {
            setPhase("playing");
          }
        });
      }, e.data?.ended ? 1400 : 100);
    }
  };

  const handleChoice = (choice: SceneChoice) => {
    if (!sceneId || phase === "busy") return;
    setPhase("busy");
    setStreamText("");
    streamSceneChoice(sceneId, choice.id, advanceCb).catch((err) => {
      setPhase("playing");
      setError((err as any)?.message ?? "推进失败，请重试");
    });
  };

  // 「自己说」：提交用户自由输入，作为一次回应推进剧情。
  const handleCustom = () => {
    const text = customText.trim();
    if (!sceneId || phase === "busy" || !text) return;
    setShowCustom(false);
    setCustomText("");
    setPhase("busy");
    setStreamText("");
    streamSceneCustom(sceneId, text, advanceCb).catch((err) => {
      setPhase("playing");
      setError((err as any)?.message ?? "推进失败，请重试");
    });
  };

  const handleCalibrate = async () => {
    if (!sceneId || !adjustInput.trim()) return;
    try {
      await calibrateScene(sceneId, charName, adjustInput.trim());
      setAdjustInput("");
      setShowAdjust(false);
      setPhase("playing");
      await loadScene();
    } catch (err) {
      setError((err as any)?.message ?? "校准失败");
    }
  };

  if (!scene) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 15, color: "#847D72" }}>正在进入场景…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* 场景背景：动态 galgame 用背景图 / 无图兜底渐变，否则预置 3D 舞台 */}
      {isDynamic && bgImageUrl ? (
        <>
          <Image source={{ uri: bgImageUrl }} resizeMode="cover"
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
          {/* 暗化遮罩：保证字幕/按钮文字可读 */}
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(20,14,10,0.28)" }} />
        </>
      ) : isDynamic ? (
        <LinearGradient colors={["#2A1E14", "#3A2A1C", "#4A3626"]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : (
        <Scene3D sceneId={effectiveTheater} />
      )}

      {/* Top bar */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16, zIndex: 10 }}>
        <Pressable onPress={() => phase !== "busy" && setPhase(phase === "paused" ? "playing" : "paused")}
          disabled={phase === "busy"}
          style={{
            flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
            backgroundColor: "rgba(255,252,245,0.28)", borderWidth: 1, borderColor: "rgba(255,255,255,0.38)",
          }}>
          {phase === "paused" ? <Play size={12} color="rgba(255,255,255,0.82)" /> : <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.82)" }}>⏸</Text>}
          <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.82)" }}>{phase === "paused" ? "继续" : "暂停"}</Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 13, fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>{sceneName}</Text>
          <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{charName}</Text>
        </View>
        <Pressable onPress={onEnd}
          style={{
            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
            backgroundColor: "rgba(255,252,245,0.22)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)",
          }}>
          <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>离开</Text>
        </Pressable>
      </View>

      {/* Character（box-none：空白区手势穿透到底层 Scene3D，可拖动转视角；角色/按钮本身仍可点）
          始终占中间 flex:1 把底部字幕推到屏幕下方；仅动态 galgame 有立绘时才画人物，
          预置 3D 舞台交给场景本身表现（空容器手势穿透到 Scene3D）。 */}
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 16, zIndex: spriteUrl ? 10 : 1 }}>
        {spriteUrl && (
          <CharacterArtwork name={spriteCharName || charName} isSpeaking={isSpeaking} isListening={false} spriteUrl={spriteUrl} />
        )}
      </View>

      {/* playing / busy：电影字幕层（半透明渐变，尽量露出背后的 3D 舞台） */}
      {(phase === "playing" || phase === "busy") && (
        <LinearGradient
          colors={["transparent", "rgba(20,14,10,0.5)", "rgba(20,14,10,0.9)"]}
          style={{ paddingTop: 72, paddingHorizontal: 16, paddingBottom: 14, zIndex: 10 }}>
          {/* 旁白 / 对白：限高，可下拉滚动看全文 */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "500", color: "#E8C877" }}>
              {isStreaming ? "旁白" : (latestBeat?.speaker || charName)}
            </Text>
            {isSpeaking && (
              <View style={{ flexDirection: "row", gap: 2, alignItems: "flex-end", height: 12 }}>
                {[1, 2, 3].map(j => (
                  <View key={j} style={{ width: 2, height: 4 + j * 3, backgroundColor: "rgba(232,200,119,0.7)", borderRadius: 1 }} />
                ))}
              </View>
            )}
          </View>
          <ScrollView style={{ maxHeight: 148 }} nestedScrollEnabled showsVerticalScrollIndicator={true}>
            <Text style={{ fontSize: 15, lineHeight: 24, color: "rgba(255,255,255,0.95)" }}>
              {isStreaming ? streamText : (latestBeat?.text ?? "……")}
            </Text>
          </ScrollView>

          {phase === "playing" && (
            <View style={{ marginTop: 12, gap: 8 }}>
              {(scene?.choices ?? []).map(choice => (
                <Pressable key={choice.id} onPress={() => handleChoice(choice)}
                  style={({ pressed }) => ({
                    paddingVertical: 11, paddingHorizontal: 15, borderRadius: 16,
                    backgroundColor: "rgba(255,252,245,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)",
                    opacity: pressed ? 0.7 : 1,
                  })}>
                  <Text style={{ fontSize: 13, lineHeight: 19, color: "#FFFFFF" }}>{choice.label}</Text>
                </Pressable>
              ))}
              {/* 第三项：自己说（点开展开输入行） */}
              {!showCustom ? (
                <Pressable onPress={() => setShowCustom(true)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 7,
                    paddingVertical: 11, paddingHorizontal: 15, borderRadius: 16,
                    borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", borderStyle: "dashed",
                    backgroundColor: "rgba(255,252,245,0.06)",
                  }}>
                  <Edit3 size={13} color="rgba(255,255,255,0.72)" />
                  <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>自己说……</Text>
                </Pressable>
              ) : (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  paddingLeft: 15, paddingRight: 6, paddingVertical: 6, borderRadius: 24,
                  backgroundColor: "rgba(255,252,245,0.95)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
                }}>
                  <TextInput
                    value={customText} onChangeText={setCustomText} autoFocus
                    placeholder="说点你自己想说的…" placeholderTextColor="#A39A9F"
                    onSubmitEditing={handleCustom} returnKeyType="send"
                    style={{ flex: 1, fontSize: 14, color: "#484145", paddingVertical: 6 }} />
                  <Pressable onPress={handleCustom}
                    style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: GOLD_DEEP }}>
                    <Send size={15} color="#FFFFFF" />
                  </Pressable>
                </View>
              )}
              <Pressable onPress={onEnd} style={{ paddingVertical: 6, alignItems: "center" }}>
                <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>离开场景</Text>
              </Pressable>
            </View>
          )}

          {phase === "busy" && (
            <View style={{ paddingTop: 12, alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>正在继续…</Text>
            </View>
          )}
        </LinearGradient>
      )}

      {/* intro / paused：控制白面板（设置类界面，保留可读性好的实底） */}
      {(phase === "intro" || phase === "paused") && (
        <View style={{
          marginHorizontal: 12, marginBottom: 16, borderRadius: 28, overflow: "hidden", zIndex: 10,
          backgroundColor: "rgba(255,252,245,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.55)",
        }}>
          {phase === "intro" && (
            <View style={{ padding: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 14 }}>🌿</Text>
                <Text style={{ fontSize: 12, color: "#A39A9F" }}>小栖</Text>
              </View>
              <Text style={{ fontSize: 14, lineHeight: 22, marginBottom: 16, color: "#484145" }}>
                场景准备好了。你可以随时离开，这里没有对错。
              </Text>
              <Pressable onPress={() => setPhase("playing")}
                style={{ paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(246,231,168,0.82)" }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#4D4249" }}>好的，开始</Text>
              </Pressable>
            </View>
          )}

        {phase === "paused" && (
          <View style={{ padding: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", marginBottom: 16, color: "#484145" }}>已暂停</Text>
            {!!error && (
              <Text style={{ fontSize: 12, textAlign: "center", marginBottom: 12, color: "#A26458" }}>{error}</Text>
            )}
            {!showAdjust ? (
              <View style={{ gap: 8 }}>
                <Pressable onPress={() => setPhase("playing")}
                  style={{ paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(246,231,168,0.82)" }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#4D4249" }}>继续场景</Text>
                </Pressable>
                <Pressable onPress={() => setShowAdjust(true)}
                  style={{
                    paddingVertical: 12, borderRadius: 999, alignItems: "center",
                    backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
                  }}>
                  <Text style={{ fontSize: 14, color: "#655D61" }}>TA 不太像</Text>
                </Pressable>
                <Pressable onPress={onEnd} style={{ paddingVertical: 8, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: "#A39A9F" }}>离开场景</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: 13, color: "#847D72" }}>补充一句，比如"她不会这么快原谅我。"</Text>
                <TextInput
                  value={adjustInput} onChangeText={setAdjustInput}
                  placeholder="她其实更固执一点…" placeholderTextColor="#A39A9F" autoFocus
                  style={{
                    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, fontSize: 14,
                    backgroundColor: "rgba(255,252,245,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", color: "#484145",
                  }}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={() => setShowAdjust(false)}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(255,252,245,0.65)" }}>
                    <Text style={{ fontSize: 13, color: "#655D61" }}>取消</Text>
                  </Pressable>
                  <Pressable onPress={handleCalibrate}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(246,231,168,0.82)" }}>
                    <Text style={{ fontSize: 13, fontWeight: "500", color: "#4D4249" }}>调整后继续</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
      )}
    </View>
  );
}

// ─── Scene End ───────────────────────────────────────────────────────────────

export function SceneEnd({ sceneId, onBack, onReplay }: { sceneId?: number | null; onBack: () => void; onReplay: () => void }) {
  const [saved, setSaved] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState("");
  const [keyQuote, setKeyQuote] = useState("……");

  useEffect(() => {
    if (!sceneId) return;
    getScene(sceneId).then((s: SceneDetail) => {
      const beats = s.beats || [];
      const last = beats[beats.length - 1];
      if (last?.text) setKeyQuote(last.text);
    }).catch(() => {});
  }, [sceneId]);

  const doSettle = async (keep: boolean) => {
    if (!sceneId || settling) return;
    setSettling(true);
    try {
      await settleScene(sceneId, {
        card_text: keyQuote,
        insight_text: keyQuote,
        action_text: "带着这份感受，继续下一步",
        keep,
      });
      setSaved(keep);
      setError("");
    } catch (err) {
      setError((err as any)?.message ?? "结算失败");
    }
    setSettling(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={["#FFFBF3", "#F9EDD8"]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{
        position: "absolute", top: 100, left: "50%", marginLeft: -180,
        width: 360, height: 260, borderRadius: 180, backgroundColor: "rgba(246,231,168,0.30)",
      }} />

      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        <View style={{ paddingTop: 52, paddingBottom: 24 }}>
          <Text style={{ fontSize: 13, marginBottom: 6, color: "#A39A9F" }}>这一次，你说出了</Text>
          <Text style={{ fontSize: 22, fontWeight: "500", lineHeight: 32, color: "#484145" }}>
            "{keyQuote}"
          </Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
          <View style={{
            borderRadius: 22, padding: 20,
            backgroundColor: "rgba(255,252,245,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.55)",
          }}>
            <Text style={{ fontSize: 22, lineHeight: 22, marginBottom: 8, color: "rgba(196,149,58,0.35)", fontFamily: "serif" }}>"</Text>
            <Text style={{ fontSize: 17, lineHeight: 26, fontWeight: "500", color: "#484145" }}>{keyQuote}</Text>
          </View>

          <View style={{
            borderRadius: 18, paddingHorizontal: 20, paddingVertical: 16,
            backgroundColor: "rgba(246,231,168,0.32)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Text style={{ fontSize: 13 }}>🌿</Text>
              <Text style={{ fontSize: 12, color: "#A39A9F" }}>小栖</Text>
            </View>
            <Text style={{ fontSize: 14, lineHeight: 22, color: "#847D72" }}>
              这里没有答案，也没有正确的说法。你表达了，这就够了。
            </Text>
          </View>

          {!!error && (
            <Text style={{ fontSize: 12, textAlign: "center", color: "#A26458" }}>{error}</Text>
          )}

          <View style={{ gap: 8, paddingTop: 16 }}>
            {!saved ? (
              <Pressable onPress={() => doSettle(true)} disabled={settling}
                style={{ paddingVertical: 14, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(246,231,168,0.88)", opacity: settling ? 0.6 : 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#4D4249" }}>{settling ? "正在保存…" : "把这句话留下"}</Text>
              </Pressable>
            ) : (
              <View style={{ paddingVertical: 14, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(221,237,227,0.72)" }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#484145" }}>已放入长久珍藏 ✦</Text>
              </View>
            )}
            <Pressable onPress={onReplay}
              style={{
                paddingVertical: 14, borderRadius: 999, alignItems: "center",
                backgroundColor: "rgba(255,252,245,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
              }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: "#484145" }}>再试一次</Text>
            </Pressable>
            <Pressable onPress={() => { doSettle(false).then(() => onBack()); }} style={{ paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: "#A39A9F" }}>直接离开</Text>
            </Pressable>
            <Text style={{ fontSize: 11, textAlign: "center", marginTop: 4, color: "#D0C8BF" }}>
              离开后，场景中的人物设定和对话将被清除。
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
