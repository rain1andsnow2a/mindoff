/**
 * 片场搭建覆盖层：搭建中动画（BuildingStage）与搭建失败提示（BuildFailed）。
 * 用 absolute 盖在角色设定之上，失败不卸载底层，重试即用原输入。
 *
 * 搭建中 = 「幕间 · 候场」：帷幕合上、灯光调暗成暖墨色，光球与脚灯呼吸，
 * 底部三盏备场灯对应后端真实在做的三件事，旁白「不用守着」。支持切到后台
 * 收起覆盖层（onHide），生成完成仍会进入场景。
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Button, useReducedMotion } from "../../design-system";
import { ActBar, CURTAIN_COLORS, useSceneSurface } from "./shared";

// 后端建场景是「剧本 LLM + 背景图 + 立绘」串并行跑，实测 60–90s。
// 与其干等，不如把后端真实在做的三件事分阶段说出来，让等待可预期。
const BUILD_STAGES = [
  { title: "在写这一幕的剧本…", hint: "把你说的场景改写成可以走进去的那一幕" },
  { title: "在画场景的背景…", hint: "光线、时间、你站的那个位置" },
  { title: "在画 TA 的样子…", hint: "只画一个轮廓，剩下的交给你的记忆" },
];
/** 备场灯对应后端真实三件事（誊写剧本 → 布置场景 → 角色候场）。 */
const PREP_LABELS = ["剧本誊写", "场景布景", "角色候场"];
const STAGE_MS = 9000;

/**
 * 幕间 · 候场（暗场）。RN 内置 Animated 实现三态动效：光球/脚灯呼吸（4.2s 周期，
 * 接近一次深呼吸）、帷幕微摆（9s 极缓）。reduced motion 时全部降为静态。
 */
