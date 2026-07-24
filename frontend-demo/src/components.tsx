/**
 * MindOff RN 基础组件（移植自 mindoff-proto App.tsx）：
 * MistBackground / PetPlaceholder / GlassCard / 按钮组 / 气泡 / BottomSheet /
 * SafeHeader / TabBar / WarmDot / CreamRipple / LiquidGlassShell
 *
 * web 的 backdrop-filter 在 RN 以半透明底色近似；motion 动画以 Animated 近似。
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View,
} from "react-native";
import { ChevronLeft, X } from "lucide-react-native";
import { CREAM, GOLD_DEEP, palette, useNight } from "./theme";

// ─── Mist Background ─────────────────────────────────────────────────────────

const DAY_ORBS = [
  { c: "#F6E7A8", x: "8%", y: "-8%", s: 280 },
  { c: "#F3D8C7", x: "58%", y: "58%", s: 300 },
  { c: "#DDEDE3", x: "-4%", y: "48%", s: 240 },
  { c: "#DFE7F5", x: "48%", y: "4%", s: 220 },
  { c: "#E9E4F3", x: "68%", y: "22%", s: 200 },
];
const NIGHT_ORBS = [
  { c: "rgba(89,70,83,0.82)", x: "8%", y: "-8%", s: 280 },
  { c: "rgba(59,51,64,0.88)", x: "58%", y: "58%", s: 300 },
  { c: "rgba(50,46,56,0.92)", x: "-4%", y: "48%", s: 240 },
  { c: "rgba(41,38,48,0.90)", x: "48%", y: "4%", s: 220 },
  { c: "rgba(69,58,72,0.75)", x: "68%", y: "22%", s: 200 },
  { c: "rgba(221,199,143,0.09)", x: "40%", y: "30%", s: 230 },
];

/** 雾感背景：web 版是 blur 圆斑，RN 用低透明度圆 + 缓慢漂移近似 */
export function MistBackground() {
  const night = useNight();
  const orbs = night ? NIGHT_ORBS : DAY_ORBS;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(drift, {
        toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  const dx = drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 10, 0] });
  const dy = drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -12, 0] });

  // web 走真实高斯模糊（对齐设计稿 blur(88px)/opacity .62）；原生无 filter，退回低透明度近似
  const isWeb = Platform.OS === "web";

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]} pointerEvents="none">
      {orbs.map((o, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute", left: o.x as any, top: o.y as any,
            width: o.s, height: o.s, borderRadius: o.s / 2,
            backgroundColor: o.c, opacity: isWeb ? 0.62 : 0.55,
            ...(isWeb ? { filter: "blur(88px)" } : null) as any,
            transform: [
              { translateX: i % 2 === 0 ? dx : Animated.multiply(dx, -1) },
              { translateY: i % 2 === 0 ? dy : Animated.multiply(dy, -1) },
            ],
          }}
        />
      ))}
    </View>
  );
}

// ─── Pet Placeholder ─────────────────────────────────────────────────────────

export function PetPlaceholder({ size = 200, emoji = "🌿" }: { size?: number; emoji?: string }) {
  const night = useNight();
  const C = palette(night);
  return (
    <View style={{ width: size * 1.55, height: size * 1.55, alignItems: "center", justifyContent: "center" }}>
      <View style={{
        position: "absolute", width: size * 1.55, height: size * 1.55, borderRadius: size,
        backgroundColor: night ? "rgba(221,199,143,0.14)" : "rgba(246,231,168,0.30)",
      }} />
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        alignItems: "center", justifyContent: "center",
        backgroundColor: night ? "rgba(59,51,64,0.45)" : "rgba(255,252,245,0.7)",
        borderWidth: 1.5,
        borderColor: night ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.55)",
      }}>
        <Text style={{ fontSize: size * 0.3 }}>{emoji}</Text>
        <Text style={{ fontSize: size * 0.072, color: night ? C.text3 : "#C0B5A8", marginTop: size * 0.04, letterSpacing: 0.5 }}>
          Pet Artwork
        </Text>
      </View>
    </View>
  );
}

