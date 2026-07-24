/**
 * MindOff RN — 主入口（移植自 mindoff-proto App.tsx 的屏幕状态机）。
 * 桌宠/设置/记忆已接 /api/v1；原型 mock 仅在离线或 dev bypass 时降级。
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, SafeAreaView, StatusBar, Text, View } from "react-native";
import { MistBackground, TabBar, Tab } from "./src/components";
import { NightCtx, palette } from "./src/theme";
import {
  OnboardHow, OnboardPermission, OnboardPet, OnboardWelcome,
} from "./src/screens/Onboarding";
import { CompanionChat, CompanionIdle, ModeSheet } from "./src/screens/Companion";
import { VoiceCall } from "./src/screens/VoiceCall";
import { ProcessingScreen, ReceiptScreen, SleepDump } from "./src/screens/Dump";
import {
  MailboxScreen, StorageDetail, TaskDetail,
} from "./src/screens/Mailbox";
import { SceneEnd, ScenePlay, SceneScreen } from "./src/screens/Scene";
import { PetChange, PetHandoff, ProfileScreen, MemoryScreen, MemoryReviewScreen, Preferences } from "./src/screens/Profile";
import { AuthScreen } from "./src/screens/Auth";
import {
  getActivePet, getPreferences, listHandoffs, listPets, listPetPresets,
  loadTokens, setActivePet, Tokens, updatePreferences,
} from "./src/api";
import { initNotifications, startLetterPolling, stopLetterPolling } from "./src/notifications";
import { startCompanion, stopCompanion } from "mindoff-companion";
import type { TheaterSceneId } from "./src/theater";
import { THEATER_SCENE_IDS } from "./src/theater";

type Screen =
  | "onboard-1" | "onboard-2" | "onboard-3" | "onboard-4"
  | "companion" | "chat" | "voice-call" | "sleep-dump" | "processing" | "receipt"
  | "mailbox" | "task-detail" | "storage-detail"
  | "scene" | "scene-play" | "scene-end"
  | "profile" | "pet-change" | "pet-handoff"
  | "memory-list" | "memory-review";

type PetInfo = { id: number; name: string; emoji: string; summary: string };

// 内置预设的展示映射（后端预设无 emoji，前端按 preset_id 补表情）。
const PRESET_EMOJI: Record<string, string> = { miro: "✨", bobi: "☀️" };
const DEFAULT_PET: PetInfo = { id: 0, name: "米露", emoji: "✨", summary: "情绪碎片收藏家" };

function petFromPreset(p: any): PetInfo {
  const presetId = p.id as string;
  const emoji = PRESET_EMOJI[presetId] ?? "🌿";
  const summary = (p.personality as string) || "陪伴伙伴";
  return { id: presetId as any, name: p.name, emoji, summary };
}

function petFromOwned(p: any): PetInfo {
  const presetId = (p.preset_id as string) || "";
  const emoji = PRESET_EMOJI[presetId] ?? "🌿";
  const summary = (p.personality as string) || "陪伴伙伴";
  return { id: p.id as number, name: p.name, emoji, summary };
}

// 开发/验收钩子：web 下可用 ?screen=xxx 直达某屏（原生无 window，自动跳过）
const INITIAL_SCREEN: Screen = (() => {
  if (typeof window !== "undefined" && window.location?.search) {
    const m = new URLSearchParams(window.location.search).get("screen");
    if (m) return m as Screen;
  }
  return "onboard-1";
})();

// web 下带 ?screen= 参数时，跳过登录直达该屏（方便验收其它屏，无需后端）
const DEV_BYPASS =
  typeof window !== "undefined" &&
  !!window.location?.search &&
  new URLSearchParams(window.location.search).has("screen");
const DEV_TOKENS: Tokens = { access_token: "dev", refresh_token: "dev", token_type: "bearer" };

const FULL_SCREENS: Screen[] = [
  "chat", "voice-call", "sleep-dump", "processing", "receipt",
  "task-detail", "storage-detail", "scene-play", "scene-end",
  "pet-change", "pet-handoff", "memory-list", "memory-review",
];

const PREFERENCE_DEFAULTS: Preferences = {
  proactive_enabled: true,
  proactive_frequency: "温和",
  sleep_reminder_time: "22:30",
  keep_raw_dump: false,
  ephemeral_ttl_days: 3,
  font_size: "标准",
  companion_tone: "温暖",
  reduce_transparency: false,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>(INITIAL_SCREEN);
  const [tokens, setTokens] = useState<Tokens | null>(DEV_BYPASS ? DEV_TOKENS : null);
  const [tab, setTab] = useState<Tab>("companion");
  const [night, setNight] = useState(false);
  const [pet, setPet] = useState<PetInfo>(DEFAULT_PET);
  const [presets, setPresets] = useState<PetInfo[]>([]);
  const [ownedPets, setOwnedPets] = useState<PetInfo[]>([]);
  const [activePetId, setActivePetId] = useState<number | null>(null);
  const [pendingPetId, setPendingPetId] = useState<number | string | null>(null);
  const [pendingPet, setPendingPet] = useState<PetInfo | null>(null);
  const [handoffContent, setHandoffContent] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<typeof PREFERENCE_DEFAULTS>(PREFERENCE_DEFAULTS);
  const [showMode, setShowMode] = useState(false);
  const [chatMode, setChatMode] = useState("free_chat");
  const [sceneId, setSceneId] = useState<number | null>(null);
  const [sceneTheater, setSceneTheater] = useState<TheaterSceneId>("dining");
  const [toast, setToast] = useState<string | null>(null);
  const [dumpText, setDumpText] = useState("");
  const [dumpReceipt, setDumpReceipt] = useState<any>(null);
  const [chatSeedText, setChatSeedText] = useState("");
  const [dumpSeedText, setDumpSeedText] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fade = useRef(new Animated.Value(1)).current;

  // 启动时从存储恢复登录态（token 持久化，重启免重登）。
  useEffect(() => {
    if (DEV_BYPASS) return;
    loadTokens().then((t) => {
      if (t) {
        setTokens(t);
        setScreen("companion");
        setTab("companion");
      }
    });
  }, []);

  // 登录后：拉取当前桌宠 + 偏好；申请通知权限 + 开启来信轮询 + 拉起常驻陪伴前台服务。
  useEffect(() => {
    if (!tokens || DEV_BYPASS) {
      stopLetterPolling();
      stopCompanion();
      return;
    }
    let alive = true;
    initNotifications().then(() => {
      if (alive) startLetterPolling();
    });
    Promise.all([
      getActivePet().catch(() => null),
      getPreferences().catch(() => null),
    ]).then(([active, prefs]) => {
      if (!alive) return;
      if (active) {
        const p = petFromOwned(active);
        setPet(p);
        setActivePetId(p.id);
      }
      if (prefs) setPreferences({ ...PREFERENCE_DEFAULTS, ...prefs });
    });
    return () => {
      alive = false;
      stopLetterPolling();
    };
  }, [tokens]);

  // 当前桌宠变化时，更新常驻陪伴服务。
  useEffect(() => {
    if (!tokens || DEV_BYPASS) return;
    startCompanion(pet.name);
  }, [tokens, pet.name]);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const go = (s: Screen) => {
    Animated.timing(fade, { toValue: 0, duration: 90, useNativeDriver: true }).start(() => {
      setScreen(s);
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  };

  // 进入换宠屏时，拉取我的桌宠列表与当前主宠。
  useEffect(() => {
    if (screen !== "pet-change" || !tokens || DEV_BYPASS) return;
    Promise.all([listPets().catch(() => []), getActivePet().catch(() => null)])
      .then(([pets, active]) => {
        setOwnedPets((pets as any[]).map(petFromOwned));
        if (active) setActivePetId((active as any).id);
      });
  }, [screen, tokens]);

  // 进入选宠引导时，拉取后端预设。
  useEffect(() => {
    if (screen !== "onboard-3" || !tokens || DEV_BYPASS) return;
    listPetPresets()
      .then((data) => setPresets((data as any[]).map(petFromPreset)))
      .catch(() => setPresets([
        { id: "miro" as any, name: "米露", emoji: "✨", summary: "情绪碎片收藏家：安静、敏锐、擅长倾听和承接情绪" },
        { id: "bobi" as any, name: "波比", emoji: "☀️", summary: "晨光信使：温暖、热烈、有行动力，也尊重边界" },
      ]));
  }, [screen, tokens]);

  const handleSetPreference = async (patch: Partial<Preferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    if (!tokens || DEV_BYPASS) return;
    try {
      const saved = await updatePreferences(patch);
      setPreferences({ ...PREFERENCE_DEFAULTS, ...saved });
    } catch (e: any) {
      showToast(e?.message || "保存失败");
    }
  };

  const handleOnboardPetDone = async (selectedId: number | string | null) => {
    if (!selectedId) return;
    if (!tokens || DEV_BYPASS) {
      const fallback = presets.find((p) => p.id === selectedId) || DEFAULT_PET;
      setPet(fallback);
      go("companion");
      setTab("companion");
      return;
    }
    try {
      const res = await setActivePet(selectedId);
      const activated = res?.pet;
      if (activated) {
        const p = petFromOwned(activated);
        setPet(p);
        setActivePetId(p.id);
      }
      go("companion");
      setTab("companion");
    } catch (e: any) {
      showToast(e?.message || "选宠失败");
    }
  };

  const handlePetChange = async (petId: number | null) => {
    if (petId == null) return;
    const target = ownedPets.find((p) => p.id === petId);
    if (!target) return;
    setPendingPetId(petId);
    setPendingPet(target);
    if (!tokens || DEV_BYPASS) {
      setHandoffContent(null);
      go("pet-handoff");
      return;
    }
    try {
      const res = await setActivePet(petId);
      if (res?.pet) {
        const p = petFromOwned(res.pet);
        setPet(p);
        setActivePetId(p.id);
      }
      // 优先用本次切换返回的交接信，否则读最新一封。
      const summary = res?.handoff?.summary || (await latestHandoffSummary());
      setHandoffContent(summary);
      go("pet-handoff");
    } catch (e: any) {
      showToast(e?.message || "切换失败");
    }
  };

  const latestHandoffSummary = async (): Promise<string | null> => {
    try {
      const list = await listHandoffs();
      return (list as any[])?.[0]?.summary ?? null;
    } catch {
      return null;
    }
  };

  const C = palette(night);
  const isMainApp = !screen.startsWith("onboard");
  const showTabBar = isMainApp && !FULL_SCREENS.includes(screen);

  return (
    <NightCtx.Provider value={night}>
      <SafeAreaView style={{ flex: 1, backgroundColor: night ? "#1C1A20" : "#D8D2CA" }}>
        <StatusBar barStyle={night ? "light-content" : "dark-content"} />
        <View style={{ flex: 1, backgroundColor: C.bg, overflow: "hidden" }}>
          <MistBackground />
          {!tokens ? (
            <AuthScreen
              onAuthed={(t, m) => {
                setTokens(t);
                if (m === "register") {
                  setScreen("onboard-1");
                } else {
                  setScreen("companion");
                  setTab("companion");
                }
              }}
            />
          ) : (
          <>
          <Animated.View style={{ flex: 1, opacity: fade }}>
            {screen === "onboard-1" && (
              <OnboardWelcome
                onNext={() => go("onboard-2")}
                onSkip={() => { go("companion"); setTab("companion"); }}
              />
            )}
            {screen === "onboard-2" && <OnboardHow onNext={() => go("onboard-3")} onBack={() => go("onboard-1")} />}
            {screen === "onboard-3" && (
              <OnboardPet onNext={() => go("onboard-4")} onBack={() => go("onboard-2")}
                pets={presets.length ? presets : [
                  { id: "miro" as any, name: "米露", emoji: "✨", summary: "情绪碎片收藏家：安静、敏锐、擅长倾听和承接情绪" },
                  { id: "bobi" as any, name: "波比", emoji: "☀️", summary: "晨光信使：温暖、热烈、有行动力，也尊重边界" },
                ]}
                selectedId={pendingPetId}
                onSelect={(id) => setPendingPetId(id)} />
            )}
            {screen === "onboard-4" && (
              <OnboardPermission
                onNext={() => handleOnboardPetDone(pendingPetId)}
                onBack={() => go("onboard-3")} />
            )}

            {screen === "companion" && (
              <CompanionIdle petName={pet.name} petEmoji={pet.emoji}
                night={night} onNightToggle={() => setNight(n => !n)}
                onChat={() => go("chat")}
                onVoiceChat={(text) => { setChatSeedText(text); go("chat"); }}
                onVoiceCall={() => go("voice-call")}
                onModeSheet={() => setShowMode(true)} />
            )}
            {screen === "chat" && (
              <CompanionChat petName={pet.name} petEmoji={pet.emoji} mode={chatMode}
                initialText={chatSeedText}
                onBack={() => { setChatSeedText(""); go("companion"); setTab("companion"); }} />
            )}
            {screen === "voice-call" && (
              <VoiceCall petName={pet.name} petEmoji={pet.emoji}
                onEnd={() => { go("companion"); setTab("companion"); }} />
            )}
            {screen === "sleep-dump" && (
              <SleepDump initialText={dumpSeedText}
                onBack={() => { setDumpSeedText(""); go("companion"); setTab("companion"); }}
                onProcess={(t) => { setDumpText(t); go("processing"); }} />
            )}
            {screen === "processing" && (
              <ProcessingScreen text={dumpText}
                onDone={(r) => { setDumpReceipt(r); go("receipt"); }} />
            )}
            {screen === "receipt" && (
              <ReceiptScreen receipt={dumpReceipt}
                onDone={() => { go("companion"); setTab("companion"); }}
                onView={() => { go("mailbox"); setTab("mailbox"); }} />
            )}

            {screen === "mailbox" && (
              <MailboxScreen
                onTaskDetail={() => go("task-detail")}
                onStorageDetail={() => go("storage-detail")}
                petName={pet.name}
                onToast={showToast}
                onPlayScene={(sceneId, theaterId) => {
                  setSceneId(sceneId);
                  setSceneTheater(
                    THEATER_SCENE_IDS.includes((theaterId ?? "") as TheaterSceneId)
                      ? (theaterId as TheaterSceneId)
                      : "dining" // 一期：dynamic_image 邀请先用默认剧场兜底
                  );
                  go("scene-play");
                  setTab("scene");
                }}
                onReplyLetter={() => { go("chat"); setTab("companion"); }} />
            )}
            {screen === "task-detail" && <TaskDetail onBack={() => { go("mailbox"); setTab("mailbox"); }} />}
            {screen === "storage-detail" && <StorageDetail onBack={() => { go("mailbox"); setTab("mailbox"); }} />}

            {screen === "scene" && <SceneScreen onPlay={(id, theater) => { setSceneId(id); if (theater) setSceneTheater(theater); go("scene-play"); }} />}
            {screen === "scene-play" && <ScenePlay sceneId={sceneId} theater={sceneTheater} onEnd={() => go("scene-end")} />}
            {screen === "scene-end" && (
              <SceneEnd onBack={() => { go("scene"); setTab("scene"); }}
                onReplay={() => go("scene-play")} />
            )}

            {screen === "profile" && (
              <ProfileScreen petName={pet.name} petEmoji={pet.emoji} petSummary={pet.summary}
                night={night} onNightToggle={() => setNight(n => !n)}
                onChangePet={() => go("pet-change")}
                onMemory={() => go("memory-list")}
                onMemoryReview={() => go("memory-review")}
                preferences={preferences}
                onSetPreference={handleSetPreference} />
            )}
            {screen === "pet-change" && (
              <PetChange pets={ownedPets} activePetId={activePetId}
                onBack={() => { go("profile"); setTab("profile"); }}
                onHandoff={handlePetChange} />
            )}
            {screen === "pet-handoff" && (
              <PetHandoff oldPet={pet} newPet={pendingPet ?? undefined}
                handoffContent={handoffContent}
                onBack={() => go("pet-change")}
                onDone={() => { go("companion"); setTab("companion"); }} />
            )}
            {screen === "memory-list" && (
              <MemoryScreen onBack={() => { go("profile"); setTab("profile"); }} onToast={showToast} />
            )}
            {screen === "memory-review" && (
              <MemoryReviewScreen onBack={() => { go("profile"); setTab("profile"); }} onToast={showToast} />
            )}
          </Animated.View>

          <ModeSheet visible={showMode} onClose={() => setShowMode(false)}
            onSleepDump={() => { setDumpSeedText(""); setShowMode(false); go("sleep-dump"); }}
            onChat={(m) => { setChatSeedText(""); setChatMode(m); setShowMode(false); go("chat"); }} />

          {/* In-frame toast */}
          {toast && (
            <View style={{
              position: "absolute", bottom: 100, alignSelf: "center",
              paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999,
              backgroundColor: night ? "rgba(50,46,56,0.94)" : "rgba(255,252,245,0.92)",
              borderWidth: 1,
              borderColor: night ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.55)",
            }}>
              <Text style={{ fontSize: 13, fontWeight: "500", color: C.text }}>{toast}</Text>
            </View>
          )}

          {showTabBar && (
            <TabBar active={tab} onChange={(t) => { setTab(t); go(t as Screen); }} />
          )}
          </>
          )}
        </View>
      </SafeAreaView>
    </NightCtx.Provider>
  );
}