export function BuildingStage({ onHide }: { onHide?: () => void }) {
  useSceneSurface();   // 暗场候场不走主题 token，颜色取自 CURTAIN_COLORS（特殊场景色）
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState(0);

  const breathe = useRef(new Animated.Value(0)).current;   // 光球/脚灯/进行中灯 呼吸
  const sway = useRef(new Animated.Value(0)).current;      // 帷幕微摆

  useEffect(() => {
    if (reducedMotion) {
      breathe.setValue(0.5);
      sway.setValue(0);
      return;
    }
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const sw = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 4500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: 4500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    b.start();
    sw.start();
    return () => { b.stop(); sw.stop(); };
  }, [breathe, sway, reducedMotion]);

  // 阶段推进：最后一段停住不再轮播（避免显得像卡死循环）
  useEffect(() => {
    if (stage >= BUILD_STAGES.length - 1) return;
    const timer = setTimeout(() => {
      setStage((s) => Math.min(s + 1, BUILD_STAGES.length - 1));
    }, STAGE_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const breatheOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.45] });
  const swayX = sway.interpolate({ inputRange: [0, 1], outputRange: [0, 2] });
  const current = BUILD_STAGES[stage];

  return (
    <View style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: CURTAIN_COLORS.stage, overflow: "hidden",
    }}>
      {/* 帷幕：暖墨垂直线条纹，极缓微摆 */}
      <Animated.View style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        transform: [{ translateX: swayX }],
      }}>
        <LinearGradient
          colors={[
            CURTAIN_COLORS.curtain, CURTAIN_COLORS.curtain,
            CURTAIN_COLORS.curtainHi, CURTAIN_COLORS.curtainHi,
            CURTAIN_COLORS.curtain, CURTAIN_COLORS.curtain,
            CURTAIN_COLORS.curtainHi, CURTAIN_COLORS.curtainHi,
          ]}
          locations={[0, 0.18, 0.25, 0.34, 0.42, 0.6, 0.68, 1]}
          style={{ flex: 1 }}
        />
        {/* 顶部投下的暗影，压住竖条纹的重复感 */}
        <LinearGradient
          colors={["rgba(0,0,0,0.42)", "rgba(0,0,0,0)", "rgba(0,0,0,0)"]}
          locations={[0, 0.45, 1]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: "55%" }}
        />
      </Animated.View>
      {/* 中央分割线（帷幕合缝） */}
      <View style={{
        position: "absolute", top: 0, bottom: 0, left: "50%", width: 2,
        backgroundColor: "rgba(0,0,0,0.28)",
      }} />

      {/* 顶部幕檐 + 幕间 · 候场幕位灯（三幕已完成） */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 6 }}>
        <ActBar stage={2} dark title="幕间 · 候场" allDone />
      </View>

      {/* 脚灯：底部暖光呼吸 */}
      <Animated.View style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: 200,
        backgroundColor: CURTAIN_COLORS.gold, opacity: 0.10,
        transform: [{ scaleY: breatheScale }], transformOrigin: "bottom",
        borderRadius: 0,
      }} />

      {/* 光球 + 旁白 */}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        alignItems: "center", justifyContent: "center", gap: 24,
        paddingHorizontal: 34,
      }}>
        <View style={{ width: 150, height: 150, alignItems: "center", justifyContent: "center" }}>
          <Animated.View style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 75,
            backgroundColor: "rgba(240,212,119,0.16)",
            transform: [{ scale: breatheScale }], opacity: breatheOpacity,
          }} />
          <Animated.View style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: CURTAIN_COLORS.lampOk,
            transform: [{ scale: breatheScale }],
            shadowColor: "#F0D477", shadowOpacity: 0.55, shadowRadius: 20,
            shadowOffset: { width: 0, height: 0 }, elevation: 8,
          }} />
        </View>

        <View style={{ alignItems: "center", gap: 7, minHeight: 64 }}>
          <Text style={{
            fontSize: 16.5, fontWeight: "600", letterSpacing: 1,
            color: CURTAIN_COLORS.narrText, textAlign: "center",
          }}>
            {current.title}
          </Text>
          <Text style={{
            fontSize: 12, lineHeight: 18, textAlign: "center",
            color: CURTAIN_COLORS.narrHint,
          }}>
            {current.hint}
          </Text>
        </View>
      </View>

      {/* 备场灯 + 不用守着 */}
      <View style={{
        position: "absolute", left: 18, right: 18, bottom: 24,
        padding: 16, borderRadius: 20,
        backgroundColor: "rgba(43,37,32,0.72)",
        borderWidth: 1, borderColor: CURTAIN_COLORS.soft,
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {BUILD_STAGES.map((_, i) => {
            const ok = i < stage;
            const ing = i === stage;
            const wait = i > stage;
            return (
              <View key={i} style={{ flexDirection: "column", alignItems: "center", gap: 8, width: 88 }}>
                <Animated.View style={{
                  width: 9, height: 9, borderRadius: 5,
                  backgroundColor: ok
                    ? CURTAIN_COLORS.lampOk
                    : ing
                      ? CURTAIN_COLORS.lampIng
                      : CURTAIN_COLORS.lampWait,
                  opacity: ing ? breatheOpacity : 1,
                  ...(ok
                    ? { shadowColor: "#F0D477", shadowOpacity: 0.7, shadowRadius: 8, elevation: 3 }
                    : {}),
                }} />
                <Text style={{
                  fontSize: 11.5,
                  color: wait ? "rgba(243,236,221,0.4)" : "rgba(243,236,221,0.82)",
                }}>
                  {PREP_LABELS[i]}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={{
          marginTop: 14, fontSize: 11.5, lineHeight: 18, textAlign: "center",
          color: CURTAIN_COLORS.narrHint,
        }}>
          不用守着——去喝口水，开演时喵灵叫你。
        </Text>
        {onHide ? (
          <Pressable onPress={onHide} style={({ pressed }) => ({
            marginTop: 12, height: 38, borderRadius: 19,
            alignItems: "center", justifyContent: "center",
            borderWidth: 1, borderColor: "rgba(201,167,90,0.4)",
            opacity: pressed ? 0.8 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}>
            <Text style={{ fontSize: 12.5, fontWeight: "500", color: CURTAIN_COLORS.gold }}>
              切到后台等待
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** 失败时盖一层，而不是把用户甩回上一步——底下的角色设定还留着，重试即用原输入。 */
export function BuildFailed({ error, canRetry, onRetry, onDismiss }: {
  error: string; canRetry: boolean; onRetry: () => void; onDismiss: () => void;
}) {
  const { theme, C } = useSceneSurface();
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(rise, { toValue: 1, duration: 280, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [rise]);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <View style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      alignItems: "center", justifyContent: "center", paddingHorizontal: 28,
      backgroundColor: theme.colors.scrim,
    }}>
      <Animated.View style={{
        width: "100%", gap: 14, padding: 22, borderRadius: 22,
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1, borderColor: theme.colors.border,
        opacity: rise, transform: [{ translateY }],
      }}>
        <Text style={{ fontSize: 16, fontWeight: "500", color: C.text }}>没搭起来</Text>
        <Text style={{ fontSize: 13, lineHeight: 20, color: C.text2 }}>{error}</Text>
        <Text style={{ fontSize: 12, color: C.muted }}>
          你刚才填的都还在，重试不用重新说一遍。
        </Text>
        <View style={{ gap: 8, marginTop: 4 }}>
          {canRetry ? <Button onPress={onRetry} fullWidth>再试一次</Button> : null}
          <Pressable onPress={onDismiss} style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: C.muted }}>回去改一改</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}
