import * as THREE from 'three';

/**
 * 风格化人物（低多边形、非写实——"假"恰恰给人安全感）
 *
 * 关节化结构：肩/髋/颈都有 pivot，姿态可静态、可动画。
 * 动画姿态通过 figure.userData.update(t) 驱动（场景 update 里调用）。
 *
 * type:      'child' | 'student' | 'adult' | 'elderly'
 * build:     'slim' | 'average' | 'stout'
 * outfit:    'casual' | 'uniform' | 'coat' | 'skirt'
 * hairstyle: 'short' | 'long' | 'ponytail' | 'bun'
 * backpack:  是否背书包
 * pose:      standing | sitting | phone | walking | waving | lookingBack |
 *            headDown | arguing | comforting | hugging | handingItem |
 *            crying | sittingGround
 *
 * 兼容旧参数：bodyColor / skinColor / hairColor / scale / pose('standing'|'sitting'|'phone')
 */

const TYPE_PRESETS = {
  child:   { scale: 0.60, headScale: 1.28 },
  student: { scale: 0.82, headScale: 1.10 },
  adult:   { scale: 1.00, headScale: 1.00 },
  elderly: { scale: 0.93, headScale: 1.02, hunch: 0.18, hairColor: 0x9a948e },
};

const OUTFIT_COLORS = {
  casual: 0x8a97ad,
  uniform: 0x4a6a9a,
  coat: 0x6a5a4a,
  skirt: 0xa85a6a,
};

const HIP_Y = 0.56;      // 髋部关节高度
const SHOULDER_Y = 1.18; // 肩部关节高度
const NECK_Y = 1.36;     // 颈部关节高度

