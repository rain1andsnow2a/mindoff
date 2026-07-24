/**
 * 片场模块（移植自 proto）：
 * SceneScreen（内置场景轮播 + 语音创建入口 + 整理预览 + 角色设定三步）
 * ScenePlay（视觉小说式对话 + 暂停/校准「TA 不太像」）
 * SceneEnd（结算卡 + 珍藏/重演/离开）
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated, Easing, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, Mic, Play } from "lucide-react-native";
import { CreamRipple, PrimaryBtn, SafeHeader } from "../components";
import { GOLD_DEEP, palette, useNight } from "../theme";

// ─── Data ────────────────────────────────────────────────────────────────────

interface BuiltInScene {
  id: string; title: string; desc: string;
  relationships: string[]; colors: [string, string, ...string[]];
  ambientColor: string; ambientColor2: string;
}

const BUILT_IN_SCENES: BuiltInScene[] = [
  {
    id: "night-call", title: "深夜通话",
    desc: "有些话，隔着一通电话才说得出口。",
    relationships: ["恋人", "朋友", "异地家人"],
    colors: ["#261A10", "#3A2618", "#4D3828", "#5C4838"],
    ambientColor: "rgba(255,148,48,0.18)", ambientColor2: "rgba(255,200,100,0.10)",
  },
  {
    id: "dinner-table", title: "家中餐桌",
    desc: "最难说出口的话，常常发生在最熟悉的地方。",
    relationships: ["父母", "家庭", "伴侣"],
    colors: ["#F5ECD8", "#EDD9BE", "#E2C9A0"],
    ambientColor: "rgba(255,195,60,0.38)", ambientColor2: "rgba(255,230,140,0.22)",
  },
  {
    id: "leaving-road", title: "离开的路上",
    desc: "有些告别，也许还来得及换一种说法。",
    relationships: ["恋人", "朋友", "同学", "同事"],
    colors: ["#E8D5C0", "#D9C09E", "#C8A882", "#B89878"],
    ambientColor: "rgba(255,175,70,0.32)", ambientColor2: "rgba(240,200,130,0.18)",
  },
];

type SceneSubState = "browsing" | "capturing" | "reviewing" | "setup";

// ─── Scene Portal ────────────────────────────────────────────────────────────

function ScenePortal({ scene, isActive, onEnter }: {
  scene: BuiltInScene; isActive: boolean; onEnter: () => void;
}) {
  return (
    <Pressable onPress={isActive ? onEnter : undefined}
      style={{
        width: 310, height: 390, borderRadius: 30, overflow: "hidden",
        opacity: isActive ? 1 : 0.72, transform: [{ scale: isActive ? 1 : 0.93 }],
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
  const [isRecording, setIsRecording] = useState(false);
  const placeholder = "我想回到上周和朋友吵架之后。地点在学校门口，她准备打车离开。她平时比较敏感，生气后会假装不在意，但其实很希望我先道歉。我想试着把她叫住。";
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
            onPressIn={() => setIsRecording(true)} onPressOut={() => setIsRecording(false)}
            style={{
              width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center",
              backgroundColor: isRecording ? "rgba(243,216,199,0.88)" : "rgba(246,231,168,0.72)",
              borderWidth: 2, borderColor: isRecording ? "rgba(196,149,58,0.55)" : "rgba(255,255,255,0.55)",
            }}>
            <Mic size={22} color={GOLD_DEEP} />
          </Pressable>
          <Text style={{ fontSize: 12, color: C.muted }}>{isRecording ? "松开结束录音" : "按住说话"}</Text>
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
  scene: BuiltInScene | null; onBack: () => void; onReady: () => void;
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
                    setTimeout(() => { setEntryRipple(false); onReady(); }, 380);
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

export function SceneScreen({ onPlay }: { onPlay: () => void }) {
  const night = useNight();
  const C = palette(night);
  const [activeIdx, setActiveIdx] = useState(0);
  const [subState, setSubState] = useState<SceneSubState>("browsing");
  const [selectedScene, setSelectedScene] = useState<BuiltInScene | null>(null);

  const handleBack = () => {
    if (subState === "capturing") setSubState("browsing");
    else if (subState === "reviewing") setSubState("capturing");
    else if (subState === "setup") setSubState(selectedScene ? "browsing" : "reviewing");
    else setSubState("browsing");
  };

  if (subState === "capturing") {
    return <SceneNarrationCapture onBack={handleBack} onConfirm={() => setSubState("reviewing")} />;
  }
  if (subState === "reviewing") {
    return <SceneSummaryPreview onBack={handleBack} onConfirm={() => setSubState("setup")} />;
  }
  if (subState === "setup") {
    return <CharacterSetupSheet scene={selectedScene} onBack={handleBack} onReady={onPlay} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16 }}>
        <Text style={{ fontSize: 26, fontWeight: "500", letterSpacing: -0.5, color: C.text }}>片场</Text>
        <Text style={{ fontSize: 13, marginTop: 4, color: C.muted }}>进入一个场景，试着说出不同的话。</Text>
      </View>

      {/* Carousel */}
      <View style={{ height: 420 }}>
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 16, paddingHorizontal: 24, alignItems: "center" }}
          onScroll={e => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / 326);
            setActiveIdx(Math.max(0, Math.min(idx, BUILT_IN_SCENES.length - 1)));
          }}
          scrollEventThrottle={16}
        >
          {BUILT_IN_SCENES.map((scene, i) => (
            <ScenePortal key={scene.id} scene={scene} isActive={activeIdx === i}
              onEnter={() => { setSelectedScene(scene); setSubState("setup"); }} />
          ))}
        </ScrollView>
        <View style={{ position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {BUILT_IN_SCENES.map((_, i) => (
            <View key={i} style={{
              width: activeIdx === i ? 16 : 6, height: 6, borderRadius: 3,
              backgroundColor: activeIdx === i ? "rgba(196,149,58,0.7)" : "rgba(196,149,58,0.25)",
            }} />
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        <View style={{ height: 1, marginVertical: 24, backgroundColor: "rgba(91,79,62,0.08)" }} />
        <CreateSceneEntry onStart={() => setSubState("capturing")} />
      </ScrollView>
    </View>
  );
}

// ─── Character Artwork ───────────────────────────────────────────────────────

function CharacterArtwork({ name, isSpeaking, isListening }: {
  name: string; isSpeaking: boolean; isListening: boolean;
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

  return (
    <Animated.View style={{ alignItems: "center", transform: [{ translateY: bounce }] }}>
      {isListening && (
        <View style={{
          position: "absolute", width: 190, height: 190, borderRadius: 95,
          backgroundColor: "rgba(246,231,168,0.20)",
        }} />
      )}
      <View style={{
        width: 150, height: 150, borderRadius: 75, alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(255,252,245,0.55)", borderWidth: 2, borderColor: "rgba(255,255,255,0.6)",
      }}>
        <Text style={{ fontSize: 40, fontWeight: "500", color: "#8C6D3A" }}>{name.slice(0, 1)}</Text>
        <Text style={{ fontSize: 13, marginTop: 4, color: "#84726A" }}>{name}</Text>
      </View>
      {isSpeaking && (
        <View style={{ flexDirection: "row", gap: 3, marginTop: 14, alignItems: "flex-end", height: 14 }}>
          {[1, 2, 3].map(j => (
            <View key={j} style={{ width: 3, height: 4 + j * 3, backgroundColor: "rgba(196,149,58,0.6)", borderRadius: 1.5 }} />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ─── Scene Play ──────────────────────────────────────────────────────────────

export function ScenePlay({ onEnd }: { onEnd: () => void }) {
  const [phase, setPhase] = useState<"intro" | "playing" | "paused">("intro");
  const [dlgIdx, setDlgIdx] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [adjustInput, setAdjustInput] = useState("");
  const [showAdjust, setShowAdjust] = useState(false);

  const charName = "妈妈";
  const sceneName = "家中餐桌";

  const dialogs = [
    { from: "char", text: "你最近怎么了？感觉你一直很忙，也不怎么联系家里…" },
    { from: "user-prompt", text: "你想说什么？" },
    { from: "char", text: "我就是担心你。你一个人在外面，遇到事情了也不跟我说。" },
  ];
  const curr = dlgIdx < dialogs.length ? dialogs[dlgIdx] : dialogs[dialogs.length - 1];

  const handleUserSpeak = () => {
    setIsListening(v => !v);
    if (isListening) {
      setTimeout(() => {
        setIsListening(false);
        setIsSpeaking(true);
        setDlgIdx(i => Math.min(i + 1, dialogs.length - 1));
        setTimeout(() => setIsSpeaking(false), 2800);
      }, 800);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* 场景背景：餐桌暖色渐变 + 灯光 */}
      <LinearGradient colors={["#EDD9BE", "#E2C9A0", "#D8BA8A"]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        <View style={{
          position: "absolute", width: 280, height: 280, top: 60, left: "50%", marginLeft: -140,
          borderRadius: 140, backgroundColor: "rgba(255,195,60,0.25)",
        }} />
      </LinearGradient>

      {/* Top bar */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16, zIndex: 10 }}>
        <Pressable onPress={() => setPhase(phase === "paused" ? "playing" : "paused")}
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

      {/* Character */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 16, zIndex: 10 }}>
        <CharacterArtwork name={charName} isSpeaking={isSpeaking} isListening={isListening} />
      </View>

      {/* 字幕 + 控制面板 */}
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
            <Pressable onPress={() => { setPhase("playing"); setIsSpeaking(true); setTimeout(() => setIsSpeaking(false), 2400); }}
              style={{ paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(246,231,168,0.82)" }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: "#4D4249" }}>好的，开始</Text>
            </Pressable>
          </View>
        )}

        {phase === "playing" && (
          <View>
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
              {curr.from === "char" && (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: GOLD_DEEP }}>{charName}</Text>
                    {isSpeaking && (
                      <View style={{ flexDirection: "row", gap: 2, alignItems: "flex-end", height: 12 }}>
                        {[1, 2, 3].map(j => (
                          <View key={j} style={{ width: 2, height: 4 + j * 3, backgroundColor: "rgba(196,149,58,0.6)", borderRadius: 1 }} />
                        ))}
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 15, lineHeight: 23, color: "#484145" }}>{curr.text}</Text>
                </>
              )}
              {curr.from === "user-prompt" && (
                <Text style={{ fontSize: 13, textAlign: "center", paddingVertical: 4, color: "#A39A9F" }}>
                  轻点麦克风，说出你想说的话
                </Text>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, gap: 16 }}>
              <Pressable onPress={() => setDlgIdx(i => Math.min(i + 1, dialogs.length - 1))}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center",
                  backgroundColor: "rgba(246,231,168,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
                }}>
                <Text style={{ fontSize: 12, color: "#4D4249" }}>换一种说法</Text>
              </Pressable>
              <Pressable onPress={handleUserSpeak}
                style={{
                  width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center",
                  backgroundColor: isListening ? "rgba(243,216,199,0.95)" : "rgba(246,231,168,0.88)",
                  borderWidth: 2, borderColor: isListening ? "rgba(196,149,58,0.65)" : "rgba(255,255,255,0.55)",
                }}>
                <Mic size={22} color={GOLD_DEEP} />
              </Pressable>
              <Pressable onPress={onEnd}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center",
                  backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
                }}>
                <Text style={{ fontSize: 12, color: "#655D61" }}>离开场景</Text>
              </Pressable>
            </View>
          </View>
        )}

        {phase === "paused" && (
          <View style={{ padding: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", marginBottom: 16, color: "#484145" }}>已暂停</Text>
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
                  <Pressable onPress={() => { setShowAdjust(false); setAdjustInput(""); setPhase("playing"); }}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(246,231,168,0.82)" }}>
                    <Text style={{ fontSize: 13, fontWeight: "500", color: "#4D4249" }}>调整后继续</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Scene End ───────────────────────────────────────────────────────────────

export function SceneEnd({ onBack, onReplay }: { onBack: () => void; onReplay: () => void }) {
  const [saved, setSaved] = useState(false);
  const keyQuote = "我其实一直很在意。";

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

          <View style={{ gap: 8, paddingTop: 16 }}>
            {!saved ? (
              <Pressable onPress={() => setSaved(true)}
                style={{ paddingVertical: 14, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(246,231,168,0.88)" }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#4D4249" }}>把这句话留下</Text>
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
            <Pressable onPress={onBack} style={{ paddingVertical: 12, alignItems: "center" }}>
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
