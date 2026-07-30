/**
 * 零件目录 —— SceneSpec.props 里 `type` 到低多边形构造器的注册表。
 *
 * 复用 utils.ts / figure.ts 的现成件，另补若干通用小件。每个构造器返回
 * THREE.Object3D；带动画的件把逐帧回调挂在 `obj.userData.update`，由 assemble.ts 收集驱动。
 * 颜色参数统一接受 CSS hex 字符串或数值。未知 type 由 buildProp 返回 null（调用方跳过）。
 */
import * as THREE from "three";
import { createChair, createPineTree } from "../utils";
import { createLuggage } from "../figure";

type Params = Record<string, unknown>;

/** hex 字符串("#1a2340")或数值 → 数值色；无效则用 fallback。 */
function hexNum(v: unknown, fallback: number): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseInt(v.replace("#", ""), 16);
    return Number.isNaN(n) ? fallback : n;
  }
  return fallback;
}

/** 取数值参数，缺省用 fallback。 */
function numOf(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

function flatMat(color: number, roughness = 0.95) {
  return new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
}

function markShadows(o: THREE.Object3D) {
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return o;
}

// ─── 户外自然件 ────────────────────────────────────────────────────────────

function pineTree(p: Params) {
  return createPineTree({ height: numOf(p.height, 3.5), color: hexNum(p.color, 0x14301e) });
}

function rock(p: Params) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(numOf(p.size, 0.5), 0), flatMat(hexNum(p.color, 0x6b6660), 1));
  m.castShadow = true;
  return m;
}

function bush(p: Params) {
  const g = new THREE.Group();
  const mat = flatMat(hexNum(p.color, 0x2f5330), 1);
  const s = numOf(p.size, 0.5);
  ([[0, 0, 0, 1], [0.35, -0.05, 0.1, 0.7], [-0.3, -0.02, -0.1, 0.75]] as const).forEach(([x, y, z, r]) => {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s * r, 0), mat);
    b.position.set(x * s, s * 0.6 + y, z * s);
    g.add(b);
  });
  return markShadows(g);
}

// ─── 家具/室内件 ────────────────────────────────────────────────────────────

function chair(p: Params) {
  return createChair({ color: hexNum(p.color, 0x6b4a30) });
}

function table(p: Params) {
  const g = new THREE.Group();
  const mat = flatMat(hexNum(p.color, 0x7a5636), 0.9);
  const w = numOf(p.width, 1.4), d = numOf(p.depth, 0.8), h = numOf(p.height, 0.74);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), mat);
  top.position.y = h;
  g.add(top);
  const legGeo = new THREE.BoxGeometry(0.08, h, 0.08);
  const lx = w / 2 - 0.12, lz = d / 2 - 0.12;
  ([[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]] as const).forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set(x, h / 2, z);
    g.add(leg);
  });
  return markShadows(g);
}

function bench(p: Params) {
  const g = new THREE.Group();
  const mat = flatMat(hexNum(p.color, 0x6b4a30), 0.9);
  const w = numOf(p.width, 1.6);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.42), mat);
  seat.position.y = 0.44;
  g.add(seat);
  const legGeo = new THREE.BoxGeometry(0.08, 0.44, 0.36);
  ([-w / 2 + 0.15, w / 2 - 0.15] as const).forEach((x) => {
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set(x, 0.22, 0);
    g.add(leg);
  });
  return markShadows(g);
}

function crate(p: Params) {
  const s = numOf(p.size, 0.6);
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), flatMat(hexNum(p.color, 0x8a6a44), 0.9));
  m.position.y = s / 2;
  m.castShadow = true;
  return m;
}

function rug(p: Params) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(numOf(p.width, 2), 0.02, numOf(p.depth, 1.4)),
    new THREE.MeshStandardMaterial({ color: hexNum(p.color, 0x8a4a3a), roughness: 1 })
  );
  m.position.y = 0.01;
  m.receiveShadow = true;
  return m;
}

function wall(p: Params) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(numOf(p.width, 4), numOf(p.height, 2.6), 0.12),
    flatMat(hexNum(p.color, 0xcabfa8), 1)
  );
  m.position.y = numOf(p.height, 2.6) / 2;
  m.receiveShadow = true;
  return m;
}