export function createFigure({
  type = 'adult',
  build = 'average',
  outfit = 'casual',
  hairstyle = 'short',
  backpack = false,
  pose = 'standing',
  scale = 1,
  bodyColor,
  skinColor = 0xe8c8a8,
  hairColor = 0x3a3230,
} = {}) {
  const preset = TYPE_PRESETS[type] || TYPE_PRESETS.adult;
  const clothColor = bodyColor ?? OUTFIT_COLORS[outfit] ?? OUTFIT_COLORS.casual;
  if (type === 'elderly' && hairColor === 0x3a3230) hairColor = preset.hairColor;

  const g = new THREE.Group();
  const body = new THREE.Group(); // 整体升降（坐地/走路起伏）
  g.add(body);

  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.9, flatShading: true });
  const cloth = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.95, flatShading: true });
  const hair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 1, flatShading: true });

  const sitting = pose === 'sitting';
  const sittingGround = pose === 'sittingGround';
  const onPhone = pose === 'phone';

  // ---------- 腿（髋关节 pivot） ----------
  const legGeo = new THREE.CapsuleGeometry(0.075, 0.42, 3, 8);
  const mkLeg = (x) => {
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

  // ---------- 上半身（髋部 pivot，可前倾/驼背） ----------
  const upper = new THREE.Group();
  upper.position.y = HIP_Y;
  body.add(upper);

  const torsoLen = outfit === 'coat' ? 0.56 : 0.42;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, torsoLen, 4, 10), cloth);
  torso.position.y = 0.95 - HIP_Y + (outfit === 'coat' ? -0.05 : 0);
  if (build === 'slim') torso.scale.set(0.85, 1, 0.85);
  if (build === 'stout') torso.scale.set(1.28, 1, 1.28);
  upper.add(torso);

  // 校服：白色领口 + 深色下摆
  if (outfit === 'uniform') {
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
  if (outfit === 'skirt') {
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.36, 0.34, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.95, flatShading: true, side: THREE.DoubleSide })
    );
    skirt.position.y = 0.52 - HIP_Y;
    upper.add(skirt);
  }

  // ---------- 头（颈 pivot，可低头/回头） ----------
  const headPivot = new THREE.Group();
  headPivot.position.y = NECK_Y - HIP_Y;
  upper.add(headPivot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
  head.position.y = 0.16;
  head.scale.setScalar(preset.headScale);
  headPivot.add(head);

  // 发型（都挂在 headPivot 上，跟随低头/回头）
  const hy = 0.16; // 头中心在 headPivot 内的高度
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.2 * preset.headScale, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair
  );
  hairCap.position.set(0, hy + 0.03, -0.01);
  headPivot.add(hairCap);
  if (hairstyle === 'long') {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.12), hair);
    back.position.set(0, hy - 0.18, -0.16);
    headPivot.add(back);
  } else if (hairstyle === 'ponytail') {
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.24, 3, 6), hair);
    tail.position.set(0, hy - 0.05, -0.22);
    tail.rotation.x = 0.5;
    headPivot.add(tail);
  } else if (hairstyle === 'bun') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hair);
    bun.position.set(0, hy + 0.16, -0.12);
    headPivot.add(bun);
  }

  // ---------- 手臂（肩 pivot） ----------
  const armGeo = new THREE.CapsuleGeometry(0.06, 0.4, 3, 8);
  const shoulderHalf = build === 'stout' ? 0.34 : 0.3;
  const mkArm = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, SHOULDER_Y - HIP_Y, 0);
    const mesh = new THREE.Mesh(armGeo, cloth);
    mesh.position.y = -0.26;
    pivot.add(mesh);
    upper.add(pivot);
    return pivot;
  };
  const armL = mkArm(-shoulderHalf);
  const armR = mkArm(shoulderHalf);

  // ---------- 书包 ----------
  if (backpack) {
    const packMat = new THREE.MeshStandardMaterial({ color: 0xc47a3a, roughness: 0.85, flatShading: true });
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.16), packMat);
    pack.position.set(0, 1.0 - HIP_Y, -0.24);
    const strapGeo = new THREE.BoxGeometry(0.05, 0.3, 0.03);
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x8a5228, roughness: 0.9 });
    const s1 = new THREE.Mesh(strapGeo, strapMat); s1.position.set(-0.1, 1.06 - HIP_Y, -0.13);
    const s2 = new THREE.Mesh(strapGeo, strapMat); s2.position.set(0.1, 1.06 - HIP_Y, -0.13);
    upper.add(pack, s1, s2);
  }

  // ---------- 小道具 ----------
  let prop = null;
  if (onPhone) {
    prop = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.12, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x111111, roughness: 0.4,
        emissive: 0x88aaff, emissiveIntensity: 0.35,
      })
    );
    prop.position.set(0.34, 1.5 - HIP_Y, 0.06);
    upper.add(prop);
  } else if (pose === 'handingItem') {
    prop = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.1, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.8, flatShading: true })
    );
    prop.position.set(shoulderHalf, 1.1 - HIP_Y, 0.5);
    upper.add(prop);
  }

  // ---------- 姿态 ----------
  const baseBodyY = sittingGround ? -0.26 : 0;
  body.position.y = baseBodyY;

  // 默认站姿：手臂微张
  armL.rotation.z = 0.18;
  armR.rotation.z = -0.18;

  switch (pose) {
    case 'sitting':
      legL.rotation.x = -1.35;
      legR.rotation.x = -1.35;
      armL.rotation.x = -0.5;
      armR.rotation.x = -0.5;
      break;
    case 'sittingGround':
      // 坐地上：腿向前伸直，手撑在身侧
      legL.rotation.x = -1.5;
      legR.rotation.x = -1.45;
      legL.rotation.z = 0.08;
      legR.rotation.z = -0.08;
      armL.rotation.x = -0.25;
      armR.rotation.x = -0.25;
      armL.rotation.z = 0.45;
      armR.rotation.z = -0.45;
      break;
    case 'phone':
      // 右手抬到耳边打电话
      armR.rotation.z = -2.5;
      armR.rotation.x = -0.4;
      armL.rotation.z = 0.25;
      break;
    case 'lookingBack':
      // 回头（越过肩膀往后看）
      headPivot.rotation.y = 2.5;
      upper.rotation.y = 0.35;
      break;
    case 'headDown':
      headPivot.rotation.x = 0.52;
      upper.rotation.x = 0.1;
      break;
    case 'waving':
      // 右手举起，update 里摆动
      armR.rotation.z = -2.5;
      break;
    case 'arguing':
      upper.rotation.x = 0.14;
      armR.rotation.x = -1.1;
      armL.rotation.x = -0.5;
      break;
    case 'comforting':
      // 右手前伸轻拍（对方肩膀的高度）
      armR.rotation.x = -1.05;
      armR.rotation.z = -0.15;
      break;
    case 'hugging':
      // 双臂前环抱
      armL.rotation.x = -1.25;
      armR.rotation.x = -1.25;
      armL.rotation.z = 0.55;
      armR.rotation.z = -0.55;
      break;
    case 'handingItem':
      armR.rotation.x = -1.4;
      break;
    case 'crying':
      headPivot.rotation.x = 0.45;
      upper.rotation.x = 0.16;
      // 双手抬到脸前
      armL.rotation.x = -2.0;
      armR.rotation.x = -2.0;
      armL.rotation.z = 0.35;
      armR.rotation.z = -0.35;
      break;
    case 'walking':
      break; // update 驱动
    default:
      break;
  }

  if (preset.hunch) upper.rotation.x = preset.hunch;

  // ---------- 动画 ----------
  const baseArmLZ = armL.rotation.z;
  const baseArmRZ = armR.rotation.z;
  const baseArmRX = armR.rotation.x;
  const baseHeadX = headPivot.rotation.x;

  const ANIMATED = ['walking', 'waving', 'arguing', 'comforting', 'hugging', 'handingItem', 'crying'];
  if (ANIMATED.includes(pose)) {
    g.userData.update = (t) => {
      switch (pose) {
        case 'walking': {
          const s = Math.sin(t * 4.5);
          legL.rotation.x = s * 0.55;
          legR.rotation.x = -s * 0.55;
          armL.rotation.x = -s * 0.45;
          armR.rotation.x = s * 0.45;
          body.position.y = baseBodyY + Math.abs(Math.cos(t * 4.5)) * 0.04;
          break;
        }
        case 'waving':
          armR.rotation.z = baseArmRZ + Math.sin(t * 5.5) * 0.28;
          armR.rotation.x = baseArmRX + Math.sin(t * 5.5) * 0.12;
          break;
        case 'arguing':
          armR.rotation.x = baseArmRX + Math.sin(t * 6) * 0.45;
          armL.rotation.x = -0.5 + Math.sin(t * 6 + Math.PI) * 0.3;
          headPivot.rotation.z = Math.sin(t * 3) * 0.06;
          break;
        case 'comforting':
          // 轻拍
          armR.rotation.z = baseArmRZ + Math.sin(t * 4.5) * 0.14;
          break;
        case 'hugging':
          // 轻轻摇晃
          upper.rotation.z = Math.sin(t * 1.4) * 0.03;
          break;
        case 'handingItem':
          // 往前递出的小幅推送
          armR.rotation.x = baseArmRX + Math.sin(t * 2) * 0.1;
          if (prop) prop.position.z = 0.5 + Math.sin(t * 2) * 0.04;
          break;
        case 'crying':
          // 抽泣：肩膀抖动
          upper.position.y = HIP_Y + Math.sin(t * 9) * 0.008;
          headPivot.rotation.x = baseHeadX + Math.sin(t * 9) * 0.025;
          break;
        default:
          break;
      }
    };
  }

  g.scale.setScalar(scale * preset.scale);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

/** 行李箱（机场/高铁用） */
export function createLuggage({ color = 0xb05c4a } = {}) {
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
