/**
 * assembleScene —— 把 SceneSpec 程序化拼装成 theater 的 `{ group, update, camera }`。
 *
 * 环境（天空/地面/星月山/灯光）按 env.time 给默认基调、被 env 内字段覆盖；
 * 零件走 props.buildProp（未知 type 跳过并告警）；人物走 figure.createFigure。
 * 逐帧动画（星空、篝火等）统一收集各对象的 userData.update，由返回的 update(t) 驱动。
 * 任一步骤失败都不影响整体（尽量渲染出能看的场景），契合「离线可跑、稳定兜底」。
 */
import * as THREE from "three";
import { createGround, createMoon, createMountains, createSkyDome, createStars, createSun } from "../utils";
import { createFigure } from "../figure";
import type { TheaterScene } from "../types";
import { buildProp } from "./props";
import type { SceneSpec, TimeOfDay, Vec3 } from "./spec";

type UpdateFn = (t: number) => void;

/** 各时段的默认色调与灯光（env / lighting 里的字段可逐项覆盖）。 */
const TIME_PRESETS: Record<TimeOfDay, {
  sky: { top: number; bottom: number };
  ground: number;
  ambient: { color: number; intensity: number };
  dir: { color: number; intensity: number; pos: Vec3 };
  /** 默认太阳（仅白天/黄昏；env.sun 可覆盖或关闭）。 */
  sun?: { size: number; color: number; height: number; angle: number; haloOpacity: number };
}> = {
  night: {
    sky: { top: 0x070d1f, bottom: 0x16223d }, ground: 0x18251f,
    ambient: { color: 0x33415e, intensity: 0.7 }, dir: { color: 0x8fa8d8, intensity: 0.5, pos: [20, 35, 25] },
  },
  dusk: {
    // 黄昏不是"变暗的白天"：地平线暖橙渐变 + 低角度可见暖阳 + 暖色侧光 + 足够的环境填充，
    // 太阳在天边做逆光轮廓，人物正面靠暖色环境光补亮（避免"黄昏像半夜"）
    sky: { top: 0x5656a0, bottom: 0xffa868 }, ground: 0x6a5a4c,
    ambient: { color: 0xc09a92, intensity: 1.55 }, dir: { color: 0xffa060, intensity: 1.7, pos: [-28, 14, 22] },
    sun: { size: 6, color: 0xffb050, height: 12, angle: -0.8, haloOpacity: 0.3 },
  },
  day: {
    sky: { top: 0x8fb3e0, bottom: 0xe6eef6 }, ground: 0x8a9a78,
    ambient: { color: 0xffffff, intensity: 1.1 }, dir: { color: 0xfff2d8, intensity: 1.3, pos: [18, 32, 22] },
    sun: { size: 4.5, color: 0xfff2c8, height: 40, angle: -0.6, haloOpacity: 0.14 },
  },
};

function hexNum(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v.replace("#", ""), 16);
  return Number.isNaN(n) ? fallback : n;
}

/** 依据 SceneSpec 组装一个可挂载到 Scene3D 的场景。 */
export function assembleScene(spec: SceneSpec): TheaterScene {
  const group = new THREE.Group();
  const updates: UpdateFn[] = [];
  const preset = TIME_PRESETS[spec.env.time] ?? TIME_PRESETS.night;
  const outdoor = spec.env.mode === "outdoor";

  // ── 天空 + 地面 ──
  group.add(createSkyDome({
    top: hexNum(spec.env.sky?.top, preset.sky.top),
    bottom: hexNum(spec.env.sky?.bottom, preset.sky.bottom),
  }));
  group.add(createGround({ color: hexNum(spec.env.ground?.color, preset.ground) }));

  // ── 星空（户外夜晚默认开）──
  const wantStars = spec.env.stars ?? (outdoor && spec.env.time === "night");
  if (wantStars) {
    const stars = createStars({ count: 1000 });
    group.add(stars);
    updates.push((t) => stars.userData.update(t));
  }

  // ── 月亮 ──
  if (spec.env.moon) {
    const mo = typeof spec.env.moon === "object" ? spec.env.moon : {};
    group.add(createMoon({ size: mo.size ?? 3.5, height: mo.height ?? 42, angle: mo.angle ?? 0.4 }));
  }

  // ── 太阳（户外白天/黄昏默认开；env.sun=false 可关）──
  const wantSun = spec.env.sun ?? (outdoor && !!preset.sun);
  if (wantSun && preset.sun) {
    const su = typeof spec.env.sun === "object" ? spec.env.sun : {};
    group.add(createSun({
      size: su.size ?? preset.sun.size,
      height: su.height ?? preset.sun.height,
      angle: su.angle ?? preset.sun.angle,
      color: hexNum(su.color, preset.sun.color),
      haloOpacity: preset.sun.haloOpacity,
    }));
  }

  // ── 远山（户外可选）──
  if (spec.env.mountains) {
    const mt = typeof spec.env.mountains === "object" ? spec.env.mountains : {};
    group.add(createMountains({ color: hexNum(mt.color, preset.sky.top), count: mt.count ?? 7, radius: 72 }));
  }

  // ── 灯光 ──
  group.add(new THREE.AmbientLight(
    hexNum(spec.lighting?.ambient?.color, preset.ambient.color),
    spec.lighting?.ambient?.intensity ?? preset.ambient.intensity,
  ));
  const dl = spec.lighting?.dir;
  const dir = new THREE.DirectionalLight(hexNum(dl?.color, preset.dir.color), dl?.intensity ?? preset.dir.intensity);
  dir.position.set(...(dl?.pos ?? preset.dir.pos));
  group.add(dir);

  // ── 零件 ──
  for (const inst of spec.props ?? []) {
    const obj = buildProp(inst.type, inst.params ?? {});
    if (!obj) {
      if (typeof console !== "undefined") console.warn("[assembleScene] 未知零件 type:", inst.type);
      continue;
    }
    if (inst.pos) obj.position.set(...inst.pos);
    if (typeof inst.rotY === "number") obj.rotation.y = inst.rotY;
    if (typeof inst.scale === "number") obj.scale.setScalar(inst.scale);
    if (typeof obj.userData.update === "function") updates.push(obj.userData.update as UpdateFn);
    group.add(obj);
  }

  // ── 人物 ──
  for (const c of spec.characters ?? []) {
    const fig = createFigure({
      pose: c.pose ?? "standing",
      scale: c.scale ?? 1,
      type: c.type ?? "adult",
      build: c.build ?? "average",
      outfit: c.outfit ?? "casual",
      hairstyle: c.hairstyle ?? "short",
      backpack: c.backpack ?? false,
      bodyColor: c.bodyColor ? hexNum(c.bodyColor, 0x8a97ad) : undefined,
      skinColor: hexNum(c.skinColor, 0xe8c8a8),
      hairColor: c.hairColor ? hexNum(c.hairColor, 0x3a3230) : undefined,
    });
    if (c.pos) fig.position.set(...c.pos);
    if (typeof c.rotY === "number") fig.rotation.y = c.rotY;
    // 情感动作（walking/waving 等）靠 userData.update 逐帧驱动
    if (typeof fig.userData.update === "function") updates.push(fig.userData.update as UpdateFn);
    group.add(fig);
  }

  const camera = spec.camera ?? {
    pos: outdoor ? [4.5, 2.4, 5] : [3.2, 2, 4],
    look: [0, 0.9, 0],
  };

  return {
    group,
    update: (t: number) => { for (const u of updates) u(t); },
    camera,
  };
}
