/**
 * 手写 SceneSpec 样例 —— v1 阶段不接 LLM，用它们跑通「spec → 3D 渲染」，
 * 也作为后续 LLM 输出格式的参照样本。三例覆盖：户外夜 / 室内日 / 户外黄昏。
 */
import type { SceneSpec } from "./spec";

/** 户外·深夜·篝火旁打电话（近似露营地）。 */
export const campfireNight: SceneSpec = {
  env: { mode: "outdoor", time: "night", stars: true, moon: { angle: 0.5, height: 40 }, mountains: { color: "#0d1728", count: 8 } },
  props: [
    { type: "tent", pos: [-3.2, 0, -2.5], params: { color: "#c46a3a" } },
    { type: "campfire", pos: [0.5, 0, -1.5] },
    { type: "pineTree", pos: [-4.5, 0, -4], params: { height: 4 } },
    { type: "pineTree", pos: [4.2, 0, -5], params: { height: 3.4 } },
    { type: "pineTree", pos: [3, 0, -3.4], params: { height: 3 } },
    { type: "rock", pos: [1.8, 0, 0.4], params: { size: 0.4 } },
    { type: "bush", pos: [-1.6, 0, 0.6] },
  ],
  characters: [
    { pos: [1.8, -0.35, -0.6], rotY: -Math.PI * 0.65, pose: "phone", bodyColor: "#7a8ba8" },
  ],
};

/** 室内·白天·家中餐桌两人对坐。 */
export const diningDay: SceneSpec = {
  env: { mode: "indoor", time: "day", ground: { color: "#b8a884" } },
  props: [
    { type: "wall", pos: [0, 0, -2.4], params: { width: 6, height: 2.8, color: "#e2d4bc" } },
    { type: "window", pos: [-1.4, 0, -2.34], params: { glow: "#eaf2ff" } },
    { type: "table", pos: [0, 0, 0], params: { width: 1.5, depth: 0.9 } },
    { type: "chair", pos: [0, 0, 0.7], rotY: Math.PI },
    { type: "chair", pos: [0, 0, -0.7] },
    { type: "rug", pos: [0, 0, 0], params: { width: 2.6, depth: 1.8, color: "#9a5344" } },
  ],
  characters: [
    { pos: [0, 0, 1.05], rotY: Math.PI, pose: "sitting", bodyColor: "#8a97ad" },
    { pos: [0, 0, -1.05], pose: "sitting", bodyColor: "#a88a7a" },
  ],
  camera: { pos: [2.6, 1.8, 3.4], look: [0, 0.9, 0] },
};

/** 户外·黄昏·长椅旁站立道别。 */
export const duskFarewell: SceneSpec = {
  env: { mode: "outdoor", time: "dusk", moon: false, mountains: { count: 6, color: "#5a4550" } },
  props: [
    { type: "bench", pos: [0, 0, -0.6], params: { width: 1.8 } },
    { type: "streetlight", pos: [-2.4, 0, -1.6], params: { intensity: 1.4 } },
    { type: "luggage", pos: [1.2, 0, 0.2], params: { color: "#b05c4a" } },
    { type: "bush", pos: [2.6, 0, -1.4] },
    { type: "rock", pos: [-1.6, 0, 0.8], params: { size: 0.35 } },
  ],
  characters: [
    { pos: [0.6, 0, 0.4], rotY: -0.4, pose: "standing", bodyColor: "#9a8a72" },
  ],
};

/** 户外·雨夜·海边站着告别（展示新件：water/rain/cityscape/emptyChair）。 */
export const rainyPier: SceneSpec = {
  env: { mode: "outdoor", time: "night", stars: false, moon: { angle: 0.2, height: 30 } },
  props: [
    { type: "water", pos: [0, -0.1, -14], params: { width: 60, depth: 40 } },
    { type: "cityscape", pos: [0, 0, -40], params: { count: 8, window: "#ffcf8a" } },
    { type: "rain", pos: [0, 0, 0], params: { count: 260, area: 14 } },
    { type: "streetlight", pos: [-2.4, 0, -1.2], params: { intensity: 1.4 } },
    { type: "emptyChair", pos: [-0.8, 0, 0.6], rotY: 2.4 },
  ],
  characters: [
    { pos: [0.6, 0, 0.6], rotY: -0.5, pose: "phone", bodyColor: "#8a7a9a" },
  ],
};

/** 样例注册表（按 key 取用，便于预览切换）。 */
export const SCENE_SAMPLES: Record<string, SceneSpec> = {
  campfireNight,
  diningDay,
  duskFarewell,
  rainyPier,
};
