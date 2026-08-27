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

function moduleIds(sources: (ImageSourcePropType | undefined)[]) {
  return sources.filter((source): source is number => typeof source === "number");
}

/**
 * 首页桌宠：静态首帧永远垫底，当前时段的动图（GIF）盖在上面。
 * 切日夜 = 换一张 GIF（低频操作，且底下有首帧垫着，不会白屏闪烁）。
 */
export function HomePetArtwork({
  presetId,
  fallbackEmoji,
  size = 215,
}: HomePetArtworkProps) {
  const night = useTheme().isNight;
  const artwork = useMemo(() => getPetArtwork(presetId), [presetId]);
  const motion = night ? artwork?.motionNight : artwork?.motionDay;
  const [assetsReady, setAssetsReady] = useState(false);
  const [motionFailed, setMotionFailed] = useState(false);
  const [staticFailed, setStaticFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");

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
      setAppActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setAssetsReady(false);
    setMotionFailed(false);
    setStaticFailed(false);
    if (!artwork) return;

    let alive = true;
    Asset.loadAsync(
      moduleIds([artwork.idle, artwork.motionDay, artwork.motionNight]),
    )
      .then(() => {
        if (alive) setAssetsReady(true);
      })
      .catch(() => {
        if (alive) setMotionFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [artwork]);

  if (!artwork || staticFailed) {
    return <PetPlaceholder size={size} emoji={fallbackEmoji} />;
  }

  // 减弱动态 / 后台 / 动图损坏 → 只显示静态首帧。
  const showMotion =
    assetsReady && !motionFailed && !reduceMotion && appActive && motion != null;

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
            ? "rgba(216,169,78,0.10)"
            : "rgba(184,134,11,0.09)",
        }}
      />
      <View style={{ width: size * 1.42, height: size * 1.42 }}>
        <Image
          source={artwork.idle}
          resizeMode="contain"
          fadeDuration={0}
          onError={() => setStaticFailed(true)}
          accessibilityIgnoresInvertColors
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
        {showMotion ? (
          <Image
            key={night ? "night" : "day"}
            source={motion}
            resizeMode="contain"
            fadeDuration={0}
            onError={() => setMotionFailed(true)}
            accessibilityIgnoresInvertColors
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
