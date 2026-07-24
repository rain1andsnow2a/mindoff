/**
 * Scene3D：片场的 3D 舞台背景，挂载移植自 theater 项目的低多边形场景。
 *
 * 与 theater（three.js + Vite）同一份视觉：
 * - 场景本体是纯 three.js 对象（src/theater/*，1:1 移植），通过 <primitive> 挂进 R3F；
 * - 渲染器参数对齐 theater/src/main.js：PCFSoftShadowMap 阴影、sRGB 输出、
 *   ACESFilmicToneMapping（曝光 1.1）；
 * - 每帧驱动场景的 update(t)（火焰、海浪、热气、航行灯等动画），
 *   并在场景设定的机位上叠加极缓慢的「呼吸」漂移，营造活着的镜头感。
 *
 * 注意：expo-gl 是原生模块，Web 端可直接跑；原生（Android/iOS）需要执行
 * `expo prebuild` 并重新构建安装包后才能生效。
 */
import React, { useEffect, useMemo } from "react";
import { View } from "react-native";
import { Canvas, useFrame } from "@react-three/fiber/native";
import * as THREE from "three";
import { THEATER_SCENES } from "../theater";
import type { TheaterSceneId } from "../theater";

interface Scene3DProps {
  /** theater 场景 id（campsite / bedroom / seaside / dining / airport / station）。 */
  sceneId: TheaterSceneId;
}

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

function TheaterStage({ sceneId }: { sceneId: TheaterSceneId }) {
  // 场景只构建一次（或切换场景时重建），每帧只调 update(t)。
  const scene = useMemo(() => THEATER_SCENES[sceneId](), [sceneId]);

  useEffect(() => {
    return () => disposeObject(scene.group);
  }, [scene]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    scene.update(t);
    // 相机呼吸：在场景指定机位上叠加缓慢漂移
    const { pos, look } = scene.camera;
    const cam = state.camera;
    cam.position.set(
      pos[0] + Math.sin(t * 0.3) * 0.12,
      pos[1] + Math.sin(t * 0.23 + 1.7) * 0.08,
      pos[2] + Math.sin(t * 0.17 + 0.6) * 0.1
    );
    cam.lookAt(look[0], look[1], look[2]);
  });

  return <primitive object={scene.group} />;
}

// ─── 导出组件 ──────────────────────────────────────────────────────────────────

export function Scene3D({ sceneId }: Scene3DProps) {
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
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
        <TheaterStage sceneId={sceneId} />
      </Canvas>
    </View>
  );
}
