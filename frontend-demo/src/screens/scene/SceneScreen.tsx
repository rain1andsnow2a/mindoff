/**
 * 片场主屏：内置场景轮播 + 我的场景 + 待确认片段 + 语音创建入口。
 * 创建流程（口述→整理→角色设定）以子状态在本组件内切换，搭建中/失败用覆盖层呈现。
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import {
  Button, Card, PageContainer, PageHeader, useResponsive,
} from "../../design-system";
import {
  listSceneTemplates, listScenes, createScene,
  listCandidates, dismissCandidate, streamConfirmCandidate,
} from "../../api";
import type { SceneParseResult } from "../../api";
import type { TheaterSceneId } from "../../theater";
import {
  BUILT_IN_SCENES, BuiltInScene, CharReady, SceneSubState,
  _AMBIENT, _AMBIENT_DEFAULT, useSceneSurface,
} from "./shared";
import { BuildFailed, BuildingStage } from "./BuildOverlays";
import {
  CAROUSEL_GAP, CAROUSEL_SIDE, CAROUSEL_SNAP,
  CharacterSetupSheet, CreateSceneEntry, SceneNarrationCapture, SceneSummaryPreview, ScenePortal,
} from "./SceneCreateFlow";

/** 后端 SceneOut（我的场景） */
interface MyScene {
  id: number; title: string; status: string; setting: string; turn: number;
}

/** 后端 CandidateOut（待确认片段） */
interface Candidate {
  id: number; content: string; surface_text: string; status: string | null; created_at: string;
}

