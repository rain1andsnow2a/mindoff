/**
 * 片场创建流程：内置场景轮播卡（ScenePortal）、语音创建入口（CreateSceneEntry）、
 * 口述采集（SceneNarrationCapture）、整理预览（SceneSummaryPreview）、角色设定（CharacterSetupSheet）。
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated, Dimensions, Easing, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, Mic } from "lucide-react-native";
import { Button, CreamRipple, useReducedMotion, paperColors } from "../../design-system";
import { parseSceneNarration, parseSceneRole } from "../../api";
import type { SceneParseResult } from "../../api";
import { useVoiceInput } from "../../useVoiceInput";
import { BuiltInScene, CharReady, SceneHeader, useSceneSurface } from "./shared";

export const CAROUSEL_CARD_W = 310;
export const CAROUSEL_GAP = 16;
export const CAROUSEL_SNAP = CAROUSEL_CARD_W + CAROUSEL_GAP;   // 每次吸附一张的间距
export const CAROUSEL_SIDE = Math.max(16, (Dimensions.get("window").width - CAROUSEL_CARD_W) / 2); // 两端留白，让首尾卡片也能居中

/** 内置场景轮播卡：跟手连续缩放/淡入，当前卡片放大居中。 */
export function ScenePortal({ scene, index, scrollX, isActive, onEnter }: {
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

/** 语音创建入口：脉冲麦克风，点击进入口述采集。 */
export function CreateSceneEntry({ onStart }: { onStart: () => void }) {
  const { theme, C } = useSceneSurface();
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

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
            backgroundColor: theme.colors.accentSoft, transform: [{ scale: pulse }], opacity: 0.55,
          }} />
          <Pressable onPress={onStart}
            style={({ pressed }) => [{
              width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
              backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border,
              transform: [{ scale: pressed ? 0.93 : 1 }],
            }]}>
            <Mic size={20} color={theme.colors.accent} />
          </Pressable>
        </View>
        <Pressable onPress={onStart}>
          <Text style={{ fontSize: 12, color: C.muted }}>用文字描述</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** 口述采集：按住麦克录音转写，或直接文字输入。 */
export function SceneNarrationCapture({ onBack, onConfirm }: {
  onBack: () => void; onConfirm: (text: string) => void;
}) {
  const { theme, C } = useSceneSurface();
  const [text, setText] = useState("");
  // 真实 STT：按住麦克录音，松手转写后追加到描述框（复用 useVoiceInput，真机走原生 PCM）
  const voice = useVoiceInput((t) => setText((prev) => (prev ? `${prev}${t}` : t)));
  const placeholder = "我想回到上周和朋友吵架之后。地点在学校门口，她准备打车离开。她平时比较敏感，生气后会假装不在意，但其实很希望我先道歉。我想试着把她叫住。";
  const micHint = voice.transcribing ? "正在转写…" : voice.isRecording ? "松开结束录音" : "按住说话";
  return (
    <View style={{ flex: 1 }}>
      <SceneHeader onBack={onBack} title="描述你的场景" />
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
            backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
            color: theme.colors.textPrimary, textAlignVertical: "top",
          }}
        />
        <View style={{ alignItems: "center", gap: 12 }}>
          <Pressable
            onPressIn={() => { voice.start(); }} onPressOut={() => { voice.stop(); }}
            disabled={voice.transcribing}
            style={{
              width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center",
              backgroundColor: voice.isRecording ? theme.colors.accentSoft : theme.colors.surface,
              borderWidth: 2, borderColor: voice.isRecording ? theme.colors.accent : theme.colors.border,
              opacity: voice.transcribing ? 0.6 : 1,
            }}>
            <Mic size={22} color={theme.colors.accent} />
          </Pressable>
          <Text style={{ fontSize: 12, color: C.muted }}>{micHint}</Text>
          {voice.error ? <Text style={{ fontSize: 12, color: "#C4553A" }}>{voice.error}</Text> : null}
        </View>
        <Button onPress={() => onConfirm(text || placeholder)} fullWidth>我说完了</Button>
      </ScrollView>
    </View>
  );
}

