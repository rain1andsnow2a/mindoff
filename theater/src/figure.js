import * as THREE from 'three';

/**
 * 风格化人物（低多边形、非写实——"假"恰恰给人安全感）
 * pose: 'standing' | 'sitting' | 'phone'（深夜通话：手举到耳边）
 */
export function createFigure({
  bodyColor = 0x8a97ad,
  skinColor = 0xe8c8a8,
  hairColor = 0x3a3230,
  pose = 'standing',
  scale = 1,
} = {}) {
  const g = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.9, flatShading: true });
  const cloth = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.95, flatShading: true });
  const hair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 1, flatShading: true });

  const sitting = pose === 'sitting';
  const onPhone = pose === 'phone';

  // 躯干
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.42, 4, 10), cloth);
  torso.position.y = sitting ? 0.62 : 0.95;
  g.add(torso);

  // 头
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
  head.position.y = sitting ? 1.12 : 1.52;
  g.add(head);

  // 头发（半球罩）
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair
  );
  hairCap.position.copy(head.position).add(new THREE.Vector3(0, 0.03, -0.01));
  g.add(hairCap);

  // 手臂（胶囊中心下沉到肩下，让手臂自然垂落）
  const armGeo = new THREE.CapsuleGeometry(0.06, 0.4, 3, 8);
  const armL = new THREE.Mesh(armGeo, cloth);
  const armR = new THREE.Mesh(armGeo, cloth);
  const shoulderY = sitting ? 0.85 : 1.18;
  armL.position.set(-0.3, shoulderY - 0.18, 0);
  armR.position.set(0.3, shoulderY - 0.18, 0);

  if (onPhone) {
    // 右手抬到耳边 —— 打电话（小角度内收，避免读成"举手"）
    armR.rotation.z = 0.55;
    armR.rotation.x = -0.2;
    armR.position.set(0.26, shoulderY + 0.16, 0.04);
    // 手机微光
    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.12, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x111111, roughness: 0.4,
        emissive: 0x88aaff, emissiveIntensity: 0.35,
      })
    );
    phone.position.set(0.14, head.position.y, 0.1);
    g.add(phone);
    armL.rotation.z = 0.25;
  } else {
    armL.rotation.z = 0.18;
    armR.rotation.z = -0.18;
  }
  if (sitting) { // 手朝膝盖方向前伸
    armL.rotation.x = 0.5;
    armL.position.z += 0.06;
    if (!onPhone) {
      armR.rotation.x = 0.5;
      armR.position.z += 0.06;
    }
  }
  g.add(armL, armR);

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
  }
  g.add(legL, legR);

  g.scale.setScalar(scale);
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
