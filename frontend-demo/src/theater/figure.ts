/**
 * 风格化人物/行李箱。低多边形、非写实——"假"恰恰给人安全感。
 * pose: 'standing' | 'sitting' | 'phone'（深夜通话：右手持机贴耳、头微倾向手机）
 *
 * 2026-07 细化：手臂改为「肩 → 上臂 → 肘 → 前臂 → 手」两段式骨架。
 * 打电话时上臂贴身下垂、肘部弯曲、前臂收向耳侧——旧版整根手臂上举，
 * 视觉上像举臂欢呼；并补了手球与站姿脚部。
 */
import * as THREE from "three";

export type FigurePose = "standing" | "sitting" | "phone";

export function createFigure({
  bodyColor = 0x8a97ad,
  skinColor = 0xe8c8a8,
  hairColor = 0x3a3230,
  pose = "standing",
  scale = 1,
}: {
  bodyColor?: number; skinColor?: number; hairColor?: number;
  pose?: FigurePose; scale?: number;
} = {}) {
  const g = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.9, flatShading: true });
  const cloth = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.95, flatShading: true });
  const hair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 1, flatShading: true });

  const sitting = pose === "sitting";
  const onPhone = pose === "phone";

  // 躯干
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.42, 4, 10), cloth);
  torso.position.y = sitting ? 0.62 : 0.95;
  g.add(torso);

  // 头组（头 + 头发；打电话时整体微倾向手机，像夹着话筒听）
  const headGroup = new THREE.Group();
  headGroup.position.y = sitting ? 1.12 : 1.52;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair
  );
  hairCap.position.set(0, 0.03, -0.01);
  headGroup.add(head, hairCap);
  if (onPhone) headGroup.rotation.set(0.06, 0, -0.14); // 低头 + 向右肩微倾
  g.add(headGroup);

  // 手臂：肩(shoulder) → 上臂 → 肘(elbow) → 前臂 → 手球
  const shoulderY = sitting ? 0.85 : 1.18;
  const mkArm = (side: 1 | -1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.24 * side, shoulderY, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 3, 8), cloth);
    upper.position.y = -0.13;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.18, 3, 8), cloth);
    fore.position.y = -0.11;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), skin);
    hand.position.y = -0.25;
    elbow.add(hand);
    return { shoulder, elbow };
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  if (onPhone) {
    // 右臂打电话：上臂贴身略前收，肘弯，前臂竖向耳侧；手机挂在前臂末端随手走
    armR.shoulder.rotation.set(-0.75, 0, 0.12);
    armR.elbow.rotation.set(-2.85, 0, -0.45);
    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.13, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x111111, roughness: 0.4,
        emissive: 0x88aaff, emissiveIntensity: 0.35,
      })
    );
    phone.position.set(0.01, -0.27, 0.05);
    phone.rotation.set(0.25, 0, -0.12);
    armR.elbow.add(phone);
    // 左臂自然垂落
    armL.shoulder.rotation.z = -0.1;
    armL.elbow.rotation.x = -0.18;
  } else {
    // 自然站姿：双臂微外张，前臂略前摆
    armL.shoulder.rotation.z = -0.08;
    armR.shoulder.rotation.z = 0.08;
    armL.elbow.rotation.x = -0.15;
    armR.elbow.rotation.x = -0.15;
  }
  if (sitting) { // 手臂朝膝头：上臂略前，前臂前伸
    armL.shoulder.rotation.x = -0.35;
    armL.elbow.rotation.x = -0.75;
    if (!onPhone) {
      armR.shoulder.rotation.x = -0.35;
      armR.elbow.rotation.x = -0.75;
    }
  }
  g.add(armL.shoulder, armR.shoulder);

  // 腿
  const legGeo = new THREE.CapsuleGeometry(0.075, 0.42, 3, 8);
  const legL = new THREE.Mesh(legGeo, cloth);
  const legR = new THREE.Mesh(legGeo, cloth);
  if (sitting) {
    // 坐姿：大腿前伸
    legL.rotation.x = -Math.PI / 2.2;
    legR.rotation.x = -Math.PI / 2.2;
    legL.position.set(-0.11, 0.32, 0.26);
    legR.position.set(0.11, 0.32, 0.26);
  } else {
    legL.position.set(-0.11, 0.28, 0);
    legR.position.set(0.11, 0.28, 0);
    // 站姿脚部（小盒子，朝前）
    const footGeo = new THREE.BoxGeometry(0.1, 0.06, 0.18);
    const footL = new THREE.Mesh(footGeo, cloth);
    footL.position.set(-0.11, 0.03, 0.04);
    const footR = new THREE.Mesh(footGeo, cloth);
    footR.position.set(0.11, 0.03, 0.04);
    g.add(footL, footR);
  }
  g.add(legL, legR);

  g.scale.setScalar(scale);
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
