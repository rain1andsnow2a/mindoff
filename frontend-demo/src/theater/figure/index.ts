/**
 * 风格化人物/行李箱。低多边形、非写实——"假"恰恰给人安全感。
 *
 * 骨架：髋 pivot 腿 + 上半身 pivot（躯干/头/两臂），手臂为「肩 → 肘 → 手」两段式。
 * 姿态与情感动作见 poses.ts；类型/体型/服装/发型预设见 presets.ts。
 * 动画姿态（walking/waving/arguing/comforting/hugging/handingItem/crying）
 * 通过 figure.userData.update(t) 驱动，场景 update 里调用。
 *
 * 兼容旧参数：bodyColor / skinColor / hairColor / pose("standing"|"sitting"|"phone") / scale。
 */
import * as THREE from "three";
import {
  ANIMATED_POSES,
  BUILD_WIDTH,
  HIP_Y,
  OUTFIT_COLORS,
  SHOULDER_Y,
  TYPE_PRESETS,
  type FigureBuild,
  type FigureHair,
  type FigureOutfit,
  type FigurePose,
  type FigureType,
} from "./presets";
import { applyPose, makePoseUpdate, type FigureParts } from "./poses";

export type { FigureBuild, FigureHair, FigureOutfit, FigurePose, FigureType } from "./presets";

export interface CreateFigureOptions {
  type?: FigureType;
  build?: FigureBuild;
  outfit?: FigureOutfit;
  hairstyle?: FigureHair;
  backpack?: boolean;
  pose?: FigurePose;
  scale?: number;
  bodyColor?: number;
  skinColor?: number;
  hairColor?: number;
}

