/**
 * MindOff RN — 主入口（移植自 mindoff-proto App.tsx 的屏幕状态机）。
 * 数据均为原型 mock，接后端时替换为 /api/v1 调用。
 */
import React, { useRef, useState } from "react";
import { Animated, SafeAreaView, StatusBar, Text, View } from "react-native";
import { MistBackground, TabBar, Tab } from "./src/components";
import { NightCtx, palette } from "./src/theme";
import {
  OnboardHow, OnboardPermission, OnboardPet, OnboardWelcome,
} from "./src/screens/Onboarding";
import { CompanionChat, CompanionIdle, ModeSheet } from "./src/screens/Companion";
import { ProcessingScreen, ReceiptScreen, SleepDump } from "./src/screens/Dump";
import {
  LetterState, MailboxScreen, StorageDetail, TaskDetail,
} from "./src/screens/Mailbox";
import { SceneEnd, ScenePlay, SceneScreen } from "./src/screens/Scene";
import { PetChange, PetHandoff, ProfileScreen } from "./src/screens/Profile";
import { AuthScreen } from "./src/screens/Auth";
import { Tokens } from "./src/api";

type Screen =
  | "onboard-1" | "onboard-2" | "onboard-3" | "onboard-4"
  | "companion" | "chat" | "sleep-dump" | "processing" | "receipt"
  | "mailbox" | "task-detail" | "storage-detail"
  | "scene" | "scene-play" | "scene-end"
  | "profile" | "pet-change" | "pet-handoff";

const PET_DATA = [
  { name: "小栖", emoji: "🌿" },
  { name: "晴晴", emoji: "☀️" },
  { name: "暮云", emoji: "🌙" },
];

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
  "chat", "sleep-dump", "processing", "receipt",
  "task-detail", "storage-detail", "scene-play", "scene-end",
  "pet-change", "pet-handoff",
];

export default function App() {
  const [screen, setScreen] = useState<Screen>(INITIAL_SCREEN);
  const [tokens, setTokens] = useState<Tokens | null>(DEV_BYPASS ? DEV_TOKENS : null);
  const [tab, setTab] = useState<Tab>("companion");
  const [night, setNight] = useState(false);
  const [petIndex, setPetIndex] = useState(0);
  const [onboardPet, setOnboardPet] = useState(0);
  const [showMode, setShowMode] = useState(false);
  const [pendingPet, setPendingPet] = useState(0);
  const [letterState, setLetterState] = useState<LetterState>("sealed");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fade = useRef(new Animated.Value(1)).current;

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const go = (s: Screen) => {
    // 屏幕切换淡入（对齐 proto 的 AnimatePresence mode=wait 近似）
    Animated.timing(fade, { toValue: 0, duration: 90, useNativeDriver: true }).start(() => {
      setScreen(s);
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  };

  const handleOpenLetter = () => {
    if (letterState !== "sealed") return;
    setLetterState("opening");
    setTimeout(() => setLetterState("opened"), 680);
  };
  const handleSaveLetter = () => {
    setLetterState("saved");
    showToast("已放入长久珍藏 ✦");
  };
  const handleAckLetter = () => showToast("它知道你收到了");

  const pet = PET_DATA[petIndex];
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
            {screen === "onboard-1" && <OnboardWelcome onNext={() => go("onboard-2")} />}
            {screen === "onboard-2" && <OnboardHow onNext={() => go("onboard-3")} onBack={() => go("onboard-1")} />}
            {screen === "onboard-3" && (
              <OnboardPet onNext={() => go("onboard-4")} onBack={() => go("onboard-2")}
                selected={onboardPet} onSelect={setOnboardPet} />
            )}
            {screen === "onboard-4" && (
              <OnboardPermission
                onNext={() => { setPetIndex(onboardPet); go("companion"); }}
                onBack={() => go("onboard-3")} />
            )}

            {screen === "companion" && (
              <CompanionIdle petName={pet.name} petEmoji={pet.emoji}
                night={night} onNightToggle={() => setNight(n => !n)}
                onChat={() => go("chat")} onModeSheet={() => setShowMode(true)} />
            )}
            {screen === "chat" && (
              <CompanionChat petName={pet.name} petEmoji={pet.emoji}
                onBack={() => { go("companion"); setTab("companion"); }} />
            )}
            {screen === "sleep-dump" && (
              <SleepDump onBack={() => { go("companion"); setTab("companion"); }}
                onProcess={() => go("processing")} />
            )}
            {screen === "processing" && <ProcessingScreen onDone={() => go("receipt")} />}
            {screen === "receipt" && (
              <ReceiptScreen onDone={() => { go("companion"); setTab("companion"); }}
                onView={() => { go("mailbox"); setTab("mailbox"); }} />
            )}

            {screen === "mailbox" && (
              <MailboxScreen
                onTaskDetail={() => go("task-detail")}
                onStorageDetail={() => go("storage-detail")}
                letterState={letterState}
                onOpenLetter={handleOpenLetter}
                onSaveLetter={handleSaveLetter}
                onAckLetter={handleAckLetter}
                onReplyLetter={() => { go("chat"); setTab("companion"); }} />
            )}
            {screen === "task-detail" && <TaskDetail onBack={() => { go("mailbox"); setTab("mailbox"); }} />}
            {screen === "storage-detail" && <StorageDetail onBack={() => { go("mailbox"); setTab("mailbox"); }} />}

            {screen === "scene" && <SceneScreen onPlay={() => go("scene-play")} />}
            {screen === "scene-play" && <ScenePlay onEnd={() => go("scene-end")} />}
            {screen === "scene-end" && (
              <SceneEnd onBack={() => { go("scene"); setTab("scene"); }}
                onReplay={() => go("scene-play")} />
            )}

            {screen === "profile" && (
              <ProfileScreen petName={pet.name} petEmoji={pet.emoji}
                night={night} onNightToggle={() => setNight(n => !n)}
                onChangePet={() => go("pet-change")} />
            )}
            {screen === "pet-change" && (
              <PetChange onBack={() => { go("profile"); setTab("profile"); }}
                onHandoff={i => { setPendingPet(i + 1); go("pet-handoff"); }} />
            )}
            {screen === "pet-handoff" && (
              <PetHandoff newPetEmoji={PET_DATA[pendingPet]?.emoji ?? "☀️"}
                onBack={() => go("pet-change")}
                onDone={() => { setPetIndex(pendingPet); go("companion"); setTab("companion"); }} />
            )}
          </Animated.View>

          <ModeSheet visible={showMode} onClose={() => setShowMode(false)}
            onSleepDump={() => { setShowMode(false); go("sleep-dump"); }}
            onChat={() => { setShowMode(false); go("chat"); }} />

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
