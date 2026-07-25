import { useEffect, useState } from "react";

/**
 * 打字机：把 target 文本按固定节奏逐字显示。
 * - target 增长（如 SSE token 追加）时从当前位置续播；
 * - target 换成另一段文本（新一幕）时从头重播；
 * - 积压较多时每次多吐几个字追平，避免落后于流式输入；
 * - reducedMotion（系统“减少动态效果”）时直接全量显示。
 */
export function useTypewriter(target: string, reducedMotion: boolean, intervalMs = 28): string {
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (reducedMotion) {
      setShown(target);
      return;
    }
    const timer = setInterval(() => {
      setShown((cur) => {
        // 目标换成了另一段文本：从头重播
        if (!target.startsWith(cur)) return target.slice(0, 1);
        if (cur.length >= target.length) return cur;
        const backlog = target.length - cur.length;
        const step = backlog > 24 ? 3 : backlog > 8 ? 2 : 1;
        return target.slice(0, cur.length + step);
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [target, reducedMotion, intervalMs]);

  return reducedMotion ? target : shown;
}
