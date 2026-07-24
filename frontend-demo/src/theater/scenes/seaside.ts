/** 深夜通话 · 海边：月下海面、沙滩、坐在岸边的人（1:1 移植自 theater/src/scenes/seaside.js） */
import * as THREE from "three";
import { createSkyDome, createStars, createMoon } from "../utils";
import { createFigure } from "../figure";
import type { TheaterScene } from "../types";

export function create(): TheaterScene {
  const group = new THREE.Group();

  group.add(createSkyDome({ top: 0x060b1c, bottom: 0x142238 }));
  const stars = createStars({ count: 1200 });
  group.add(stars);
  group.add(createMoon({ size: 5, height: 32, angle: 0 }));

  // 海面（顶点波动 + 月光反射带）
  const seaGeo = new THREE.PlaneGeometry(200, 120, 90, 50);
  const seaMat = new THREE.ShaderMaterial({
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
        // 月光反射带（沿中心、随波闪烁）
        float band = exp(-pow((vUv.x - 0.5) * 6.0, 2.0));
        float shimmer = 0.5 + 0.5 * sin(vUv.y * 120.0 + time * 2.0 + vWave * 8.0);
        col += vec3(0.85, 0.82, 0.65) * band * shimmer * (0.12 + vUv.y * 0.3);
        // 远处海平线微光
        col += vec3(0.3, 0.35, 0.5) * smoothstep(0.85, 1.0, vUv.y) * 0.3;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.15, -50);
  group.add(sea);

  // 沙滩
  const sandMat = new THREE.MeshStandardMaterial({ color: 0x4a4136, roughness: 1 });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(200, 40, 1, 1), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, 16);
  sand.receiveShadow = true;
  group.add(sand);

  // 海浪沫线（贴岸边的亮线，缓慢推移）
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xc8d8e8, transparent: true, opacity: 0.25 });
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(160, 0.8), foamMat);
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.02, 8.5);
  group.add(foam);

  // 几块礁石
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2c313a, roughness: 1, flatShading: true });
  ([[-14, 4, 2.5], [18, 1, 3.5], [8, -2, 1.6]] as const).forEach(([x, z, s]) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    rock.position.set(x, s * 0.3, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    group.add(rock);
  });

  // 人物：坐在沙滩上打电话，面向海
  const me = createFigure({ bodyColor: 0x8a7a9a, pose: "phone" });
  me.position.set(-1.2, 0, 6);
  me.rotation.y = Math.PI; // 背对镜头朝海
  group.add(me);

  // 远处椰子树剪影（一丛）
  const palmMat = new THREE.MeshStandardMaterial({ color: 0x0e1a16, roughness: 1, flatShading: true });
  const mkPalm = (x: number, z: number, s: number, lean: number) => {
    const p = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 4.5 * s, 6), palmMat);
    trunk.position.y = 2.25 * s;
    trunk.rotation.z = lean;
    p.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.25 * s, 2.4 * s, 4), palmMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.sin(lean) * -2.2 * s + Math.cos(a) * 0.8 * s, 4.5 * s, Math.sin(a) * 0.8 * s);
      leaf.rotation.z = (Math.PI / 2.3) * Math.cos(a);
      leaf.rotation.x = (Math.PI / 2.3) * Math.sin(a);
      p.add(leaf);
    }
    p.position.set(x, 0, z);
    return p;
  };
  group.add(mkPalm(-16, 10, 1.2, 0.15), mkPalm(-18.5, 12, 0.9, -0.1));

  // 光：月光为主
  group.add(new THREE.AmbientLight(0x2c3a55, 0.6));
  const moonLight = new THREE.DirectionalLight(0xa8bce0, 0.9);
  moonLight.position.set(0, 30, -60);
  moonLight.castShadow = true;
  group.add(moonLight);

  function update(t: number) {
    stars.userData.update(t);
    seaMat.uniforms.time.value = t;
    // 浪沫缓慢推向岸边
    const push = Math.sin(t * 0.35) * 0.5 + 0.5;
    foam.position.z = 8.5 + push * 1.2;
    foamMat.opacity = 0.1 + push * 0.22;
    foam.scale.x = 1 + push * 0.05;
  }

  return {
    group,
    update,
    camera: { pos: [-0.5, 1.8, 11.5], look: [0, 2.5, -20] },
  };
}
