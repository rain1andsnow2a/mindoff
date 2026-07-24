import { Asset } from "expo-asset";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Image,
  type ImageSourcePropType,
  View,
} from "react-native";

import { PetPlaceholder, useTheme } from "../design-system";
import { getPetArtwork } from "../pets/assets";

type HomePetArtworkProps = {
  presetId: string | null;
  fallbackEmoji: string;
  size?: number;
};

const MIN_IDLE_DELAY_MS = 5_000;
const MAX_IDLE_DELAY_MS = 12_000;
const MIRO_GROOM_SPRITE = require("../../assets/pets/miro/miro-groom-sprite.png");
const SPRITE_COLUMNS = 7;
const SPRITE_ROWS = 6;
const GROOM_FRAME_COUNT = 37;
const GROOM_FRAME_RATE = 12;
const GROOM_ANIMATION_NAME = "miro-groom-sprite";

function nextIdleDelay() {
  return MIN_IDLE_DELAY_MS + Math.random() * (MAX_IDLE_DELAY_MS - MIN_IDLE_DELAY_MS);
}

function moduleIds(sources: ImageSourcePropType[]) {
  return sources.filter((source): source is number => typeof source === "number");
}

function buildSpriteKeyframes(frameSize: number) {
  const frames = Array.from({ length: GROOM_FRAME_COUNT }, (_, index) => {
    const percentage = (index / (GROOM_FRAME_COUNT - 1)) * 100;
    const x = -(index % SPRITE_COLUMNS) * frameSize;
    const y = -Math.floor(index / SPRITE_COLUMNS) * frameSize;
    return `${percentage}% { background-position: ${x}px ${y}px; }`;
  });
  return `@keyframes ${GROOM_ANIMATION_NAME} { ${frames.join(" ")} }`;
}

export function HomePetArtwork({
  presetId,
  fallbackEmoji,
  size = 215,
}: HomePetArtworkProps) {
  const night = useTheme().isNight;
  const artwork = useMemo(() => getPetArtwork(presetId), [presetId]);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const [staticFailed, setStaticFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [grooming, setGrooming] = useState(false);
  const frameSize = size * 1.42;
  // React Native Web 不提供 Image.resolveAssetSource；Expo Asset 负责把
  // Metro 的静态模块 ID 解析为浏览器可加载的 URI。
  const spriteUri = Asset.fromModule(MIRO_GROOM_SPRITE).uri;

  const clearIdleTimer = () => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  };

  const scheduleGroom = () => {
    clearIdleTimer();
    idleTimer.current = setTimeout(() => setGrooming(true), nextIdleDelay());
  };

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      setAppActive(active);
      if (!active) setGrooming(false);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setAssetsReady(false);
    setAnimationFailed(false);
    setStaticFailed(false);
    setGrooming(false);
    if (!artwork) return;

    let alive = true;
    const spriteImage = new window.Image();
    const spriteLoaded = new Promise<void>((resolve, reject) => {
      spriteImage.onload = () => resolve();
      spriteImage.onerror = () => reject(new Error("Miro groom sprite failed to load"));
      spriteImage.src = spriteUri;
    });

    Promise.all([Asset.loadAsync(moduleIds([artwork.idle])), spriteLoaded])
      .then(() => {
        if (alive) setAssetsReady(true);
      })
      .catch(() => {
        if (alive) setAnimationFailed(true);
      });
    return () => {
      alive = false;
      spriteImage.onload = null;
      spriteImage.onerror = null;
    };
  }, [artwork, spriteUri]);

  useEffect(() => {
    clearIdleTimer();
    if (artwork && assetsReady && !animationFailed && !reduceMotion && appActive && !grooming) {
      scheduleGroom();
    }
    return clearIdleTimer;
  }, [appActive, animationFailed, artwork, assetsReady, grooming, reduceMotion]);

  if (!artwork || staticFailed) {
    return <PetPlaceholder size={size} emoji={fallbackEmoji} />;
  }

  return (
    <View
      style={{
        pointerEvents: "none",
        width: size * 1.55,
        height: size * 1.55,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <style>{buildSpriteKeyframes(frameSize)}</style>
      <View
        style={{
          position: "absolute",
          width: size * 1.34,
          height: size * 1.34,
          borderRadius: size,
          backgroundColor: night
            ? "rgba(221,199,143,0.08)"
            : "rgba(246,231,168,0.14)",
        }}
      />
      {grooming && assetsReady && !animationFailed ? (
        <div
          aria-hidden
          onAnimationEnd={() => setGrooming(false)}
          style={{
            width: frameSize,
            height: frameSize,
            backgroundImage: `url("${spriteUri}")`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${frameSize * SPRITE_COLUMNS}px ${frameSize * SPRITE_ROWS}px`,
            animationName: GROOM_ANIMATION_NAME,
            animationDuration: `${GROOM_FRAME_COUNT / GROOM_FRAME_RATE}s`,
            animationTimingFunction: "steps(1, end)",
            animationIterationCount: 1,
          }}
        />
      ) : (
        <Image
          source={artwork.idle}
          resizeMode="contain"
          onError={() => setStaticFailed(true)}
          accessibilityIgnoresInvertColors
          style={{ width: frameSize, height: frameSize }}
        />
      )}
    </View>
  );
}
