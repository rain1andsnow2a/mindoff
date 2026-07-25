/**
 * 实时语音通话页（桌宠文字或语音回复）。
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PhoneOff, Volume2 } from "lucide-react-native";

import {
  Button,
  Card,
  CompanionAvatar,
  MessageBubble,
  PageContainer,
  StatusDot,
  useReducedMotion,
  useResponsive,
  useTheme,
} from "../design-system";
import { createScene } from "../api";
import { useRealtimeCall, type CallStatus } from "../useRealtimeCall";

function statusLabel(status: CallStatus, error: string | null): string {
  if (error) return error;
  switch (status) {
    case "connecting":
      return "正在接通…";
    case "listening":
      return "在听你说";
    case "thinking":
      return "在想怎么回你…";
    case "ended":
      return "通话结束";
    case "error":
      return "出了点问题";
    default:
      return "准备中…";
  }
}

type VoiceCallProps = {
  onEnd: () => void;
  onEnterScene: (sceneId: number, theaterId?: string) => void;
  onToast?: (message: string) => void;
  petEmoji: string;
  petName: string;
};

export function VoiceCall({
  onEnd,
  onEnterScene,
  onToast,
  petEmoji,
  petName,
}: VoiceCallProps) {
  const theme = useTheme();
  const { isCompact, isExpanded } = useResponsive();
  const reducedMotion = useReducedMotion();
  const [voiceReply, setVoiceReply] = useState(false);
  const [building, setBuilding] = useState(false);
  const call = useRealtimeCall(voiceReply);
  const scrollRef = useRef<ScrollView>(null);
  const ring = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    call.start();
    return () => call.stop();
    // 通话对象内部方法会随状态更新；这里只在进屏时接通一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      ring.setValue(1);
      return;
    }
    Animated.timing(ring, {
      duration: 120,
      toValue: 1 + Math.min(call.level, 1) * 0.45,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [call.level, reducedMotion, ring]);

  useEffect(() => {
    AsyncStorage.getItem("mindoff.voiceReply").then((value) => {
      if (value === "1") setVoiceReply(true);
    });
  }, []);

  const toggleVoice = () => {
    setVoiceReply((previous) => {
      const next = !previous;
      AsyncStorage.setItem("mindoff.voiceReply", next ? "1" : "0").catch(
        () => {},
      );
      return next;
    });
  };

  const hangup = () => {
    call.stop();
    onEnd();
  };

  const enterScene = async () => {
    const suggestion = call.sceneSuggestion;
    if (!suggestion || building) return;

    setBuilding(true);
    try {
      const seed = suggestion.seed ?? {};
      const scene = await createScene({
        title: seed.title ?? undefined,
        people: seed.people ?? undefined,
        place: seed.place ?? undefined,
        plot: seed.plot ?? undefined,
        intent: seed.intent ?? undefined,
        theater_id: suggestion.theater_id,
      });
      call.dismissSuggestion();
      call.stop();
      onEnterScene(
        scene.id,
        scene.theater_id ?? suggestion.theater_id ?? undefined,
      );
    } catch {
      setBuilding(false);
      onToast?.("场景没搭起来，待会儿再试试");
    }
  };

  const callStage = (
    <View
      style={{
        flex: isExpanded ? undefined : 1.2,
        width: isExpanded ? 360 : "100%",
        minHeight: isExpanded ? 560 : undefined,
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: theme.spacing[6],
      }}
    >
      <View style={{ alignItems: "center", maxWidth: 320 }}>
        <Text
          style={[
            theme.typography.textStyles.sectionTitle,
            { color: theme.colors.textPrimary },
          ]}
        >
          {petName}
        </Text>
        <View style={{ marginTop: theme.spacing[1] }}>
          <StatusDot
            color={
              call.status === "error"
                ? theme.colors.error
                : call.status === "ended"
                  ? theme.colors.textMuted
                  : theme.colors.success
            }
            label={statusLabel(call.status, call.error)}
          />
        </View>
      </View>

      <View
        style={{
          width: isCompact ? 184 : 260,
          height: isCompact ? 184 : 260,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Animated.View
          style={{
            position: "absolute",
            width: isCompact ? 154 : 210,
            height: isCompact ? 154 : 210,
            borderRadius: isCompact ? 77 : 105,
            backgroundColor: theme.colors.accentSoft,
            opacity: 0.72,
            transform: [{ scale: ring }],
          }}
        />
        <CompanionAvatar emoji={petEmoji} size={isCompact ? 116 : 158} />
      </View>

      {call.liveUser ? (
        <Text
          numberOfLines={3}
          style={[
            theme.typography.textStyles.body,
            {
              maxWidth: 320,
              paddingHorizontal: theme.spacing[4],
              textAlign: "center",
              color: theme.colors.textSecondary,
              fontStyle: "italic",
            },
          ]}
        >
          “{call.liveUser}”
        </Text>
      ) : (
        <Text
          style={[
            theme.typography.textStyles.caption,
            { color: theme.colors.textMuted },
          ]}
        >
          你可以自然地说，我会在停顿时回应
        </Text>
      )}

      <View style={{ alignItems: "center" }}>
        <Pressable
          accessibilityLabel="挂断通话"
          accessibilityRole="button"
          onPress={hangup}
          style={({ pressed }) => ({
            width: isCompact ? 56 : 64,
            height: isCompact ? 56 : 64,
            borderRadius: isCompact ? 28 : 32,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.error,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.94 : 1 }],
            ...theme.shadows.soft,
          })}
        >
          <PhoneOff color="#FFFFFF" size={26} />
        </Pressable>
        <Text
          style={[
            theme.typography.textStyles.caption,
            { marginTop: theme.spacing[2], color: theme.colors.textMuted },
          ]}
        >
          {call.available ? "点击挂断" : "实时通话需在真机上使用"}
        </Text>
      </View>
    </View>
  );

  const conversation = (
    <Card
      style={{
        flex: 1,
        minHeight: isExpanded ? 560 : isCompact ? 180 : 240,
        maxHeight: isExpanded ? 680 : isCompact ? 220 : undefined,
        padding: 0,
        overflow: "hidden",
      }}
    >
      <Pressable
        accessibilityLabel={`桌宠语音回复${voiceReply ? "已开启" : "已关闭"}`}
        accessibilityRole="switch"
        accessibilityState={{ checked: voiceReply }}
        onPress={toggleVoice}
        style={({ pressed }) => ({
          minHeight: 72,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          paddingHorizontal: theme.spacing[5],
          paddingVertical: theme.spacing[3],
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.divider,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: theme.radii.control,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.accentSoft,
          }}
        >
          <Volume2 color={theme.colors.accent} size={19} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              theme.typography.textStyles.bodyStrong,
              { color: theme.colors.textPrimary },
            ]}
          >
            桌宠语音回复
          </Text>
          <Text
            style={[
              theme.typography.textStyles.caption,
              { color: theme.colors.textSecondary },
            ]}
          >
            开启后{petName}会出声，也保留字幕
          </Text>
        </View>
        <View
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            padding: 3,
            justifyContent: "center",
            alignItems: voiceReply ? "flex-end" : "flex-start",
            backgroundColor: voiceReply
              ? theme.colors.accentSurface
              : theme.colors.disabledSurface,
          }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: theme.colors.surfaceElevated,
              ...theme.shadows.soft,
            }}
          />
        </View>
      </Pressable>

      {call.sceneSuggestion ? (
        <View
          style={{
            gap: theme.spacing[3],
            paddingHorizontal: theme.spacing[5],
            paddingVertical: theme.spacing[4],
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.divider,
            backgroundColor: theme.colors.accentSoft,
          }}
        >
          <Text
            style={[
              theme.typography.textStyles.bodyStrong,
              { color: theme.colors.textPrimary },
            ]}
          >
            要现在就走进《{call.sceneSuggestion.seed?.title || "这一幕"}》吗？
          </Text>
          <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Button disabled={building} fullWidth onPress={enterScene}>
                {building ? "在搭场景…" : "进入"}
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                disabled={building}
                fullWidth
                onPress={call.dismissSuggestion}
                variant="secondary"
              >
                以后再说
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: call.turns.length ? "flex-start" : "center",
          padding: theme.spacing[5],
        }}
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
        ref={scrollRef}
        style={{ flex: 1 }}
      >
        {call.turns.length ? (
          call.turns.map((turn) => (
            <MessageBubble
              emoji={petEmoji}
              key={turn.id}
              pending={turn.role === "pet" && !turn.text}
              text={turn.text || "•••"}
              variant={turn.role === "pet" ? "agent" : "user"}
            />
          ))
        ) : (
          <View style={{ alignItems: "center" }}>
            <Text
              style={[
                theme.typography.textStyles.body,
                {
                  maxWidth: 320,
                  textAlign: "center",
                  color: theme.colors.textMuted,
                },
              ]}
            >
              对话内容会安静地留在这里，方便你回看。
            </Text>
          </View>
        )}
      </ScrollView>
    </Card>
  );

  return (
    <PageContainer
      maxWidth={1040}
      style={{
        flex: 1,
        paddingBottom: isCompact ? theme.spacing[4] : theme.spacing[8],
        paddingTop: isCompact ? theme.spacing[2] : theme.spacing[6],
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: isExpanded ? "row" : "column",
          alignItems: "stretch",
          gap: isExpanded ? theme.spacing[10] : theme.spacing[4],
        }}
      >
        {callStage}
        {conversation}
      </View>
    </PageContainer>
  );
}