function windowProp(p: Params) {
  const g = new THREE.Group();
  const w = numOf(p.width, 1.2), h = numOf(p.height, 1.4);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.08), flatMat(hexNum(p.frame, 0x5b4a3a), 0.9));
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: hexNum(p.glow, 0xf4d9a0), transparent: true, opacity: 0.72, fog: false })
  );
  pane.position.z = 0.05;
  g.add(frame, pane);
  g.position.y = numOf(p.sill, 1.2) + h / 2;
  return g;
}

// ─── 灯光件 ────────────────────────────────────────────────────────────────

function lamp(p: Params) {
  const g = new THREE.Group();
  const light = new THREE.PointLight(hexNum(p.color, 0xffcc88), numOf(p.intensity, 1.4), numOf(p.range, 8), 1.4);
  light.position.y = numOf(p.height, 1.4);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshBasicMaterial({ color: hexNum(p.color, 0xffe6b0), fog: false })
  );
  bulb.position.y = light.position.y;
  g.add(light, bulb);
  return g;
}

function streetlight(p: Params) {
  const g = new THREE.Group();
  const h = numOf(p.height, 3.2);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 8), flatMat(hexNum(p.color, 0x2b2b30), 0.7));
  post.position.y = h / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe6b0, fog: false }));
  head.position.y = h;
  const light = new THREE.PointLight(0xffdca0, numOf(p.intensity, 1.6), numOf(p.range, 12), 1.5);
  light.position.y = h;
  g.add(markShadows(post), head, light);
  return g;
}

// ─── 露营件（帐篷 / 篝火，含动画）────────────────────────────────────────────

function tent(p: Params) {
  const g = new THREE.Group();
  const tentMat = flatMat(hexNum(p.color, 0xc46a3a), 0.85);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.6, 3, 1), tentMat);
  body.rotation.z = Math.PI / 2;
  body.rotation.y = Math.PI / 2;
  body.position.y = 0.75;
  body.castShadow = true;
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.85, 3), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1 }));
  door.position.set(1.32, -0.03, 0);
  door.rotation.y = Math.PI / 2;
  g.add(body, door);
  return g;
}

/** 篝火：木柴 + 双层火焰 + 暖光 + 上升火星，逐帧动画挂 userData.update。 */
function campfire(p: Params) {
  const g = new THREE.Group();
  const logMat = new THREE.MeshStandardMaterial({ color: hexNum(p.logColor, 0x4a3220), roughness: 1 });
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 5) * Math.PI;
    log.position.y = 0.1;
    g.add(log);
  }
  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 7), new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.85 }));
  flameOuter.position.y = 0.55;
  const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 6), new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0.95 }));
  flameInner.position.y = 0.5;
  const fireLight = new THREE.PointLight(0xff8844, 2.2, 18, 1.6);
  fireLight.position.y = 0.9;
  fireLight.castShadow = true;
  g.add(flameOuter, flameInner, fireLight);

  const sparkGeo = new THREE.BufferGeometry();
  const sparkCount = 24;
  const sparkPos = new Float32Array(sparkCount * 3);
  const seed = new Float32Array(sparkCount);
  for (let i = 0; i < sparkCount; i++) seed[i] = Math.random();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffaa44, size: 0.05, transparent: true, opacity: 0.9, depthWrite: false }));
  g.add(sparks);

  g.userData.update = (t: number) => {
    const f = Math.sin(t * 11) * 0.5 + Math.sin(t * 23 + 1.3) * 0.3 + Math.sin(t * 5 + 0.6) * 0.2;
    flameOuter.scale.set(1 + f * 0.12, 1 + f * 0.22, 1 + f * 0.12);
    flameInner.scale.set(1 - f * 0.1, 1 + f * 0.3, 1 - f * 0.1);
    fireLight.intensity = 2.2 + f * 0.5;
    const pos = sparkGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < sparkCount; i++) {
      const life = (t * 0.4 + seed[i]) % 1;
      pos[i * 3] = Math.sin(seed[i] * 40 + t) * 0.15;
      pos[i * 3 + 1] = 0.4 + life * 1.6;
      pos[i * 3 + 2] = Math.cos(seed[i] * 31 + t * 0.8) * 0.15;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    (sparks.material as THREE.PointsMaterial).opacity = 0.7 + Math.sin(t * 3) * 0.2;
  };
  return g;
}