/** 片场主屏。 */
export function SceneScreen({ onPlay }: { onPlay: (sceneId: number, theater?: TheaterSceneId) => void }) {
  const { theme, C } = useSceneSurface();
  const { isExpanded } = useResponsive();
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [subState, setSubState] = useState<SceneSubState>("browsing");
  const [selectedScene, setSelectedScene] = useState<BuiltInScene | null>(null);
  const [templates, setTemplates] = useState<BuiltInScene[]>(BUILT_IN_SCENES);
  const [myScenes, setMyScenes] = useState<MyScene[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [narration, setNarration] = useState("");
  const [parsedScene, setParsedScene] = useState<SceneParseResult | null>(null);
  // 失败重试用：记住上一次角色设定的结果，重试时不用让用户重新填
  const [pendingChar, setPendingChar] = useState<CharReady | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const refreshCandidates = () =>
    listCandidates()
      .then((list) => setCandidates(Array.isArray(list) ? list : []))
      .catch(() => {});

  useEffect(() => {
    listSceneTemplates()
      .then((list) => {
        if (Array.isArray(list) && list.length) {
          setTemplates(list.map((t: any) => ({
            id: t.id, title: t.title, desc: t.desc,
            relationships: t.relationships ?? [],
            colors: (t.colors?.length ? t.colors : ["#F5ECD8", "#E2C9A0"]) as BuiltInScene["colors"],
            theater: (BUILT_IN_SCENES.find(b => b.id === t.id)?.theater ?? "bedroom") as TheaterSceneId,
            ...(_AMBIENT[t.id] ?? _AMBIENT_DEFAULT),
          })));
        }
      })
      .catch(() => { /* 离线用本地内置模板 */ });
    listScenes()
      .then((list) => setMyScenes(Array.isArray(list) ? list : []))
      .catch(() => {});
    refreshCandidates();
  }, []);

  const handleConfirmCandidate = (c: Candidate) => {
    if (generating) return;
    setGenerating(true);
    setGenError("");
    streamConfirmCandidate(c.id, (e) => {
      if (e.event === "done" && e.data?.scene_id) {
        setGenerating(false);
        onPlay(e.data.scene_id);
      }
    })
      .catch((err) => {
        setGenerating(false);
        setGenError(err?.message ?? "确认失败，再试一次");
      });
  };

  const handleDismissCandidate = (id: number) => {
    dismissCandidate(id).then(refreshCandidates).catch(() => {});
  };

  const handleBack = () => {
    if (subState === "capturing") setSubState("browsing");
    else if (subState === "reviewing") setSubState("capturing");
    else if (subState === "setup") setSubState(selectedScene ? "browsing" : "reviewing");
    else setSubState("browsing");
  };

  // 角色设定完成 → 真实生成开场，拿到 scene_id 进入演练
  // 渲染方式由用户在设定页选择（char.renderKind）：generated_3d 生成式 3D / dynamic_image 图片 galgame，
  // 后端据此产 SceneSpec 或背景图+立绘，进入 ScenePlay 后按 render_kind 渲染。
  //
  // ⚠️ 失败时**不能**卸载 CharacterSetupSheet：它一卸载 step/输入全丢，用户会被莫名
  // 甩回「谁在你面前」第一步。所以 generating/genError 都用覆盖层呈现（见下方 return）。
  const buildScene = React.useCallback((char: CharReady) => {
    setGenerating(true);
    setGenError("");
    // 字段优先用「场景整理」抽出来的真实内容；走内置模板路径时回落到模板标题
    const p = parsedScene;
    const fields = {
      title: p?.title || selectedScene?.title || (char.name ? `和${char.name}的那一刻` : "那一刻"),
      people: (char.name || p?.people || "TA") + (char.relation ? `（${char.relation}）` : ""),
      place: p?.place || selectedScene?.title || "",
      plot: [
        narration,
        p?.counterpart_action ? `此刻对方：${p.counterpart_action}` : "",
        char.traits.length ? `对方会怎么表现：${char.traits.join("；")}` : "",
        char.desc,
        char.adjusted ? `补充：${char.adjusted}` : "",
      ].filter(Boolean).join("。"),
      intent: p?.intent || char.adjusted || char.desc || "试着说出没说的话",
      render_kind: char.renderKind,
    };
    createScene(fields)
      .then((scene) => {
        setGenerating(false);
        // galgame 场景按 render_kind 渲染，theater 参数被忽略，沿用原选择即可
        onPlay(scene.id, selectedScene?.theater);
      })
      .catch((err) => {
        setGenerating(false);
        setGenError(err?.message ?? "生成失败，再试一次");
      });
  }, [parsedScene, selectedScene, narration, onPlay]);

  const handleCharReady = (char: CharReady) => {
    if (generating) return;
    setPendingChar(char);   // 记下来，失败后可以原样重试，不用重新填
    buildScene(char);
  };

  const retryBuild = () => {
    if (pendingChar) buildScene(pendingChar);
    else setGenError("");
  };

  // 覆盖层：搭建中 / 搭建失败。用 absolute 盖在内容之上，而不是 return 掉内容，
  // 这样 CharacterSetupSheet 不会被卸载，用户填的称呼/介绍在失败后还在。
  const overlay = generating ? (
    <BuildingStage />
  ) : genError ? (
    <BuildFailed error={genError} canRetry={!!pendingChar}
      onRetry={retryBuild} onDismiss={() => setGenError("")} />
  ) : null;

  if (subState === "capturing") {
    return (
      <View style={{ flex: 1 }}>
        <SceneNarrationCapture onBack={handleBack}
          onConfirm={(text) => { setNarration(text); setSubState("reviewing"); }} />
        {overlay}
      </View>
    );
  }
  if (subState === "reviewing") {
    return (
      <View style={{ flex: 1 }}>
        <SceneSummaryPreview narration={narration} onBack={handleBack}
          onConfirm={(p) => { setParsedScene(p); setSubState("setup"); }} />
        {overlay}
      </View>
    );
  }
  if (subState === "setup") {
    return (
      <View style={{ flex: 1 }}>
        <CharacterSetupSheet scene={selectedScene} parsed={parsedScene}
          onBack={handleBack} onReady={handleCharReady} />
        {overlay}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
      <PageContainer maxWidth={1180}>
      <PageHeader
        eyebrow="安全演练"
        title="片场"
        description="进入一个场景，试着说出不同的话。这里没有标准答案，也可以随时离开。"
      />

      {/* Carousel */}
      <View style={{ height: 420 }}>
        <Animated.ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          snapToInterval={CAROUSEL_SNAP} snapToAlignment="start" decelerationRate="fast" disableIntervalMomentum
          contentContainerStyle={{ gap: CAROUSEL_GAP, paddingHorizontal: isExpanded ? 0 : CAROUSEL_SIDE, alignItems: "center" }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            {
              useNativeDriver: true,
              listener: (e: any) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / CAROUSEL_SNAP);
                setActiveIdx(Math.max(0, Math.min(idx, templates.length - 1)));
              },
            }
          )}
          scrollEventThrottle={16}
        >
          {templates.map((scene, i) => (
            <ScenePortal key={scene.id} scene={scene} index={i} scrollX={scrollX} isActive={activeIdx === i}
              onEnter={() => { setSelectedScene(scene); setParsedScene(null); setSubState("setup"); }} />
          ))}
        </Animated.ScrollView>
        <View style={{ position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {templates.map((_, i) => (
            <View key={i} style={{
              width: activeIdx === i ? 16 : 6, height: 6, borderRadius: 3,
              backgroundColor: activeIdx === i ? theme.colors.accentSurface : theme.colors.border,
            }} />
          ))}
        </View>
      </View>

      <View style={{ marginTop: theme.spacing[4] }}>
        {/* 我的场景（后端） */}
        {myScenes.length > 0 && (
          <View style={{ marginBottom: theme.spacing[5] }}>
            <Text style={[theme.typography.textStyles.sectionTitle, { marginBottom: theme.spacing[3], color: C.text }]}>我的场景</Text>
            {myScenes.map(s => (
              <Pressable key={s.id} onPress={() => onPlay(s.id)}
                style={({ pressed }) => [{
                  padding: theme.spacing[4], borderRadius: theme.radii.card, marginBottom: theme.spacing[2], flexDirection: "row", alignItems: "center",
                  backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "500", color: C.text }}>{s.title}</Text>
                  <Text style={{ fontSize: 12, marginTop: 2, color: C.muted }}>
                    {s.status === "settled" ? "已结算" : `进行中 · 第 ${s.turn} 轮`}
                  </Text>
                </View>
                <ChevronLeft size={15} color={C.muted} style={{ transform: [{ rotate: "180deg" }] }} />
              </Pressable>
            ))}
          </View>
        )}
        {/* 候选片段（后端） */}
        {candidates.length > 0 && (
          <View style={{ marginBottom: theme.spacing[5] }}>
            <Text style={[theme.typography.textStyles.sectionTitle, { marginBottom: theme.spacing[3], color: C.text }]}>待确认片段</Text>
            {candidates.map(c => (
              <Card key={c.id} style={{ marginBottom: theme.spacing[2] }}>
                <Text style={{ fontSize: 14, lineHeight: 20, color: C.text }}>
                  {(c.surface_text || c.content).slice(0, 120)}
                  {(c.surface_text || c.content).length > 120 ? "…" : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <View style={{ flex: 1 }}><Button fullWidth onPress={() => handleConfirmCandidate(c)}>进入场景</Button></View>
                  <View style={{ flex: 1 }}><Button fullWidth variant="secondary" onPress={() => handleDismissCandidate(c.id)}>忽略</Button></View>
                </View>
              </Card>
            ))}
          </View>
        )}
        {!!genError && (
          <Text style={{ fontSize: 12, textAlign: "center", marginBottom: 8, color: "#A26458" }}>{genError}</Text>
        )}
        <View style={{ height: 1, marginVertical: 24, backgroundColor: theme.colors.divider }} />
        <CreateSceneEntry onStart={() => {
          setSelectedScene(null);
          setParsedScene(null);
          setSubState("capturing");
        }} />
      </View>
      </PageContainer>
      </ScrollView>
      {overlay}
    </View>
  );
}
