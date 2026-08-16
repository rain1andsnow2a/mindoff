import { Asset } from "expo-asset";
import React, { useEffect, useMemo, useState } from "react";
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

function nextIdleDelay() {
  return MIN_IDLE_DELAY_MS + Math.random() * (MAX_IDLE_DELAY_MS - MIN_IDLE_DELAY_MS);
}

function moduleIds(sources: ImageSourcePropType[]) {
  return sources.filter((source): source is number => typeof source === "number");
}

export function HomePetArtwork({
  presetId,
  fallbackEmoji,
  size = 215,
}: HomePetArtworkProps) {
  const night = useTheme().isNight;
  const artwork = useMemo(() => getPetArtwork(presetId), [presetId]);
  const frames = useMemo(() => (artwork ? [artwork.idle, ...artwork.groom] : []), [artwork]);
  const [assetsReady, setAssetsReady] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const [staticFailed, setStaticFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [frameIndex, setFrameIndex] = useState(-1);

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
      if (!active) setFrameIndex(-1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setAssetsReady(false);
    setAnimationFailed(false);
    setStaticFailed(false);
    setFrameIndex(-1);
    if (!artwork) return;

    let alive = true;
    Asset.loadAsync(moduleIds([artwork.idle, ...artwork.groom]))
      .then(() => {
        if (alive) setAssetsReady(true);
      })
      .catch(() => {
        if (alive) setAnimationFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [artwork]);

  useEffect(() => {
    if (!artwork || !artwork.groom.length || !assetsReady || animationFailed || reduceMotion || !appActive) {
      setFrameIndex(-1);
      return;
    }

    const delay = frameIndex < 0 ? nextIdleDelay() : 1_000 / artwork.frameRate;
    const timeout = setTimeout(() => {
      if (frameIndex < 0) {
        setFrameIndex(0);
      } else if (frameIndex < artwork.groom.length - 1) {
        setFrameIndex((current) => current + 1);
      } else {
        setFrameIndex(-1);
      }
    }, delay);
    return () => clearTimeout(timeout);
  }, [appActive, animationFailed, artwork, assetsReady, frameIndex, reduceMotion]);

  if (!artwork || staticFailed) {
    return <PetPlaceholder size={size} emoji={fallbackEmoji} />;
  }

  const activeFrame = frameIndex >= 0 ? frameIndex + 1 : 0;
  const onFrameError = (index: number) => {
    if (index === 0) setStaticFailed(true);
    else {
      setAnimationFailed(true);
      setFrameIndex(-1);
    }
  };

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
      <View style={{ width: size * 1.42, height: size * 1.42 }}>
        {frames.map((src, index) => (
          <Image
            key={index}
            source={src}
            resizeMode="contain"
            fadeDuration={0}
            onError={() => onFrameError(index)}
            accessibilityIgnoresInvertColors
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              opacity: index === activeFrame ? 1 : 0,
            }}
          />
        ))}
      </View>
    </View>
  );
}