function luggage(p: Params) {
  return createLuggage({ color: hexNum(p.color, 0xb05c4a) });
}

// ─── 抽自现有场景的大件（背景/地标）────────────────────────────────

/** 海面/水面：顶点波动 + 月光反射带（复用 seaside 波浪 shader），带逐帧动画。 */
function water(p: Params) {
  const geo = new THREE.PlaneGeometry(numOf(p.width, 60), numOf(p.depth, 60), 60, 40);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 p = position;
        float w = sin(p.x * 0.25 + time * 0.9) * 0.22
                + sin(p.y * 0.4 + time * 0.6) * 0.15
                + sin((p.x + p.y) * 0.15 + time * 1.3) * 0.1;
        p.z += w;
        vWave = w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vec3 deep = vec3(0.02, 0.06, 0.12);
        vec3 shallow = vec3(0.05, 0.12, 0.2);
        vec3 col = mix(deep, shallow, vUv.y + vWave * 0.5);
        float band = exp(-pow((vUv.x - 0.5) * 6.0, 2.0));
        float shimmer = 0.5 + 0.5 * sin(vUv.y * 120.0 + time * 2.0 + vWave * 8.0);
        col += vec3(0.85, 0.82, 0.65) * band * shimmer * (0.12 + vUv.y * 0.3);
        col += vec3(0.3, 0.35, 0.5) * smoothstep(0.85, 1.0, vUv.y) * 0.3;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sea = new THREE.Mesh(geo, mat);
  sea.rotation.x = -Math.PI / 2;
  sea.userData.update = (t: number) => { mat.uniforms.time.value = t; };
  return sea;
}

/** 床：床体 + 枕头 + 被子 + 床头板（复用 bedroom 配色，重心居中）。 */
function bed(p: Params) {
  const g = new THREE.Group();
  const bedMat = flatMat(hexNum(p.color, 0x39415a), 1);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.8), bedMat);
  frame.position.y = 0.25;
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.9), flatMat(hexNum(p.pillow, 0x5a647e), 1));
  pillow.position.set(-0.7, 0.57, 0);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.7), flatMat(hexNum(p.blanket, 0x4a3a52), 1));
  blanket.position.set(0.3, 0.53, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.15), flatMat(0x3a3230, 0.9));
  head.position.set(0, 0.65, -1.0);
  g.add(frame, pillow, blanket, head);
  return markShadows(g);
}

/** 城市剥影：高低错落的低多边形楼群 + 零星亮窗（作远景背景）。 */
function cityscape(p: Params) {
  const g = new THREE.Group();
  const mat = flatMat(hexNum(p.color, 0x1a2438), 1);
  const winMat = new THREE.MeshBasicMaterial({ color: hexNum(p.window, 0xffd48a), fog: false });
  const count = Math.max(4, Math.round(numOf(p.count, 12)));
  const lit = p.lit !== false;
  for (let i = 0; i < count; i++) {
    const w = 3 + Math.random() * 5;
    const h = 5 + Math.random() * 12;
    const x = -count * 4 + i * 8 + Math.random() * 3;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), mat);
    b.position.set(x, h / 2, -Math.random() * 8);
    g.add(b);
    if (lit) {
      for (let r = 0; r < Math.floor(h / 1.6); r++) {
        if (Math.random() > 0.5) continue;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), winMat);
        win.position.set(x + (Math.random() - 0.5) * (w - 1), 1 + r * 1.6, b.position.z + 1.51);
        g.add(win);
      }
    }
  }
  return g;
}

/** 站台：地面板 + 黄色安全线 + 顶棚 + 支柱（复用 trainStation）。 */
function platform(p: Params) {
  const g = new THREE.Group();
  const len = numOf(p.length, 24);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 8), flatMat(hexNum(p.color, 0x3c4148), 0.8));
  slab.position.y = 0.4; slab.receiveShadow = true;
  const safe = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.25), new THREE.MeshBasicMaterial({ color: 0xd8b83a }));
  safe.position.set(0, 0.81, -3);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len, 0.25, 9), flatMat(0x4a5058, 0.7));
  roof.position.set(0, 5.2, 0.5);
  g.add(slab, safe, roof);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.5, metalness: 0.5 });
  const cols = Math.max(2, Math.round(len / 8));
  for (let i = 0; i < cols; i++) {
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.7, 10), pillarMat);
    pil.position.set(-len / 2 + 1 + i * (len / Math.max(1, cols - 1)), 2.9, 4);
    g.add(pil);
  }
  return markShadows(g);
}