export function createFigure({
  type = "adult",
  build = "average",
  outfit = "casual",
  hairstyle = "short",
  backpack = false,
  pose = "standing",
  scale = 1,
  bodyColor,
  skinColor = 0xe8c8a8,
  hairColor,
}: CreateFigureOptions = {}) {
  const preset = TYPE_PRESETS[type] ?? TYPE_PRESETS.adult;
  const clothColor = bodyColor ?? OUTFIT_COLORS[outfit] ?? OUTFIT_COLORS.casual;
  const finalHair = hairColor ?? preset.hairColor ?? 0x3a3230;

  const g = new THREE.Group();
  const body = new THREE.Group(); // 整体升降（走路起伏）
  g.add(body);

  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.9, flatShading: true });
  const cloth = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.95, flatShading: true });
  const hairMat = new THREE.MeshStandardMaterial({ color: finalHair, roughness: 1, flatShading: true });

  // ---------- 腿（髋 pivot） ----------
  const legGeo = new THREE.CapsuleGeometry(0.075, 0.42, 3, 8);
  const mkLeg = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, HIP_Y, 0);
    const mesh = new THREE.Mesh(legGeo, cloth);
    mesh.position.y = -0.28;
    pivot.add(mesh);
    body.add(pivot);
    return pivot;
  };
  const legL = mkLeg(-0.11);
  const legR = mkLeg(0.11);

  // ---------- 上半身（髋 pivot：前倾/驼背/摇晃/坐姿下移） ----------
  const upper = new THREE.Group();
  upper.position.y = HIP_Y;
  body.add(upper);

  const w = BUILD_WIDTH[build] ?? 1;
  const torsoLen = outfit === "coat" ? 0.56 : 0.42;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, torsoLen, 4, 10), cloth);
  torso.position.y = 0.95 - HIP_Y - (outfit === "coat" ? 0.05 : 0);
  torso.scale.set(w, 1, w);
  upper.add(torso);

  // 校服：白色领口 + 深色下摆
  if (outfit === "uniform") {
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.9, flatShading: true })
    );
    collar.position.y = 1.24 - HIP_Y;
    const hem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.25, 0.16, 10),
      new THREE.MeshStandardMaterial({ color: 0x2e3a4c, roughness: 0.95, flatShading: true })
    );
    hem.position.y = 0.66 - HIP_Y;
    upper.add(collar, hem);
  }

  // 裙子：腰部伞裙（腿露出下摆）
  if (outfit === "skirt") {
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.36, 0.34, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.95, flatShading: true, side: THREE.DoubleSide })
    );
    skirt.position.y = 0.52 - HIP_Y;
    upper.add(skirt);
  }

  // ---------- 头（颈 pivot：低头/回头/侧倾） ----------
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.52 - HIP_Y;
  upper.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
  head.scale.setScalar(preset.headScale);
  headGroup.add(head);

  // 发型
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.2 * preset.headScale, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hairMat
  );
  hairCap.position.set(0, 0.03, -0.01);
  headGroup.add(hairCap);
  if (hairstyle === "long") {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.12), hairMat);
    back.position.set(0, -0.18, -0.16);
    headGroup.add(back);
  } else if (hairstyle === "ponytail") {
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.24, 3, 6), hairMat);
    tail.position.set(0, -0.05, -0.22);
    tail.rotation.x = 0.5;
    headGroup.add(tail);
  } else if (hairstyle === "bun") {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hairMat);
    bun.position.set(0, 0.16, -0.12);
    headGroup.add(bun);
  }

  // ---------- 手臂：肩 → 上臂 → 肘 → 前臂 → 手球 ----------
  const shoulderHalf = 0.24 + (w - 1) * 0.1;
  const mkArm = (side: 1 | -1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(shoulderHalf * side, SHOULDER_Y - HIP_Y, 0);
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 3, 8), cloth);
    upperArm.position.y = -0.13;
    shoulder.add(upperArm);
    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.18, 3, 8), cloth);
    fore.position.y = -0.11;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), skin);
    hand.position.y = -0.25;
    elbow.add(hand);
    upper.add(shoulder);
    return { shoulder, elbow };
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  // 自然站姿默认：双臂微外张，前臂略前摆
  armL.shoulder.rotation.z = -0.08;
  armR.shoulder.rotation.z = 0.08;
  armL.elbow.rotation.x = -0.15;
  armR.elbow.rotation.x = -0.15;

  // ---------- 书包 ----------
  if (backpack) {
    const packMat = new THREE.MeshStandardMaterial({ color: 0xc47a3a, roughness: 0.85, flatShading: true });
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.16), packMat);
    pack.position.set(0, 1.0 - HIP_Y, -0.24);
    const strapGeo = new THREE.BoxGeometry(0.05, 0.3, 0.03);
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x8a5228, roughness: 0.9 });
    const s1 = new THREE.Mesh(strapGeo, strapMat);
    s1.position.set(-0.1, 1.06 - HIP_Y, -0.13);
    const s2 = new THREE.Mesh(strapGeo, strapMat);
    s2.position.set(0.1, 1.06 - HIP_Y, -0.13);
    upper.add(pack, s1, s2);
  }

  // ---------- 小道具（手机 / 递出的物品，挂在右手随手走） ----------
  let prop: THREE.Object3D | undefined;
  if (pose === "phone") {
    prop = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.13, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x111111, roughness: 0.4,
        emissive: 0x88aaff, emissiveIntensity: 0.35,
      })
    );
    prop.position.set(0.01, -0.27, 0.05);
    prop.rotation.set(0.25, 0, -0.12);
    armR.elbow.add(prop);
  } else if (pose === "handingItem") {
    prop = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.1, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.8, flatShading: true })
    );
    prop.position.set(0, -0.27, 0.05);
    armR.elbow.add(prop);
  }

  // ---------- 站姿脚部（小盒子，朝前；坐姿类不需要） ----------
  const standingLike = !["sitting", "sittingGround"].includes(pose);
  if (standingLike) {
    const footGeo = new THREE.BoxGeometry(0.1, 0.06, 0.18);
    const footL = new THREE.Mesh(footGeo, cloth);
    footL.position.set(-0.11, 0.03, 0.04);
    const footR = new THREE.Mesh(footGeo, cloth);
    footR.position.set(0.11, 0.03, 0.04);
    body.add(footL, footR);
  }

  // ---------- 姿态 + 动画 ----------
  const parts: FigureParts = { body, upper, head: headGroup, armL, armR, legL, legR, prop };
  applyPose(parts, pose);
  if (preset.hunch) upper.rotation.x += preset.hunch;
  if (ANIMATED_POSES.has(pose)) {
    const update = makePoseUpdate(parts, pose);
    if (update) g.userData.update = update;
  }

  g.scale.setScalar(scale * preset.scale);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  return g;
}

/** 行李箱（机场/高铁用） */
export function createLuggage({ color = 0xb05c4a }: { color?: number } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.2), mat);
  body.position.y = 0.32;
  body.castShadow = true;
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.7 })
  );
  handle.position.y = 0.68;
  const wheelGeo = new THREE.SphereGeometry(0.035, 8, 6);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const w1 = new THREE.Mesh(wheelGeo, wheelMat); w1.position.set(-0.12, 0.035, 0.06);
  const w2 = new THREE.Mesh(wheelGeo, wheelMat); w2.position.set(0.12, 0.035, 0.06);
  g.add(body, handle, w1, w2);
  return g;
}
