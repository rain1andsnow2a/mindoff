/**
 * UpdateSheet —— 版本更新提示（方案 C 底部抽屉）。
 *
 * 纯展示组件：由 App.tsx 在检测到新版本时挂载。展示版本号、更新要点、下载按钮；
 * 「立即更新」「以后再说」的具体行为（打开下载链接 / 记忆忽略）由父组件通过回调决定。
 * 视觉全部走 design-system token，夜间模式自适应；升起动画 260ms，尊重 reduced motion。
 */
import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, Text, View } from "react-native";

import { paperColors, useTheme } from "../design-system";
import type { AppVersionInfo } from "../api";
import { CURRENT_VERSION } from "../updateCheck";

interface UpdateSheetProps {
  info: AppVersionInfo;
  /** 点击「立即更新」：父组件负责打开 APK 下载链接并关闭。 */
  onUpdate: () => void;
  /** 点击「以后再说」或点遮罩：父组件负责记忆忽略并关闭。 */
  onLater: () => void;
}

export function UpdateSheet({ info, onUpdate, onLater }: UpdateSheetProps) {
  const theme = useTheme();
  const slide = useRef(new Animated.Value(1)).current; // 1=完全在屏外，0=就位

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!mounted) return;
      if (reduced) {
        slide.setValue(0);
      } else {
        Animated.timing(slide, {
          toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
      }
    });
    return () => { mounted = false; };
  }, [slide]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 460] });
  const sizeText = info.size_mb ? ` · ${info.size_mb} MB` : "";

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", zIndex: 60 }}>
      {/* 遮罩：点击 = 以后再说 */}
      <Pressable
        accessibilityLabel="以后再说"
        onPress={onLater}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.overlay }}
      />

      <Animated.View
        style={{
          transform: [{ translateY }],
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: theme.spacing[6],
          paddingTop: theme.spacing[3],
          paddingBottom: theme.spacing[8],
          ...theme.shadows.floating,
        }}
      >
        {/* 抓手条 */}
        <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: "center", marginBottom: theme.spacing[5] }} />

        {/* 标题行：徽标 + 版本 */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[3], marginBottom: theme.spacing[4] }}>
          <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.accentSurface }}>
            <Text style={{ fontSize: 24 }}>✨</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: theme.colors.textPrimary }}>
              新版本 v{info.latest}
            </Text>
            <Text style={{ fontSize: 12.5, marginTop: 2, color: theme.colors.textMuted }}>
              当前 v{CURRENT_VERSION} · 建议更新{sizeText}
            </Text>
          </View>
        </View>

        {/* 更新要点卡 */}
        {info.changelog.length > 0 && (
          <View style={{ backgroundColor: theme.colors.backgroundSubtle, borderRadius: theme.radii.card, padding: theme.spacing[4], marginBottom: theme.spacing[5] }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.textSecondary, marginBottom: theme.spacing[3] }}>
              这次更新
            </Text>
            <ScrollView style={{ maxHeight: 168 }} showsVerticalScrollIndicator={false}>
              {info.changelog.map((line, i) => (
                <View key={i} style={{ flexDirection: "row", gap: theme.spacing[2], marginBottom: i === info.changelog.length - 1 ? 0 : theme.spacing[2] }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.focus, marginTop: 7 }} />
                  <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 20, color: paperColors.body }}>{line}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 立即更新 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="立即更新"
          onPress={onUpdate}
          style={({ pressed }) => ({
            borderRadius: theme.radii.pill,
            paddingVertical: 14,
            alignItems: "center",
            backgroundColor: theme.colors.accentSurface,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: "600", color: theme.colors.textOnAccent }}>立即更新</Text>
        </Pressable>

        {/* 以后再说 */}
        <Pressable accessibilityRole="button" onPress={onLater} style={{ paddingVertical: theme.spacing[2], alignItems: "center", marginTop: theme.spacing[1] }}>
          <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>以后再说</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