/** 高铁列车：流线车身 + 腰线 + 车窗灯带，带停站微晃动画。 */
function train(p: Params) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.55, 20, 8, 16),
    new THREE.MeshStandardMaterial({ color: hexNum(p.color, 0xdfe4ea), roughness: 0.3, metalness: 0.25 }));
  body.rotation.z = Math.PI / 2; body.scale.set(1, 1, 0.82); body.position.y = 1.75; body.castShadow = true;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(21, 0.22, 2.62),
    new THREE.MeshStandardMaterial({ color: hexNum(p.stripe, 0x2a5aa8), roughness: 0.4 }));
  stripe.position.y = 1.5;
  g.add(body, stripe);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffe8b8 });
  for (let i = 0; i < 10; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.02), winMat);
    win.position.set(-9 + i * 2.1, 2.25, 1.28);
    g.add(win);
  }
  g.userData.update = (t: number) => { g.position.y = Math.sin(t * 2.2) * 0.008; };
  return g;
}

/** 候机排椅（n 联），复用 airport 座椅，水平居中。 */
function airportSeats(p: Params) {
  const row = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: hexNum(p.color, 0x5a6a7a), roughness: 0.5, metalness: 0.3 });
  const n = Math.max(1, Math.round(numOf(p.seats, 4)));
  for (let i = 0; i < n; i++) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.5), mat);
    seat.position.set(i * 0.65, 0.45, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.06), mat);
    back.position.set(i * 0.65, 0.72, -0.24); back.rotation.x = -0.15;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), mat);
    leg.position.set(i * 0.65, 0.22, 0);
    row.add(seat, back, leg);
  }
  row.position.x = -((n - 1) * 0.65) / 2;
  return markShadows(row);
}

/** 航班/站台信息牌：暗底牌 + 发光屏 + 示意字行，带呼吸亮度动画。 */
function departureBoard(p: Params) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x0c1018, roughness: 0.5 }));
  const glowMat = new THREE.MeshBasicMaterial({ color: hexNum(p.color, 0x22d3aa) });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.9), glowMat);
  glow.position.z = 0.061;
  for (let i = 0; i < 3; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(2.4 - i * 0.3, 0.12), new THREE.MeshBasicMaterial({ color: 0x0c1018 }));
    line.position.set(-0.1 + i * 0.05, 0.25 - i * 0.25, 0.08);
    g.add(line);
  }
  g.add(board, glow);
  g.position.y = numOf(p.height, 3.4);
  const base = glowMat.color.getHex();
  g.userData.update = (t: number) => { glowMat.color.setHex(base).multiplyScalar(0.85 + Math.sin(t * 1.2) * 0.15); };
  return g;
}

// ─── 氛围动画件 ─────────────────────────────────────────────────

/** 雨：下落粒子，到底循环。 */
function rain(p: Params) {
  const count = Math.round(numOf(p.count, 240));
  const area = numOf(p.area, 14), height = numOf(p.height, 12);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * area;
    pos[i * 3 + 1] = Math.random() * height;
    pos[i * 3 + 2] = (Math.random() - 0.5) * area;
    speed[i] = 6 + Math.random() * 6;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: hexNum(p.color, 0x9fb6d8), size: 0.06, transparent: true, opacity: 0.5, depthWrite: false,
  }));
  let last = 0;
  pts.userData.update = (t: number) => {
    const dt = Math.min(0.05, Math.max(0, t - last)); last = t;
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= speed[i] * dt;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] += height;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}

/** 串灯/氛围灯串：悬垂暖光灯泡阵列，呼吸闪烁。 */
function stringLights(p: Params) {
  const g = new THREE.Group();
  const n = Math.max(3, Math.round(numOf(p.count, 10)));
  const span = numOf(p.span, 4), sag = numOf(p.sag, 0.5), h = numOf(p.height, 2.4);
  const bulbs: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: hexNum(p.color, 0xffd48a), fog: false, transparent: true })
    );
    bulb.position.set((u - 0.5) * span, h - Math.sin(u * Math.PI) * sag, 0);
    bulbs.push(bulb); g.add(bulb);
  }
  g.userData.update = (t: number) => {
    bulbs.forEach((b, i) => {
      (b.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.3 * Math.sin(t * 1.5 + i * 0.6);
    });
  };
  return g;
}