/** 整理预览：把口述送后端整理成结构化字段，失败可重试。 */
export function SceneSummaryPreview({ narration, onBack, onConfirm }: {
  narration: string;
  onBack: () => void;
  onConfirm: (parsed: SceneParseResult) => void;
}) {
  const { theme, C } = useSceneSurface();
  const [parsed, setParsed] = useState<SceneParseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 进页面就把用户刚说的那段送去整理；失败给重试，不再显示写死的示例数据
  const run = React.useCallback(() => {
    setLoading(true);
    setError("");
    parseSceneNarration(narration)
      .then((res) => setParsed(res))
      .catch((e) => setError(e?.message ?? "整理失败，再试一次"))
      .finally(() => setLoading(false));
  }, [narration]);

  useEffect(() => { run(); }, [run]);

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <SceneHeader onBack={onBack} title="场景整理" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <CreamRipple active />
          <Text style={{ fontSize: 15, color: C.text2 }}>我在整理你刚说的…</Text>
        </View>
      </View>
    );
  }

  if (error || !parsed) {
    return (
      <View style={{ flex: 1 }}>
        <SceneHeader onBack={onBack} title="场景整理" />
        <View style={{ flex: 1, paddingHorizontal: 20, gap: 16, justifyContent: "center" }}>
          <Text style={{ fontSize: 15, color: C.text, textAlign: "center" }}>{error || "整理失败"}</Text>
          <Button onPress={run} fullWidth>再试一次</Button>
          <Pressable onPress={onBack} style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: C.muted }}>回去重新说</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const items = parsed.items ?? [];
  const hasMissing = (parsed.missing?.length ?? 0) > 0;
  return (
    <View style={{ flex: 1 }}>
      <SceneHeader onBack={onBack} title="场景整理" />
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}>
        <View>
          <Text style={{ fontSize: 17, fontWeight: "500", marginBottom: 4, color: C.text }}>我整理了一下</Text>
          <Text style={{ fontSize: 13, color: C.muted }}>
            {parsed.parsed ? "有不准确的地方可以告诉我。" : "我没太听清，下一步你可以自己补上。"}
          </Text>
        </View>
        <View style={{
          borderRadius: 20, overflow: "hidden",
          backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        }}>
          {items.map((item, i) => (
            <View key={item.key ?? i} style={{
              flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 14,
              borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: theme.colors.divider,
            }}>
              <Text style={{ fontSize: 12, width: 96, marginTop: 2, color: C.muted }}>{item.label}</Text>
              {/* 用户没提到的字段留空，不编造内容 */}
              <Text style={{
                fontSize: 14, flex: 1, lineHeight: 20,
                color: item.value ? C.text : C.placeholder,
                fontStyle: item.value ? "normal" : "italic",
              }}>
                {item.value || "你没提到，下一步可以补充"}
              </Text>
            </View>
          ))}
        </View>
        {hasMissing ? (
          <Text style={{ fontSize: 12, color: C.muted }}>
            空着的部分不影响继续，进入下一步时可以补。
          </Text>
        ) : null}
        <View style={{ gap: 8, marginTop: "auto" }}>
          <Button onPress={() => onConfirm(parsed)} fullWidth>就是这样，继续</Button>
          <Pressable onPress={onBack} style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: C.muted }}>有些地方不对，我重新说</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** 角色设定：称呼/关系/介绍/补充，静默请求行为倾向，确认后进入场景。 */