// ─── Glass Card ──────────────────────────────────────────────────────────────

export function GlassCard({ children, style, onClick }: {
  children: React.ReactNode; style?: any; onClick?: () => void;
}) {
  const night = useNight();
  const body = (
    <View style={[{
      borderRadius: 24,
      backgroundColor: night ? "rgba(59,51,64,0.65)" : "rgba(255,252,245,0.65)",
      borderWidth: 1,
      borderColor: night ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.45)",
    }, style]}>
      {children}
    </View>
  );
  if (!onClick) return body;
  return (
    <Pressable onPress={onClick} style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      {body}
    </Pressable>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

export function PrimaryBtn({ children, onClick, full = false, disabled = false }: {
  children: React.ReactNode; onClick?: () => void; full?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onClick} disabled={disabled}
      style={({ pressed }) => [{
        alignSelf: full ? "stretch" : "auto",
        paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999,
        backgroundColor: CREAM, borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
        opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
        alignItems: "center",
      }]}>
      <Text style={{ fontSize: 15, fontWeight: "500", color: "#4B463F" }}>{children}</Text>
    </Pressable>
  );
}

export function SecondaryBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <Pressable onPress={onClick}
      style={({ pressed }) => [{
        paddingHorizontal: 28, paddingVertical: 13, borderRadius: 999,
        backgroundColor: "rgba(243,216,199,0.55)", borderWidth: 1,
        borderColor: "rgba(255,255,255,0.4)", opacity: pressed ? 0.9 : 1, alignItems: "center",
      }]}>
      <Text style={{ fontSize: 15, fontWeight: "500", color: "#4B463F" }}>{children}</Text>
    </Pressable>
  );
}

export function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const night = useNight();
  const C = palette(night);
  return (
    <Pressable onPress={onClick} style={({ pressed }) => [{ paddingHorizontal: 20, paddingVertical: 12, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ fontSize: 14, color: C.text2 }}>{children}</Text>
    </Pressable>
  );
}

// ─── Warm Dot ────────────────────────────────────────────────────────────────

export function WarmDot() {
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(196,149,58,0.8)" }} />;
}

// ─── Chat Bubbles ────────────────────────────────────────────────────────────

export function AgentBubble({ text, emoji = "🌿" }: { text: string; emoji?: string }) {
  const night = useNight();
  const C = palette(night);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 16, paddingRight: 48 }}>
      <View style={{
        width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(255,252,245,0.8)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
      }}>
        <Text style={{ fontSize: 13 }}>{emoji}</Text>
      </View>
      <View style={{
        paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, borderBottomLeftRadius: 6,
        backgroundColor: "rgba(255,252,245,0.75)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
      }}>
        <Text style={{ fontSize: 15, lineHeight: 22, color: C.lsPri }}>{text}</Text>
      </View>
    </View>
  );
}

export function UserBubble({ text }: { text: string }) {
  const night = useNight();
  const C = palette(night);
  return (
    <View style={{ alignItems: "flex-end", marginBottom: 16, paddingLeft: 48 }}>
      <View style={{
        paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, borderBottomRightRadius: 6,
        backgroundColor: "rgba(246,231,168,0.75)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
      }}>
        <Text style={{ fontSize: 15, lineHeight: 22, color: C.lsPri }}>{text}</Text>
      </View>
    </View>
  );
}

// ─── Bottom Sheet ────────────────────────────────────────────────────────────

export function BottomSheet({ children, onClose, title, visible }: {
  children: React.ReactNode; onClose?: () => void; title?: string; visible: boolean;
}) {
  const night = useNight();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.08)" }} onPress={onClose} />
      <View style={{
        borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: "hidden",
        backgroundColor: night ? "rgba(50,46,56,0.97)" : "rgba(255,252,245,0.95)",
        borderWidth: 1, borderBottomWidth: 0,
        borderColor: night ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.5)",
      }}>
        <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: night ? "rgba(255,255,255,0.12)" : "rgba(91,79,62,0.14)" }} />
        </View>
        {title && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: "500", color: night ? "#F4EFEA" : "#4B463F" }}>{title}</Text>
            {onClose && (
              <Pressable onPress={onClose} style={{
                width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center",
                backgroundColor: night ? "rgba(255,255,255,0.08)" : "rgba(91,79,62,0.07)",
              }}>
                <X size={14} color={night ? "#C5BBC1" : "#847D72"} />
              </Pressable>
            )}
          </View>
        )}
        {children}
      </View>
    </Modal>
  );
}

