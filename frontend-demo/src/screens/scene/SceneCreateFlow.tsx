/**
 * 片场创建流程：内置场景轮播卡（ScenePortal）、语音创建入口（CreateSceneEntry）、
 * 口述采集（SceneNarrationCapture）、整理预览（SceneSummaryPreview）、角色设定（CharacterSetupSheet）。
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated, Dimensions, Easing, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Lock, Mic } from "lucide-react-native";
import { Button, CreamRipple, useReducedMotion, paperColors } from "../../design-system";
import { parseSceneNarration, parseSceneRole } from "../../api";
import type { SceneParseResult } from "../../api";
import { useVoiceInput } from "../../useVoiceInput";
import { ActBar, BuiltInScene, CharReady, useSceneSurface } from "./shared";

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

/** 语音创建入口：第一幕 · 讲述的入口——大标题 + 麦克风光晕 + 或写下来。 */
export function CreateSceneEntry({ onStart }: { onStart: () => void }) {
  const { theme, C } = useSceneSurface();
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) return;
    // 呼吸节奏贴近一次深呼吸（3.6s），比原 1.4s 更安静
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.14, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  return (
    <View style={{ marginTop: 32, marginBottom: 16 }}>
      <View style={{ alignItems: "center", marginBottom: 22 }}>
        <Text style={{
          fontSize: 22, fontWeight: "700", lineHeight: 31, textAlign: "center", color: C.text,
        }}>
          想重演的，{"\n"}是哪一天？
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 21, textAlign: "center", marginTop: 8, color: C.muted }}>
          讲给我听，或者慢慢写下来。{"\n"}不用组织好语言，也不用从头讲起。
        </Text>
      </View>

      <View style={{ alignItems: "center", gap: 12 }}>
        <View style={{ width: 128, height: 128, alignItems: "center", justifyContent: "center" }}>
          <Animated.View style={{
            position: "absolute", width: 128, height: 128, borderRadius: 64,
            backgroundColor: theme.colors.accentSoft, transform: [{ scale: pulse }], opacity: 0.85,
          }} />
          <Pressable onPress={onStart}
            style={({ pressed }) => ({
              width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center",
              backgroundColor: theme.colors.accentSurface,
              borderWidth: 1.5, borderColor: "rgba(255,255,255,0.55)",
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}>
            <Mic size={30} color={theme.colors.textOnAccent} />
          </Pressable>
        </View>
        <Pressable onPress={onStart} accessibilityRole="button" accessibilityLabel="开始讲述"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ fontSize: 12.5, color: C.muted }}>点一下，开始讲</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 14 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.divider }} />
        <Text style={{ fontSize: 11.5, color: C.muted }}>或者写下来</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.divider }} />
      </View>

      <Pressable onPress={onStart} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <View style={{
          padding: 14, minHeight: 74, borderRadius: 20,
          backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        }}>
          <Text style={{ fontSize: 13.5, color: C.placeholder }}>那件事发生在……</Text>
        </View>
      </Pressable>

      <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}>
        <Lock size={12} color={C.muted} />
        <Text style={{ fontSize: 11, color: C.muted }}>这里说的话，只留在你和喵灵之间</Text>
      </View>
    </View>
  );
}

