import * as THREE from 'three';
import { createFigure, createLuggage } from '../figure.js';

/** 离开的路上 · 机场：深夜候机厅，落地窗外是停机坪上的飞机 */
export function create() {
  const group = new THREE.Group();

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x3a4048, roughness: 0.25, metalness: 0.35, // 反光地砖感
  });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(30, 0.2, 18), floorMat);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  group.add(floor);

  // 天花板
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.9 });
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(30, 0.3, 18), ceilMat);
  ceil.position.set(0, 6, 0);
  group.add(ceil);
  // 顶部灯带
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xd8e4f0 });
  for (let i = -2; i <= 2; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(24, 0.05, 0.4), stripMat);
    strip.position.set(0, 5.83, i * 3);
    group.add(strip);
  }

  // 落地玻璃幕墙（半透明 + 框架立柱）
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1a2438, roughness: 0.1, metalness: 0.2,
    transparent: true, opacity: 0.25,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), glassMat);
  glass.position.set(0, 3, -9);
  group.add(glass);
  const columnMat = new THREE.MeshStandardMaterial({ color: 0x4a525c, roughness: 0.4, metalness: 0.6 });
  for (let i = 0; i <= 10; i++) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.18, 6, 0.18), columnMat);
    col.position.set(-15 + i * 3, 3, -8.95);
    group.add(col);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(30, 0.25, 0.25), columnMat);
  beam.position.set(0, 4.5, -8.95);
  group.add(beam);

  // 窗外：白天晴空背景
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        vec3 sky = mix(vec3(0.88, 0.93, 0.98), vec3(0.42, 0.66, 0.92), vUv.y);
        sky += vec3(1.0, 0.96, 0.85) * 0.4 * smoothstep(0.5, 0.0, distance(vUv, vec2(0.75, 0.8)));
        gl_FragColor = vec4(sky, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(160, 50), skyMat);
  sky.position.set(0, 18, -75);
  group.add(sky);

  // 窗外：停机坪 + 飞机
  const tarmac = new THREE.Mesh(new THREE.PlaneGeometry(160, 70),
    new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 1 }));
  tarmac.rotation.x = -Math.PI / 2;
  tarmac.position.set(0, -0.05, -40);
  group.add(tarmac);
  // 停机坪标线
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c84a });
  const taxiLine = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.3), lineMat);
  taxiLine.rotation.x = -Math.PI / 2;
  taxiLine.rotation.z = 0.15;
  taxiLine.position.set(0, 0.02, -30);
  group.add(taxiLine);

  // 飞机（风格化：机身 + 翼 + 尾 + 引擎）
  const plane = new THREE.Group();
  const planeMat = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.4, metalness: 0.4, flatShading: true });
  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 10, 6, 12), planeMat);
  fuselage.rotation.z = Math.PI / 2;
  fuselage.position.y = 1.6;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 9), planeMat);
  wing.position.y = 1.4;
  const tailV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 1.6), planeMat);
  tailV.position.set(-5.2, 3, 0);
  const tailH = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 3.4), planeMat);
  tailH.position.set(-5, 2.6, 0);
  const engineGeo = new THREE.CylinderGeometry(0.4, 0.42, 1.6, 10);
  const eng1 = new THREE.Mesh(engineGeo, planeMat); eng1.rotation.x = Math.PI / 2; eng1.position.set(0, 0.8, -2.4);
  const eng2 = eng1.clone(); eng2.position.z = 2.4;
  // 机头灯 / 航行灯
  const navLightR = new THREE.Mesh(new THREE.SphereGeometry(0.08),
    new THREE.MeshBasicMaterial({ color: 0xff4444 }));
  navLightR.position.set(0, 1.4, -4.5);
  const navLightG = new THREE.Mesh(new THREE.SphereGeometry(0.08),
    new THREE.MeshBasicMaterial({ color: 0x44ff66 }));
  navLightG.position.set(0, 1.4, 4.5);
  plane.add(fuselage, wing, tailV, tailH, eng1, eng2, navLightR, navLightG);
  plane.position.set(-4, 0, -26);
  plane.rotation.y = 0.35;
  group.add(plane);

  // 停机坪地面灯光点
  const lightGeo = new THREE.BufferGeometry();
  const lightPos = new Float32Array(30 * 3);
  for (let i = 0; i < 30; i++) {
    lightPos[i * 3] = -40 + Math.random() * 80;
    lightPos[i * 3 + 1] = 0.05;
    lightPos[i * 3 + 2] = -15 - Math.random() * 40;
  }
  lightGeo.setAttribute('position', new THREE.BufferAttribute(lightPos, 3));
  const tarmacLights = new THREE.Points(lightGeo, new THREE.PointsMaterial({
    color: 0xffc866, size: 0.25, transparent: true, opacity: 0.8,
  }));
  group.add(tarmacLights);

  // 候机座椅（两排）
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.5, metalness: 0.3 });
  const mkSeatRow = (x, z, n, rotY = 0) => {
    const row = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.5), seatMat);
      seat.position.set(i * 0.65, 0.45, 0);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.06), seatMat);
      back.position.set(i * 0.65, 0.72, -0.24);
      back.rotation.x = -0.15;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), seatMat);
      leg.position.set(i * 0.65, 0.22, 0);
      row.add(seat, back, leg);
    }
    row.position.set(x, 0, z);
    row.rotation.y = rotY;
    group.add(row);
  };
  mkSeatRow(-6, -4, 6);
  mkSeatRow(2, -4, 6);
  mkSeatRow(-6, 2, 6, Math.PI);
  mkSeatRow(2, 2, 6, Math.PI);

  // 航班信息牌（发光字牌，用色块示意）
  const signGroup = new THREE.Group();
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x0c1018, roughness: 0.5 }));
  const signGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.9),
    new THREE.MeshBasicMaterial({ color: 0x22d3aa }));
  signGlow.position.z = 0.07;
  // 模拟文字行
  for (let i = 0; i < 3; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(2.4 - i * 0.3, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x0c1018 }));
    line.position.set(-0.1 + i * 0.05, 0.25 - i * 0.25, 0.08);
    signGroup.add(line);
  }
  signGroup.add(signBoard, signGlow);
  signGlow.position.z = 0.061;
  signGroup.position.set(-4, 3.8, -6);
  group.add(signGroup);
  const signGroup2 = signGroup.clone();
  signGroup2.position.set(5, 3.8, -6);
  group.add(signGroup2);

  // 人物：拖着行李箱走向登机口
  const me = createFigure({ bodyColor: 0x7a6a8a, pose: 'standing' });
  me.position.set(-1.5, 0, -3);
  me.rotation.y = Math.PI + 0.3;
  group.add(me);
  const luggage = createLuggage({ color: 0xb05c4a });
  luggage.position.set(-1.0, 0, -2.5);
  luggage.rotation.y = Math.PI + 0.3;
  group.add(luggage);

  // 远处零星旅客剪影
  const stranger1 = createFigure({ bodyColor: 0x3a4452, skinColor: 0xb89878, pose: 'sitting', scale: 0.95 });
  stranger1.position.set(-4.2, 0.1, -4);
  group.add(stranger1);
  const stranger2 = createFigure({ bodyColor: 0x44503e, pose: 'standing', scale: 0.98 });
  stranger2.position.set(8, 0, -7);
  stranger2.rotation.y = Math.PI;
  group.add(stranger2);

  // 灯光：明亮的白天大厅 + 窗外日光 + 天光漫射
  group.add(new THREE.AmbientLight(0x9aa4b8, 0.9));
  const hemi = new THREE.HemisphereLight(0xd8e8f8, 0x7a8088, 1.0);
  group.add(hemi);
  const hallLight = new THREE.DirectionalLight(0xfff4e0, 1.4);
  hallLight.position.set(8, 12, -30);
  hallLight.castShadow = true;
  group.add(hallLight);
  // 大厅顶部内照明（照亮座椅区与人物）
  const innerLight = new THREE.DirectionalLight(0xe8f0f8, 0.9);
  innerLight.position.set(0, 10, 6);
  group.add(innerLight);
  const signLight = new THREE.PointLight(0x22d3aa, 0.7, 8);
  signLight.position.set(-4, 3.5, -5.5);
  group.add(signLight);

  function update(t) {
    // 航行灯闪烁
    const blink = Math.sin(t * 3) > 0 ? 1 : 0.15;
    navLightR.material.color.setScalar(0).offsetHSL(0, 0, 0); // reset hack 避免累加
    navLightR.material.color.setHex(0xff4444).multiplyScalar(blink);
    navLightG.material.color.setHex(0x44ff66).multiplyScalar(blink);
    // 信息牌轻微亮度呼吸
    signGlow.material.color.setHex(0x22d3aa).multiplyScalar(0.85 + Math.sin(t * 1.2) * 0.15);
  }

  return {
    group,
    update,
    camera: { pos: [3.5, 2.2, 3.5], look: [-2, 1.5, -10] },
  };
}
