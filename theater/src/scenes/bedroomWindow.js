import * as THREE from 'three';
import { createFigure } from '../figure.js';

/** 深夜通话 · 卧室窗前：夜色透过窗，人坐在窗边打电话 */
export function create() {
  const group = new THREE.Group();

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a2e3c, roughness: 1 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a2f26, roughness: 0.95 });

  // 地板
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 8), floorMat);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  group.add(floor);

  // 后墙（带窗洞：用四块拼）
  const W = 10, H = 4, winW = 2.6, winH = 2.0, winY = 1.1, winX = 0.8;
  const mkWall = (w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), wallMat);
    m.position.set(x, y, -4);
    group.add(m);
  };
  mkWall((W - winW) / 2 + winX + W / 2 - W / 2, H, -(winW / 2 + ((W - winW) / 2) / 2) + winX / 2, H / 2); // 左
  // 简化：左墙 / 右墙 / 上墙 / 下墙
  group.children.pop();
  const leftW = winX - winW / 2 + W / 2;
  const rightW = W / 2 - (winX + winW / 2);
  mkWall(leftW, H, -W / 2 + leftW / 2, H / 2);
  mkWall(rightW, H, W / 2 - rightW / 2, H / 2);
  mkWall(winW, winY, winX, winY / 2);
  mkWall(winW, H - winY - winH, winX, (H + winY + winH) / 2);

  // 侧墙
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.2, H, 8), wallMat);
  sideL.position.set(-5, H / 2, 0);
  const sideR = sideL.clone();
  sideR.position.x = 5;
  // 天花板
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 8), wallMat);
  ceil.position.set(0, H, 0);
  group.add(sideL, sideR, ceil);

  // 窗框
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c1f2a, roughness: 0.8 });
  const frameT = 0.07;
  const mkFrame = (w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), frameMat);
    m.position.set(x, y, -3.95);
    group.add(m);
  };
  mkFrame(winW + frameT * 2, frameT, winX, winY + winH + frameT / 2);
  mkFrame(winW + frameT * 2, frameT, winX, winY - frameT / 2);
  mkFrame(frameT, winH, winX - winW / 2 - frameT / 2, winY + winH / 2);
  mkFrame(frameT, winH, winX + winW / 2 + frameT / 2, winY + winH / 2);
  mkFrame(frameT * 0.7, winH, winX, winY + winH / 2); // 中梃

  // 窗外夜景（发光平面：深蓝夜空 + 月亮 + 零星灯火）
  const nightMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 sky = mix(vec3(0.05, 0.08, 0.18), vec3(0.02, 0.03, 0.09), vUv.y);
        // 月亮
        float moon = smoothstep(0.09, 0.075, distance(vUv, vec2(0.72, 0.78)));
        vec3 col = sky + vec3(0.95, 0.92, 0.8) * moon;
        // 月晕
        col += vec3(0.5, 0.5, 0.6) * 0.25 * smoothstep(0.25, 0.08, distance(vUv, vec2(0.72, 0.78)));
        // 远处城市灯火
        vec2 grid = floor(vUv * vec2(40.0, 14.0));
        float lit = step(0.93, hash(grid)) * step(vUv.y, 0.28);
        float flicker = 0.6 + 0.4 * sin(time * 0.5 + hash(grid) * 20.0);
        col += vec3(1.0, 0.8, 0.5) * lit * 0.5 * flicker;
        // 城市剪影
        float skyline = step(vUv.y, 0.16 + 0.1 * hash(vec2(grid.x, 0.0)));
        col = mix(col, vec3(0.02, 0.025, 0.05), skyline * (1.0 - lit));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const nightView = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), nightMat);
  nightView.position.set(winX, winY + winH / 2, -4.15);
  group.add(nightView);

  // 月光洒入（从窗口斜射的光柱感：平行光 + 地面光斑）
  const moonBeam = new THREE.SpotLight(0xa8c0e8, 1.6, 14, Math.PI / 5, 0.5, 1.2);
  moonBeam.position.set(winX + 0.8, winY + winH - 0.2, -3.6);
  moonBeam.target.position.set(-1.5, 0, 1.5);
  moonBeam.castShadow = true;
  group.add(moonBeam, moonBeam.target);
  const moonPatch = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 3),
    new THREE.MeshBasicMaterial({ color: 0x8fa8d8, transparent: true, opacity: 0.07 })
  );
  moonPatch.rotation.x = -Math.PI / 2;
  moonPatch.rotation.z = 0.5;
  moonPatch.position.set(-0.8, 0.005, 0.2);
  group.add(moonPatch);

  // 床（深色剪影）
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x39415a, roughness: 1 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.6), bedMat);
  bed.position.set(-3.4, 0.25, -2.2);
  bed.castShadow = true;
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x5a647e, roughness: 1 }));
  pillow.position.set(-4.1, 0.57, -2.2);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x4a3a52, roughness: 1, flatShading: true }));
  blanket.position.set(-3.1, 0.53, -2.2);
  group.add(bed, pillow, blanket);

  // 床头柜 + 熄着的台灯（轮廓）
  const nightstand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }));
  nightstand.position.set(-4.5, 0.25, -3.3);
  const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.22, 8),
    new THREE.MeshStandardMaterial({ color: 0x555f75, roughness: 1 }));
  lampShade.position.set(-4.5, 0.75, -3.3);
  group.add(nightstand, lampShade);

  // 人物：坐在窗台上打电话，腿垂下来
  const me = createFigure({ bodyColor: 0x6a7590, pose: 'phone' });
  me.position.set(winX, winY - 0.35, -3.75);
  me.rotation.y = Math.PI * 0.15;
  group.add(me);

  // 极暗环境光，突出夜
  group.add(new THREE.AmbientLight(0x2a3450, 0.55));

  function update(t) {
    nightMat.uniforms.time.value = t;
  }

  return {
    group,
    update,
    camera: { pos: [-1.2, 1.6, 2.8], look: [winX * 0.6, 1.3, -3.5] },
  };
}