/** 第一幕 · 讲述：按住麦克录音转写，或直接文字输入；「我在听」波形示意正在采集。 */
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
      <ActBar stage={0} onBack={onBack} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}>
        <View style={{ paddingTop: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", lineHeight: 31, color: C.text }}>
            想重演的，{"\n"}是哪一天？
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 21, marginTop: 8, color: C.muted }}>
            讲给我听，或者慢慢写下来。{"\n"}不用组织好语言，也不用从头讲起。
          </Text>
        </View>

        {/* 麦克风光晕：按住说话，录音中金色反馈 */}
        <View style={{ alignItems: "center", gap: 10, marginTop: 4 }}>
          <View style={{ width: 112, height: 112, alignItems: "center", justifyContent: "center" }}>
            <View style={{
              position: "absolute", width: 112, height: 112, borderRadius: 56,
              backgroundColor: theme.colors.accentSoft,
            }} />
            <Pressable
              onPressIn={() => { voice.start(); }} onPressOut={() => { voice.stop(); }}
              disabled={voice.transcribing}
              style={({ pressed }) => ({
                width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center",
                backgroundColor: voice.isRecording ? theme.colors.accentSurface : theme.colors.surfaceElevated,
                borderWidth: 2, borderColor: voice.isRecording ? theme.colors.accent : theme.colors.border,
                opacity: voice.transcribing ? 0.6 : 1,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              })}>
              <Mic size={26} color={theme.colors.accent} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 12, color: C.muted }}>{micHint}</Text>
          {voice.error ? <Text style={{ fontSize: 12, color: "#C4553A" }}>{voice.error}</Text> : null}
        </View>

        {/* 我在听：录音时出现，示意不急、慢慢讲 */}
        {voice.isRecording ? (
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 12,
            padding: 12, borderRadius: 18,
            backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, height: 26 }}>
              {[10, 18, 26, 16, 22, 12].map((h, i) => (
                <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: theme.colors.accent, opacity: 0.75 }} />
              ))}
            </View>
            <Text style={{ fontSize: 12.5, color: C.text2 }}>
              <Text style={{ fontWeight: "600", color: C.text }}>我在听</Text> · 不急，慢慢讲
            </Text>
          </View>
        ) : null}

        {/* 转写 / 手动输入区：语音追加或直接打字 */}
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
        <Button onPress={() => onConfirm(text || placeholder)} fullWidth>讲完了</Button>
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
        <ActBar stage={1} onBack={onBack} />
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
        <ActBar stage={1} onBack={onBack} />
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
      <ActBar stage={1} onBack={onBack} />
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}>
        <View style={{ paddingTop: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", lineHeight: 31, color: C.text }}>
            我把听到的，{"\n"}整理成了这一幕
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 21, marginTop: 8, color: C.muted }}>
            看看对不对——不对的地方，点一下就能改。
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
            <Text style={{ fontSize: 13, color: C.muted }}>我再补充几句</Text>
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
  // 补充校准：预设 chips 多选 + 一条手动补充，合并成一段（业务结构不变，仍是 string）
  const ADJUST_CHIPS = ["语气再轻一点", "别安排 TA 笑场", "关系再近一点", "场景要有风"];
  const [picked, setPicked] = useState<string[]>([]);
  const [adjusted, setAdjusted] = useState("");
  const adjustedFull = [...picked, adjusted].filter(Boolean).join("；");
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
      onReady({ name: name || "TA", relation: rel, desc, adjusted: adjustedFull, traits: traitsRef.current, renderKind });
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
        <ActBar stage={2} onBack={onBack} />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}>
          {/* 第三幕 · 定妆 标题 */}
          <View style={{ paddingTop: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: "700", lineHeight: 31, color: C.text }}>
              开演前，{"\n"}给 TA 定妆
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 21, marginTop: 8, color: C.muted }}>
              喵灵按你的记忆来演 TA，演得不像的地方，现在告诉我。
            </Text>
          </View>

          <View style={{ gap: 14 }}>
            <View>
              <Text style={{ fontSize: 12, marginBottom: 8, paddingHorizontal: 4, color: C.muted }}>称呼 TA 为</Text>
              <TextInput
                value={name} onChangeText={setName}
                placeholder="比如：妈妈、她、老朋友…" placeholderTextColor={C.placeholder}
                style={{
                  paddingHorizontal: 20, paddingVertical: 16, borderRadius: 20, fontSize: 15,
                  backgroundColor: "rgba(255,252,245,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)", color: paperColors.ink,
                }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 12, marginBottom: 8, paddingHorizontal: 4, color: C.muted }}>我们的关系</Text>
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

            <View>
              <Text style={{ fontSize: 12, marginBottom: 8, paddingHorizontal: 4, color: C.muted }}>你记忆里的 TA</Text>
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
            </View>

            <View>
              <Text style={{ fontSize: 12, marginBottom: 8, paddingHorizontal: 4, color: C.muted }}>补充校准（可多选）</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {ADJUST_CHIPS.map(c => {
                  const on = picked.includes(c);
                  return (
                    <Pressable key={c} onPress={() => setPicked(prev => on ? prev.filter(x => x !== c) : [...prev, c])}
                      style={{
                        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                        backgroundColor: on ? "rgba(246,231,168,0.88)" : "rgba(255,252,245,0.65)",
                        borderWidth: on ? 1.5 : 1,
                        borderColor: on ? "rgba(196,149,58,0.45)" : "rgba(255,255,255,0.45)",
                      }}>
                      <Text style={{ fontSize: 13, fontWeight: on ? "600" : "400", color: on ? paperColors.ink : paperColors.sub }}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={adjusted} onChangeText={setAdjusted}
                placeholder="或者，还有什么想补充的？（可选）" placeholderTextColor={C.placeholder}
                style={{
                  marginTop: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, fontSize: 14,
                  backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", color: paperColors.ink,
                }}
              />
            </View>
          </View>

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
              <Button onPress={handleEnter} fullWidth>定妆，准备开演</Button>
            </View>
            <Text style={{ fontSize: 11, textAlign: "center", color: C.muted }}>
              这些只用来演好这一幕，不做别的用途。
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