// ─── Safe Header ─────────────────────────────────────────────────────────────

export function SafeHeader({ title, onBack, rightEl }: {
  title?: string; onBack?: () => void; rightEl?: React.ReactNode;
}) {
  const night = useNight();
  const C = palette(night);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 52, paddingBottom: 12, paddingHorizontal: 20 }}>
      <View style={{ width: 32 }}>
        {onBack && (
          <Pressable onPress={onBack} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <ChevronLeft size={22} color={C.text} />
          </Pressable>
        )}
      </View>
      {title && <Text style={{ fontSize: 17, fontWeight: "500", color: C.text }}>{title}</Text>}
      <View style={{ width: 32, alignItems: "flex-end" }}>{rightEl}</View>
    </View>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

import { MessageCircle, Mail, Film, User } from "lucide-react-native";

export type Tab = "companion" | "mailbox" | "scene" | "profile";

export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const night = useNight();
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "companion", label: "陪伴", icon: MessageCircle },
    { id: "mailbox", label: "信箱", icon: Mail },
    { id: "scene", label: "片场", icon: Film },
    { id: "profile", label: "我的", icon: User },
  ];
  return (
    <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: 24 }}>
      <View style={{
        marginHorizontal: 16, borderRadius: 28, paddingHorizontal: 8, paddingVertical: 6,
        flexDirection: "row",
        backgroundColor: night ? "rgba(50,46,56,0.88)" : "rgba(255,252,245,0.85)",
        borderWidth: 1,
        borderColor: night ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.48)",
      }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <Pressable key={t.id} onPress={() => onChange(t.id)}
              style={{
                flex: 1, alignItems: "center", gap: 2, paddingVertical: 8, borderRadius: 20,
                backgroundColor: isActive ? (night ? "rgba(216,188,118,0.45)" : "rgba(246,231,168,0.72)") : "transparent",
              }}>
              <Icon size={21} color={isActive ? (night ? "#F4EFEA" : "#4B463F") : (night ? "#A399A0" : "#C0B5A8")} />
              <Text style={{
                fontSize: 10, fontWeight: "500",
                color: isActive ? (night ? "#F4EFEA" : "#4B463F") : (night ? "#A399A0" : "#C0B5A8"),
              }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Liquid Glass Shell（输入框/按钮外壳，RN 简化版）──────────────────────────

export function LiquidGlassShell({ children, onClick, style }: {
  children: React.ReactNode; onClick?: () => void; style?: any;
}) {
  const night = useNight();
  const inner = (
    <View style={[{
      backgroundColor: night ? "rgba(255,248,244,0.08)" : "rgba(255,252,245,0.65)",
      borderWidth: 1,
      borderColor: night ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.45)",
      overflow: "hidden",
    }, style]}>
      {children}
    </View>
  );
  if (!onClick) return inner;
  return (
    <Pressable onPress={onClick} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      {inner}
    </Pressable>
  );
}

// ─── Cream Ripple（整理完成的仪式感波纹，简化版）─────────────────────────────

export function CreamRipple({ active }: { active: boolean }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (active) {
      scale.setValue(0);
      opacity.setValue(0.55);
      Animated.parallel([
        Animated.timing(scale, { toValue: 4, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    }
  }, [active, scale, opacity]);

  if (!active) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={{
        position: "absolute", width: 80, height: 80, borderRadius: 40,
        top: "50%", left: "50%", marginTop: -40, marginLeft: -40,
        backgroundColor: "rgba(246,231,168,0.6)",
        transform: [{ scale }], opacity,
      }} />
    </View>
  );
}
