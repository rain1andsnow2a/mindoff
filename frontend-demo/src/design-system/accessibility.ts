import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** 跟随系统“减少动态效果”，读取失败时保持安全的默认 false。 */
export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReducedMotion(enabled);
      })
      .catch(() => {
        if (active) setReducedMotion(false);
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}
