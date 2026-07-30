/**
 * 片场搭建覆盖层：搭建中动画（BuildingStage）与搭建失败提示（BuildFailed）。
 * 用 absolute 盖在角色设定之上，失败不卸载底层，重试即用原输入。
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { Button } from "../../design-system";
import { useSceneSurface } from "./shared";

// 后端建场景是「剧本 LLM + 背景图 + 立绘」串并行跑，实测 60–90s。
// 与其干等，不如把后端真实在做的三件事分阶段说出来，让等待可预期。
const BUILD_STAGES = [
  { title: "在写这一幕的剧本…", hint: "把你说的场景改写成可以走进去的那一幕" },
  { title: "在画场景的背景…", hint: "光线、时间、你站的那个位置" },
  { title: "在画 TA 的样子…", hint: "只画一个轮廓，剩下的交给你的记忆" },
];
const STAGE_MS = 9000;

/**
 * 搭建中动画。用 RN 内置 Animated（本项目没装 reanimated，装它要改 babel + 重编原生包）。
 * 三层动效：呼吸光环 + 扫光进度条 + 阶段文案淡入淡出。
 */
export function BuildingStage() {
  const { theme, C } = useSceneSurface();
  const [stage, setStage] = useState(0);

  const breathe = useRef(new Animated.Value(0)).current;   // 光环呼吸
  const sweep = useRef(new Animated.Value(0)).current;     // 进度条扫光
  const fade = useRef(new Animated.Value(1)).current;      // 文案淡入淡出

  useEffect(() => {
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const s = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true })
    );
    b.start();
    s.start();
    return () => { b.stop(); s.stop(); };
  }, [breathe, sweep]);

  // 阶段推进：淡出 → 换文案 → 淡入。最后一段停住不再轮播（避免显得像卡死循环）
  useEffect(() => {
    if (stage >= BUILD_STAGES.length - 1) return;
    const timer = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
        setStage((s) => Math.min(s + 1, BUILD_STAGES.length - 1));
        Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }).start();
      });
    }, STAGE_MS);
    return () => clearTimeout(timer);
  }, [stage, fade]);

  const haloScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] });
  const haloOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.16] });
  const coreScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const BAR_W = 220;
  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-90, BAR_W] });
  const current = BUILD_STAGES[stage];

  return (
    <View style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      alignItems: "center", justifyContent: "center", gap: 22,
      backgroundColor: theme.colors.scrim,
    }}>
      {/* 呼吸光环 */}
      <View style={{ width: 128, height: 128, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{
          position: "absolute", width: 128, height: 128, borderRadius: 64,
          backgroundColor: "rgba(246,231,168,0.55)",
          transform: [{ scale: haloScale }], opacity: haloOpacity,
        }} />
        <Animated.View style={{
          width: 64, height: 64, borderRadius: 32,
          backgroundColor: "rgba(246,231,168,0.85)",
          borderWidth: 1.5, borderColor: "rgba(255,255,255,0.65)",
          transform: [{ scale: coreScale }],
        }} />
      </View>

      {/* 阶段文案 */}
      <Animated.View style={{ alignItems: "center", gap: 8, opacity: fade, paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 16, fontWeight: "500", color: C.text }}>{current.title}</Text>
        <Text style={{ fontSize: 12, lineHeight: 18, textAlign: "center", color: C.muted }}>
          {current.hint}
        </Text>
      </Animated.View>

      {/* 扫光进度条 */}
      <View style={{
        width: BAR_W, height: 4, borderRadius: 2, overflow: "hidden",
        backgroundColor: "rgba(91,79,62,0.10)",
      }}>
        <Animated.View style={{
          width: 90, height: 4, borderRadius: 2,
          backgroundColor: "rgba(196,149,58,0.55)",
          transform: [{ translateX: sweepX }],
        }} />
      </View>

      {/* 阶段小点 */}
      <View style={{ flexDirection: "row", gap: 6 }}>
        {BUILD_STAGES.map((_, i) => (
          <View key={i} style={{
            width: i === stage ? 16 : 6, height: 6, borderRadius: 3,
            backgroundColor: i <= stage ? "rgba(196,149,58,0.55)" : "rgba(91,79,62,0.12)",
          }} />
        ))}
      </View>

      <Text style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
        第一次搭会慢一些，大概一分钟
      </Text>
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
