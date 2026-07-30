/**
 * 生成式 3D 场景预览屏（?screen=scene3d-preview）。
 *
 * 开发/验收用：在 SCENE_SAMPLES 的手写 SceneSpec 之间切换，验证 assembleScene
 * 的拼装效果与手势相机。不参与正式业务流程。
 */
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Scene3D } from "./Scene3D";
import { SCENE_SAMPLES } from "../theater";

const KEYS = Object.keys(SCENE_SAMPLES);

export function Scene3DPreview() {
  const [key, setKey] = useState(KEYS[0]);
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Scene3D spec={SCENE_SAMPLES[key]} />

      {/* 顶部：样例切换 */}
      <View style={{
        position: "absolute", top: 44, left: 0, right: 0,
        flexDirection: "row", flexWrap: "wrap", gap: 8,
        paddingHorizontal: 16, justifyContent: "center",
      }}>
        {KEYS.map((k) => {
          const on = k === key;
          return (
            <Pressable key={k} onPress={() => setKey(k)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                backgroundColor: on ? "rgba(246,231,168,0.92)" : "rgba(20,24,32,0.55)",
                borderWidth: 1, borderColor: on ? "rgba(196,149,58,0.5)" : "rgba(255,255,255,0.25)",
              }}>
              <Text style={{ fontSize: 13, fontWeight: on ? "600" : "400", color: on ? "#463f3c" : "rgba(255,255,255,0.85)" }}>{k}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* 底部：手势提示 */}
      <View style={{ position: "absolute", bottom: 32, left: 0, right: 0, alignItems: "center" }}>
        <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>单指拖动转视角 · 双指捏合缩放</Text>
      </View>
    </View>
  );
}
