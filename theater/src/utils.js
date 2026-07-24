import * as THREE from 'three';

/** 夜空背景渐变（大球内壁） */
export function createSkyDome({ top = 0x0a1024, bottom = 0x1a2340 } = {}) {
  const geo = new THREE.SphereGeometry(120, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(top) },
      bottomColor: { value: new THREE.Color(bottom) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y * 0.5 + 0.5;
        gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, 0.8)), 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

/** 星空（Points，带轻微闪烁） */
export function createStars({ count = 900, radius = 110 } = {}) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // 只分布在上半球
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.85 + 0.12);
    const r = radius * (0.9 + Math.random() * 0.1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      attribute float phase;
      uniform float time;
      varying float vAlpha;
      void main() {
        vAlpha = 0.55 + 0.45 * sin(time * 0.8 + phase);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 1.6 + 1.2 * sin(time * 0.5 + phase * 2.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        gl_FragColor = vec4(0.9, 0.93, 1.0, vAlpha * (1.0 - d * 1.6));
      }`,
  });
  const stars = new THREE.Points(geo, mat);
  stars.userData.update = (t) => { mat.uniforms.time.value = t; };
  return stars;
}

/** 月亮（发光盘 + 光晕） */
export function createMoon({ size = 4, color = 0xf5eeda, distance = 90, height = 45, angle = 0 } = {}) {
  const g = new THREE.Group();
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(size, 32),
    new THREE.MeshBasicMaterial({ color, fog: false })
  );
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(size * 2.2, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, fog: false })
  );
  halo.position.z = -0.5;
  g.add(moon, halo);
  g.position.set(Math.sin(angle) * distance, height, -Math.cos(angle) * distance);
  g.lookAt(0, height * 0.3, 0);
  return g;
}

/** 低多边形远山剪影 */
export function createMountains({ color = 0x101a2e, count = 7, radius = 70 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  for (let i = 0; i < count; i++) {
    const h = 10 + Math.random() * 14;
    const w = 18 + Math.random() * 16;
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), mat);
    const a = (i / count) * Math.PI - Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    m.position.set(Math.sin(a) * radius, h / 2 - 1, -Math.cos(a) * radius);
    m.rotation.y = Math.random() * Math.PI;
    g.add(m);
  }
  return g;
}

/** 地面 */
export function createGround({ color = 0x1c2733, size = 200 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(size, 48), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

/** 松树（低多边形） */
export function createPineTree({ height = 3.5, color = 0x14301e } = {}) {
  const g = new THREE.Group();
  const leafMat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, height * 0.3, 6), trunkMat);
  trunk.position.y = height * 0.15;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const r = height * 0.28 * (1 - i * 0.26);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, height * 0.42, 7), leafMat);
    cone.position.y = height * (0.3 + i * 0.24);
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

/** 木椅（餐桌/通用） */
export function createChair({ color = 0x6b4a30 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.44), mat);
  seat.position.y = 0.42;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.05), mat);
  back.position.set(0, 0.72, -0.2);
  g.add(seat, back);
  const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6);
  [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set(x, 0.21, z);
    g.add(leg);
  });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
