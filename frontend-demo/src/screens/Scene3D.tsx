/**
 * Scene3D：片场的 3D 舞台背景 + 手势轨道相机，挂载移植自 theater 项目的低多边形场景。
 *
 * 与 theater（three.js + Vite）同一份视觉：
 * - 场景本体是纯 three.js 对象（src/theater/*，1:1 移植），通过 <primitive> 挂进 R3F；
 * - 渲染器参数对齐 theater/src/main.js：PCFSoftShadowMap 阴影、sRGB 输出、
 *   ACESFilmicToneMapping（曝光 1.1）；
 * - 每帧驱动场景的 update(t)（火焰、海浪、热气、航行灯等动画）。
 *
 * 交互：单指拖动绕场景中心转动视角；双指捏合拉近/推远（RN 内置 PanResponder +
 * 球坐标轨道相机，零新依赖）。未操作时相机在当前视角上叠加极缓慢的「呼吸」漂移，
 * 营造活着的镜头感。
 *
 * 注意：expo-gl 是原生模块，Web 端可直接跑；原生（Android/iOS）需要执行
 * `expo prebuild` 并重新构建安装包后才能生效。
 */
import React, { useEffect, useMemo, useRef } from "react";
import { View, PanResponder } from "react-native";
import { Canvas, useFrame } from "@react-three/fiber/native";
import * as THREE from "three";
import { THEATER_SCENES } from "../theater";
import type { TheaterSceneId } from "../theater";

interface Scene3DProps {
  /** theater 场景 id（campsite / bedroom / seaside / dining / airport / station）。 */
  sceneId: TheaterSceneId;
}

/** 用户操作累计的视角增量（方位角/极角，弧度）+ 相机半径倍率。ref 直传渲染帧，不触发 re-render。 */
type Orbit = { az: number; polar: number; scale: number };

// ─── theater 场景挂载 ──────────────────────────────────────────────────────────

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const withGeo = obj as THREE.Mesh;
    if (withGeo.geometry) withGeo.geometry.dispose();
    const mat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}

function TheaterStage({ sceneId, orbit }: { sceneId: TheaterSceneId; orbit: React.MutableRefObject<Orbit> }) {
  // 场景只构建一次（或切换场景时重建），每帧只调 update(t)。
  const scene = useMemo(() => THEATER_SCENES[sceneId](), [sceneId]);

  useEffect(() => {
    return () => disposeObject(scene.group);
  }, [scene]);

  // 由场景初始机位（pos 相对 look 中心）推导球坐标基准，用户拖动在其上叠加增量。
  const base = useMemo(() => {
    const { pos, look } = scene.camera;
    const ox = pos[0] - look[0], oy = pos[1] - look[1], oz = pos[2] - look[2];
    const r = Math.hypot(ox, oy, oz) || 1;
    const theta0 = Math.atan2(ox, oz);                          // 初始方位角（绕 Y 轴）
    const phi0 = Math.acos(Math.min(1, Math.max(-1, oy / r)));  // 初始极角（自 +Y 轴俯仰）
    return { r, theta0, phi0, look };
  }, [scene]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    scene.update(t);
    const { r, theta0, phi0, look } = base;
    // 用户拖动增量叠加到初始球坐标；极角夹紧到 [0.15, π-0.15] 避免翻越极点导致画面倒转。
    const theta = theta0 + orbit.current.az;
    const phi = Math.min(Math.PI - 0.15, Math.max(0.15, phi0 + orbit.current.polar));
    // 半径 = 初始半径 × 用户捏合倍率 + 极缓慢「呼吸」（±0.05），保留活着的镜头感。
    const br = r * orbit.current.scale + Math.sin(t * 0.3) * 0.05;
    const cam = state.camera;
    cam.position.set(
      look[0] + br * Math.sin(phi) * Math.sin(theta),
      look[1] + br * Math.cos(phi),
      look[2] + br * Math.sin(phi) * Math.cos(theta)
    );
    cam.lookAt(look[0], look[1], look[2]);
  });

  return <primitive object={scene.group} />;
}

// ─── 导出组件 ──────────────────────────────────────────────────────────────────

export function Scene3D({ sceneId }: Scene3DProps) {
  const orbit = useRef<Orbit>({ az: 0, polar: 0, scale: 1 });
  // g.dx/g.dy 是自手势起点的累计位移，记录上一帧值以取相对增量，避免每次 move 累加爆冲。
  const last = useRef({ dx: 0, dy: 0 });
  // 双指捏合上一帧的指间距（px），null 表示未在捏合。
  const pinchDist = useRef<number | null>(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => { last.current = { dx: 0, dy: 0 }; pinchDist.current = null; },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches;
          // 双指 → 捏合缩放（拉近/推远），期间不转视角
          if (touches.length >= 2) {
            const [a, b] = touches;
            const d = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            if (pinchDist.current && d > 0) {
              // 指间距变大（张开）→ ratio<1 → 半径变小 → 拉近；夹紧到 [0.45, 2.2] 倍
              const ratio = pinchDist.current / d;
              orbit.current.scale = Math.min(2.2, Math.max(0.45, orbit.current.scale * ratio));
            }
            pinchDist.current = d;
            // 同步旋转基准，松开一根手指回到单指时不跳变
            last.current = { dx: g.dx, dy: g.dy };
            return;
          }
          // 单指 → 绕中心转视角
          pinchDist.current = null;
          const ddx = g.dx - last.current.dx;
          const ddy = g.dy - last.current.dy;
          last.current = { dx: g.dx, dy: g.dy };
          // 方向语义：手指右移 → 视角向右绕（跟手），故 az -= ；手指下移 → 抬高俯视角，polar += 。
          // 系数 0.006 rad/px：横扫 ~500px 约转 172°。
          orbit.current.az -= ddx * 0.006;
          orbit.current.polar += ddy * 0.006;
        },
        onPanResponderRelease: () => { last.current = { dx: 0, dy: 0 }; pinchDist.current = null; },
        onPanResponderTerminate: () => { last.current = { dx: 0, dy: 0 }; pinchDist.current = null; },
      }),
    []
  );

  return (
    <View
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      {...responder.panHandlers}
    >
      <Canvas
        shadows
        camera={{ fov: 50, near: 0.1, far: 400 }}
        style={{ flex: 1 }}
        onCreated={({ gl }) => {
          // 对齐 theater/src/main.js 的渲染器配置
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <TheaterStage sceneId={sceneId} orbit={orbit} />
      </Canvas>
    </View>
  );
}
