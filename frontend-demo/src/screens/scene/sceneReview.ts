import type { SceneDetail } from "./shared";

export type SceneAdvancePhase = "playing" | "closure" | "ending";

/** 后端只能建议收束；仅兼容旧服务的 ended=true，正常流程由用户确认结束。 */
export function getSceneAdvancePhase(data: unknown): SceneAdvancePhase {
  if (!data || typeof data !== "object") return "playing";
  const event = data as Record<string, unknown>;
  if (event.ended === true) return "ending";
  if (event.closure_ready === true) return "closure";
  return "playing";
}

/** 回顾页必须优先展示用户真实选择/输入，不能用旁白或模型改写覆盖。 */
export function getLastUserExpression(scene: SceneDetail | null): string {
  if (!scene) return "";
  const item = [...(scene.history ?? [])]
    .reverse()
    .find((entry) => typeof entry?.choice === "string" && entry.choice.trim());
  return item ? String(item.choice).trim() : "";
}

/** 仅在旧场景没有 history 时，用最后一条有效对白做兼容兜底。 */
export function getLastSceneBeat(scene: SceneDetail | null): string {
  if (!scene) return "";
  const beat = [...(scene.beats ?? [])]
    .reverse()
    .find((entry) => typeof entry?.text === "string" && entry.text.trim());
  return beat ? beat.text.trim() : "";
}
