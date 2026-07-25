import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { useReducedMotion } from "../accessibility";
import { useTheme } from "../theme";

const DAY_ORBS = [
  { c: "#F6E7A8", x: 8, y: -8, s: 72, o: 0.5 },
  { c: "#F3D8C7", x: 58, y: 58, s: 78, o: 0.5 },
  { c: "#DDEDE3", x: -4, y: 48, s: 62, o: 0.45 },
  { c: "#DFE7F5", x: 48, y: 4, s: 58, o: 0.42 },
  { c: "#E9E4F3", x: 68, y: 22, s: 52, o: 0.4 },
];

const NIGHT_ORBS = [
  { c: "#594653", x: 8, y: -8, s: 72, o: 0.82 },
  { c: "#3B3340", x: 58, y: 58, s: 78, o: 0.88 },
  { c: "#322E38", x: -4, y: 48, s: 62, o: 0.92 },
  { c: "#292630", x: 48, y: 4, s: 58, o: 0.9 },
  { c: "#453A48", x: 68, y: 22, s: 52, o: 0.75 },
  { c: "#DDC78F", x: 40, y: 30, s: 60, o: 0.09 },
];

export function MistBackground() {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const orbs = theme.isNight ? NIGHT_ORBS : DAY_ORBS;
  const { width, height } = useWindowDimensions();
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      drift.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(drift, {
        toValue: 1,
        duration: 12000,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reducedMotion]);

  const dx = drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 12, 0] });
  const dy = drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -14, 0] });
  const blur = 88 * (width / 372);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { pointerEvents: "none", transform: [{ translateX: dx }, { translateY: dy }] }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {orbs.map((orb, index) => (
            <RadialGradient key={index} id={`orb${index}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={orb.c} stopOpacity={orb.o} />
              <Stop offset="45%" stopColor={orb.c} stopOpacity={orb.o * 0.55} />
              <Stop offset="75%" stopColor={orb.c} stopOpacity={orb.o * 0.15} />
              <Stop offset="100%" stopColor={orb.c} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {orbs.map((orb, index) => (
          <Circle
            key={index}
            cx={(orb.x / 100) * width}
            cy={(orb.y / 100) * height}
            r={(orb.s / 100) * width / 2 + blur}
            fill={`url(#orb${index})`}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

export function PetPlaceholder({ size = 200, emoji = "🌿" }: { size?: number; emoji?: string }) {
  const theme = useTheme();
  return (
    <View style={{ width: size * 1.55, height: size * 1.55, alignItems: "center", justifyContent: "center" }}>
      <View style={{
        position: "absolute",
        width: size * 1.4,
        height: size * 1.4,
        borderRadius: size,
        backgroundColor: theme.colors.accentSoft,
        opacity: theme.isNight ? 0.35 : 0.55,
      }} />
      <View style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...theme.shadows.floating,
      }}>
        <Text style={{ fontSize: size * 0.3 }}>{emoji}</Text>
        <Text style={{ fontSize: size * 0.072, color: theme.colors.textMuted, marginTop: size * 0.04, letterSpacing: 0.5 }}>
          Pet Artwork
        </Text>
      </View>
    </View>
  );
}

export function CreamRipple({ active }: { active: boolean }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (!active || reducedMotion) return;
    scale.setValue(0);
    opacity.setValue(0.55);
    Animated.parallel([
      Animated.timing(scale, { toValue: 4, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, [active, opacity, reducedMotion, scale]);

  if (!active || reducedMotion) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      <Animated.View style={{
        position: "absolute",
        width: 80,
        height: 80,
        borderRadius: 40,
        top: "50%",
        left: "50%",
        marginTop: -40,
        marginLeft: -40,
        backgroundColor: theme.colors.accentSoft,
        transform: [{ scale }],
        opacity,
      }} />
    </View>
  );
}