/** 萝火虫：上下飘动的暖黄光点，带明灭。 */
function fireflies(p: Params) {
  const count = Math.round(numOf(p.count, 30));
  const area = numOf(p.area, 6);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * area;
    pos[i * 3 + 1] = 0.3 + Math.random() * 2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * area;
    seed[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const base = new Float32Array(pos);
  const mat = new THREE.PointsMaterial({ color: hexNum(p.color, 0xffe9a0), size: 0.12, transparent: true, opacity: 0.9, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.userData.update = (t: number) => {
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3] = base[i * 3] + Math.sin(t * 0.5 + seed[i]) * 0.4;
      arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.7 + seed[i] * 1.3) * 0.3;
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.4 + seed[i]) * 0.4;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 0.6 + 0.35 * Math.sin(t * 2);
  };
  return pts;
}

// ─── 情感锤点小物 ──────────────────────────────────────────────

/** 空椅（对面无人——未闭环意象）：复用木椅，由摆放体现「空」。 */
function emptyChair(p: Params) {
  return createChair({ color: hexNum(p.color, 0x6b4a30) });
}

/** 相框：相框 + 照片面 + 支架（放桌上时用 pos.y 抬高）。 */
function photoFrame(p: Params) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.03), flatMat(hexNum(p.frame, 0x5b4a3a), 0.8));
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.36), new THREE.MeshBasicMaterial({ color: hexNum(p.photo, 0xb8c6d8) }));
  photo.position.z = 0.02;
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), flatMat(0x5b4a3a, 0.8));
  stand.position.set(0, -0.18, -0.08); stand.rotation.x = 0.4;
  g.add(frame, photo, stand);
  return markShadows(g);
}

/** 茶杯：杯体 + 杯柄 + 杯碟（两只对摆即对话意象）。 */
function teacup(p: Params) {
  const g = new THREE.Group();
  const mat = flatMat(hexNum(p.color, 0xeae0d2), 0.6);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.08, 12), mat);
  body.position.y = 0.05;
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.012, 16), mat);
  saucer.position.y = 0.006;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 12), mat);
  handle.position.set(0.07, 0.05, 0); handle.rotation.y = Math.PI / 2;
  g.add(saucer, body, handle);
  return markShadows(g);
}

// ─── 街道 / 校门件 ─────────────────────────────────────────────────

/** 沥青路面：沿 X 轴的深色长条 + 可选中线虚线（路向用 rotY 旋转）。 */
function road(p: Params) {
  const g = new THREE.Group();
  const w = numOf(p.width, 8), len = numOf(p.length, 40);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(len, w),
    new THREE.MeshStandardMaterial({ color: hexNum(p.color, 0x3a3d42), roughness: 1 }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.01;
  surface.receiveShadow = true;
  g.add(surface);
  const dashMat = new THREE.MeshBasicMaterial({ color: hexNum(p.line, 0xd8c86a) });
  for (let i = 0; i < Math.floor(len / 3); i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.18), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(-len / 2 + 1 + i * 3, 0.02, 0);
    g.add(dash);
  }
  return g;
}

/** 斑马线：一排白色横条。 */
function crosswalk(p: Params) {
  const g = new THREE.Group();
  const bars = Math.max(3, Math.round(numOf(p.bars, 6)));
  const mat = new THREE.MeshBasicMaterial({ color: hexNum(p.color, 0xe8e6e0) });
  for (let i = 0; i < bars; i++) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 3), mat);
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(-bars * 0.35 + i * 0.7, 0.02, 0);
    g.add(bar);
  }
  return g;
}

/** 校门：两根门柱 + 顶部横梁 + 横匾（校门意象）。 */
function schoolGate(p: Params) {
  const g = new THREE.Group();
  const pillarMat = flatMat(hexNum(p.color, 0x9a8a72), 0.9);
  const w = numOf(p.width, 4), h = numOf(p.height, 3);
  const mkPillar = (x: number) => {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.5), pillarMat);
    pil.position.set(x, h / 2, 0);
    pil.castShadow = true;
    return pil;
  };
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, 0.4), pillarMat);
  beam.position.y = h + 0.1;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.45, 0.06),
    new THREE.MeshStandardMaterial({ color: hexNum(p.sign, 0x8a2a2a), roughness: 0.6 }));
  sign.position.set(0, h + 0.1, 0.24);
  g.add(mkPillar(-w / 2), mkPillar(w / 2), beam, sign);
  return g;
}