export function CharacterSetupSheet({ scene, parsed, onBack, onReady }: {
  scene: BuiltInScene | null;
  /** 走「描述场景」路径时带上场景整理结果，用来预填称呼/关系/行为倾向 */
  parsed?: SceneParseResult | null;
  onBack: () => void;
  onReady: (char: CharReady) => void;
}) {
  const { C } = useSceneSurface();
  const [name, setName] = useState(parsed?.people ?? "");
  const [rel, setRel] = useState(parsed?.relation || scene?.relationships[0] || "");
  const [desc, setDesc] = useState("");
  const [adjusted, setAdjusted] = useState("");
  const [entryRipple, setEntryRipple] = useState(false);
  // 渲染方式：默认生成式 3D（方案 A），可切回图片 galgame
  const [renderKind, setRenderKind] = useState<"generated_3d" | "dynamic_image">("generated_3d");

  // 静默请求后端整理 TA 的行为倾向（不阻塞进入，traits 在搭建时一并使用）
  const traitsRef = React.useRef<string[]>(parsed?.counterpart_traits ?? []);
  const traitsFiredRef = React.useRef(false);
  // 进入涟漪计时器：卸载时清理，避免卸载后 setState
  const enterTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (enterTimer.current) clearTimeout(enterTimer.current); }, []);
  React.useEffect(() => {
    if (traitsFiredRef.current) return;
    if (!name && !desc) return;
    traitsFiredRef.current = true;
    parseSceneRole({
      name, relation: rel, desc,
      extra_traits: parsed?.counterpart_traits ?? [],
    })
      .then((res) => { traitsRef.current = res.traits ?? []; })
      .catch(() => { /* 静默失败，不影响进入 */ });
  }, [name, rel, desc, parsed]);

  const handleEnter = () => {
    setEntryRipple(true);
    if (enterTimer.current) clearTimeout(enterTimer.current);
    enterTimer.current = setTimeout(() => {
      setEntryRipple(false);
      onReady({ name: name || "TA", relation: rel, desc, adjusted, traits: traitsRef.current, renderKind });
    }, 380);
  };

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
          <View style={{ flex: 1 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}>
          {/* 第一步：谁在你面前 */}
          <View>
            <Text style={{ fontSize: 20, fontWeight: "500", marginBottom: 6, color: C.text }}>这个场景里，谁在你面前？</Text>
            <Text style={{ fontSize: 13, color: C.muted }}>不需要真实姓名，用你习惯的称呼就好。</Text>
          </View>

          <TextInput
            value={name} onChangeText={setName}
            placeholder="比如：妈妈、她、老朋友…" placeholderTextColor={C.placeholder}
            style={{
              paddingHorizontal: 20, paddingVertical: 16, borderRadius: 20, fontSize: 15,
              backgroundColor: "rgba(255,252,245,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)", color: paperColors.ink,
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

          {/* 第二步：介绍一下 TA */}
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: "500", marginBottom: 6, color: C.text }}>
              像向一个没见过 TA 的朋友那样，介绍一下 TA。
            </Text>
            <Text style={{ fontSize: 13, color: C.muted }}>
              TA 平时怎么说话？遇到冲突时会怎样？想到什么说什么，不用很准确。
            </Text>
          </View>

          <TextInput
            value={desc} onChangeText={setDesc}
            placeholder={`比如：${name || "她"}平时说话比较直，不太表达关心，但其实很在意我…`}
            placeholderTextColor={C.placeholder}
            multiline
            style={{
              minHeight: 100, paddingHorizontal: 20, paddingVertical: 16, borderRadius: 20, fontSize: 14, lineHeight: 22,
              backgroundColor: "rgba(255,252,245,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
              color: paperColors.ink, textAlignVertical: "top",
            }}
          />

          {/* 可选：补充校准 */}
          <TextInput
            value={adjusted} onChangeText={setAdjusted}
            placeholder="还有什么想补充的？（可选）" placeholderTextColor={C.placeholder}
            style={{
              paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, fontSize: 14,
              backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", color: paperColors.ink,
            }}
          />

          <View style={{ gap: 8, marginTop: 8 }}>
            {/* 渲染方式选择：3D 场景（生成式低多边形）/ 图片场景（galgame） */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {([["generated_3d", "3D 场景"], ["dynamic_image", "图片场景"]] as const).map(([k, label]) => {
                const on = renderKind === k;
                return (
                  <Pressable key={k} onPress={() => setRenderKind(k)}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: "center",
                      backgroundColor: on ? "rgba(246,231,168,0.88)" : "rgba(255,252,245,0.65)",
                      borderWidth: on ? 1.5 : 1,
                      borderColor: on ? "rgba(196,149,58,0.45)" : "rgba(255,255,255,0.45)",
                    }}>
                    <Text style={{ fontSize: 13, fontWeight: on ? "600" : "400", color: on ? paperColors.ink : paperColors.sub }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View>
              <CreamRipple active={entryRipple} />
              <Button onPress={handleEnter} fullWidth>进入场景</Button>
            </View>
            <Text style={{ fontSize: 11, textAlign: "center", color: C.muted }}>
              人物设定仅用于本次场景，离开后会清除。进入后觉得 TA 不太像，随时可以校准。
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