/** 栏杆/围栏：立柱 + 上下两道横杆。 */
function railing(p: Params) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: hexNum(p.color, 0x8a8f96), roughness: 0.5, metalness: 0.4 });
  const len = numOf(p.length, 6), h = numOf(p.height, 1.0);
  const posts = Math.max(2, Math.round(len / 1.2));
  for (let i = 0; i < posts; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, h, 6), mat);
    post.position.set(-len / 2 + i * (len / (posts - 1)), h / 2, 0);
    g.add(post);
  }
  [h * 0.95, h * 0.5].forEach((y) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), mat);
    rail.position.set(0, y, 0);
    g.add(rail);
  });
  return g;
}

/** 单栋楼：低多边形楼体 + 正面窗格阵列（前景建筑，如教学楼）。 */
function building(p: Params) {
  const g = new THREE.Group();
  const w = numOf(p.width, 5), h = numOf(p.height, 8), d = numOf(p.depth, 4);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flatMat(hexNum(p.color, 0xb8a894), 1));
  body.position.y = h / 2;
  body.castShadow = true;
  g.add(body);
  const winMat = new THREE.MeshBasicMaterial({ color: hexNum(p.window, 0x8fb0d8) });
  const cols = Math.max(2, Math.floor(w / 1.2)), rows = Math.max(2, Math.floor(h / 1.6));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), winMat);
      win.position.set(
        -w / 2 + 0.8 + (c * (w - 1.6)) / Math.max(1, cols - 1),
        1 + (r * (h - 1.6)) / Math.max(1, rows - 1),
        d / 2 + 0.01,
      );
      g.add(win);
    }
  }
  return g;
}

// ─── 城市设施件 ───────────────────────────────────────────────

/** 公交站台：顶棚 + 立柱 + 长椅 + 站牌（等待/告别场景）。 */
function busStop(p: Params) {
  const g = new THREE.Group();
  const mat = flatMat(hexNum(p.color, 0x6a7078), 0.6);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 1.3), mat);
  roof.position.y = 2.4;
  g.add(roof);
  ([-1.4, 1.4] as const).forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8), mat);
    post.position.set(x, 1.2, -0.5);
    g.add(post);
  });
  const seatMat = flatMat(hexNum(p.seat, 0x8a7f70), 0.8);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.4), seatMat);
  seat.position.set(0, 0.45, -0.4);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 0.06), seatMat);
  back.position.set(0, 0.72, -0.6);
  g.add(seat, back);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), mat);
  pole.position.set(1.9, 1.1, 0.5);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.05),
    new THREE.MeshStandardMaterial({ color: hexNum(p.sign, 0x3a6ea8), roughness: 0.6 }));
  board.position.set(1.9, 2.0, 0.5);
  g.add(pole, board);
  return markShadows(g);
}

/** 低多边形小车：车身 + 车厢 + 四轮 + 车头灯；params.drive 开启则缓慢驶过并循环。 */
function car(p: Params) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  const bodyMat = flatMat(hexNum(p.color, 0x7a8a9a), 0.5);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 1.5), bodyMat);
  lower.position.y = 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 1.35), bodyMat);
  cabin.position.set(-0.2, 1.05, 0);
  inner.add(lower, cabin);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.8 });
  ([[-1.1, 0.75], [1.1, 0.75], [-1.1, -0.75], [1.1, -0.75]] as const).forEach(([x, z]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.24, 12), wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.3, z);
    inner.add(wheel);
  });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false });
  ([-0.55, 0.55] as const).forEach((z) => {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), headMat);
    head.position.set(1.72, 0.6, z);
    inner.add(head);
  });
  markShadows(inner);
  g.add(inner);
  if (p.drive) {
    const span = numOf(p.driveSpan, 24), speed = numOf(p.driveSpeed, 2.2);
    g.userData.update = (t: number) => { inner.position.x = ((t * speed) % span) - span / 2; };
  }
  return g;
}

/** 电话亭：红框 + 半透玻璃 + 顶牌 + 暖色内光（深夜通话意象）。 */
function phoneBooth(p: Params) {
  const g = new THREE.Group();
  const frameMat = flatMat(hexNum(p.color, 0x9a3b3b), 0.5);
  const w = 0.95, h = 2.4, d = 0.95;
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), frameMat);
  base.position.y = 0.06;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.18, d + 0.1), frameMat);
  roof.position.y = h;
  g.add(base, roof);
  ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).forEach(([sx, sz]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), frameMat);
    post.position.set(sx * (w / 2 - 0.04), h / 2, sz * (d / 2 - 0.04));
    g.add(post);
  });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe0e8, roughness: 0.1, transparent: true, opacity: 0.22 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.14, h - 0.4), glassMat);
  front.position.set(0, h / 2, d / 2 - 0.02);
  const left = front.clone(); left.rotation.y = Math.PI / 2; left.position.set(-w / 2 + 0.02, h / 2, 0);
  const right = left.clone(); right.position.x = w / 2 - 0.02;
  g.add(front, left, right);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.28, d + 0.12),
    new THREE.MeshBasicMaterial({ color: hexNum(p.sign, 0xffcf8a), fog: false }));
  sign.position.y = h - 0.16;
  g.add(sign);
  const light = new THREE.PointLight(0xffd9a0, 1.1, 4, 1.6);
  light.position.set(0, h - 0.5, 0);
  g.add(light);
  return g;
}

/** 自动贩卖机：机体 + 自发光面板 + 出货口 + 微光溢出（夜里氛围）。 */
function vendingMachine(p: Params) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.7), flatMat(hexNum(p.body, 0x2c3a44), 0.6));
  body.position.y = 1.0;
  body.castShadow = true;
  const panelColor = hexNum(p.color, 0x6fd0e0);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), new THREE.MeshBasicMaterial({ color: panelColor, fog: false }));
  panel.position.set(0, 1.2, 0.36);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.05), flatMat(0x14181c, 0.8));
  slot.position.set(0, 0.5, 0.36);
  g.add(body, panel, slot);
  const light = new THREE.PointLight(panelColor, 0.6, 3, 1.5);
  light.position.set(0, 1.2, 0.7);
  g.add(light);
  return g;
}

/** 户外咖啡桌：圆桌面 + 支柱 + 底盘。 */
function cafeTable(p: Params) {
  const g = new THREE.Group();
  const mat = flatMat(hexNum(p.color, 0x8a7a5a), 0.8);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 20), mat);
  top.position.y = 0.72;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), mat);
  pole.position.y = 0.36;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.05, 16), mat);
  base.position.y = 0.03;
  g.add(top, pole, base);
  return markShadows(g);
}

/** 遮阳伞：伞杆 + 八角伞面。 */
function parasol(p: Params) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 8), flatMat(0x8a7a5a, 0.8));
  pole.position.y = 1.2;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.5, 8), flatMat(hexNum(p.color, 0xcf7a5a), 1));
  canopy.position.y = 2.35;
  g.add(pole, canopy);
  return markShadows(g);
}

/** 零件注册表：type → 构造器。 */
const PROP_BUILDERS: Record<string, (p: Params) => THREE.Object3D> = {
  pineTree, rock, bush, chair, table, bench, crate, rug, wall,
  window: windowProp, lamp, streetlight, tent, campfire, luggage,
  // 抽自现有场景的大件
  water, bed, cityscape, platform, train, airportSeats, departureBoard,
  // 氛围动画
  rain, stringLights, fireflies,
  // 情感锚点小物
  emptyChair, photoFrame, teacup,
  // 街道 / 校门
  road, crosswalk, schoolGate, railing, building,
  // 城市设施
  busStop, car, phoneBooth, vendingMachine, cafeTable, parasol,
};

/** 所有可用零件 type，供 LLM prompt / 校验使用。 */
export const PROP_TYPES = Object.keys(PROP_BUILDERS);

/** 按 type 构造零件；未知 type 返回 null（调用方跳过并告警）。 */
export function buildProp(type: string, params: Params = {}): THREE.Object3D | null {
  const builder = PROP_BUILDERS[type];
  return builder ? builder(params) : null;
}
