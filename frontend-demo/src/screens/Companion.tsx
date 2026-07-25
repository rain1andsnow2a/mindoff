/**
 * 陪伴首页、聊天页与模式选择。
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ChevronLeft,
  ChevronRight,
  Mic,
  Moon,
  Plus,
  Send,
  Square,
  Sun,
} from "lucide-react-native";

import {
  CompanionAvatar,
  IconButton,
  ListItem,
  MessageBubble,
  PageContainer,
  ResponsiveOverlay,
  StatusDot,
  useReducedMotion,
  useResponsive,
  useTheme,
} from "../design-system";
import {
  createConversation,
  getActivePet,
  getCompanionHome,
  streamChatReply,
} from "../api";
import { HomePetArtwork } from "../components/HomePetArtwork";
import { useVoiceInput } from "../useVoiceInput";

type CompanionIdleProps = {
  night: boolean;
  onChat: () => void;
  onModeSheet: () => void;
  onNightToggle: () => void;
  onVoiceCall: () => void;
  onVoiceChat: (text: string) => void;
  petEmoji: string;
  petName: string;
  petPresetId: string | null;
};

export function CompanionIdle({
  night,
  onChat,
  onModeSheet,
  onNightToggle,
  onVoiceCall,
  onVoiceChat,
  petEmoji,
  petName,
  petPresetId,
}: CompanionIdleProps) {
  const theme = useTheme();
  const { isCompact, isExpanded } = useResponsive();
  const reducedMotion = useReducedMotion();
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const [statusText, setStatusText] = useState("在等你");
  const [bubbleText, setBubbleText] = useState("今天怎么样？✨");
  const [homePetName, setHomePetName] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const voice = useVoiceInput(onVoiceChat);

  useEffect(() => {
    getCompanionHome()
      .then((home) => {
        if (home?.status_text) setStatusText(home.status_text);
        if (home?.pet?.name) setHomePetName(home.pet.name);
        if (home?.invitation?.text) setBubbleText(home.invitation.text);
        else if (home?.behavior) {
          setBubbleText(`它正在${home.behavior}，去陪陪它？`);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      fade.setValue(1);
    } else {
      Animated.timing(fade, {
        duration: theme.motion.durations.enter,
        toValue: 1,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    }

    const timer = setTimeout(() => {
      if (reducedMotion) {
        setBubbleVisible(false);
        return;
      }
      Animated.timing(fade, {
        duration: theme.motion.durations.exit,
        toValue: 0,
        useNativeDriver: Platform.OS !== "web",
      }).start(() => setBubbleVisible(false));
    }, 4200);

    return () => clearTimeout(timer);
  }, [fade, reducedMotion, theme.motion.durations.enter, theme.motion.durations.exit]);

  return (
    <PageContainer
      maxWidth={1040}
      style={{
        flex: 1,
        paddingBottom: isExpanded ? theme.spacing[8] : 100,
        paddingTop: isCompact ? theme.spacing[4] : theme.spacing[8],
      }}
    >
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text
            style={[
              theme.typography.textStyles.sectionTitle,
              { color: theme.colors.textPrimary },
            ]}
          >
            {homePetName ?? petName}
          </Text>
          <StatusDot label={statusText} />
        </View>
        <IconButton
          accessibilityLabel={night ? "切换到日间模式" : "切换到夜间模式"}
          icon={
            night ? (
              <Sun size={20} color={theme.colors.textSecondary} />
            ) : (
              <Moon size={20} color={theme.colors.textSecondary} />
            )
          }
          onPress={onNightToggle}
        />
      </View>

      <Pressable
        accessibilityHint="进入实时语音陪伴"
        accessibilityLabel={`和${homePetName ?? petName}说话`}
        accessibilityRole="button"
        onPress={onVoiceCall}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 320,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        })}
      >
        {bubbleVisible ? (
          <Animated.View
            style={{
              position: "absolute",
              top: isCompact ? "8%" : "12%",
              maxWidth: 360,
              paddingHorizontal: theme.spacing[5],
              paddingVertical: theme.spacing[3],
              borderRadius: theme.radii.card,
              borderBottomLeftRadius: theme.radii.control / 2,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceElevated,
              opacity: fade,
              transform: [
                {
                  translateY: fade.interpolate({
                    inputRange: [0, 1],
                    outputRange: [theme.motion.distances.standard, 0],
                  }),
                },
              ],
              ...theme.shadows.soft,
            }}
          >
            <Text
              style={[
                theme.typography.textStyles.body,
                { color: theme.colors.textPrimary },
              ]}
            >
              {bubbleText}
            </Text>
          </Animated.View>
        ) : null}
        <HomePetArtwork
          fallbackEmoji={petEmoji}
          presetId={petPresetId}
          size={isCompact ? 210 : 238}
        />
        <Text
          style={[
            theme.typography.textStyles.caption,
            { marginTop: theme.spacing[5], color: theme.colors.textMuted },
          ]}
        >
          轻触和它说话
        </Text>
      </Pressable>

      <View
        style={{
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
        }}
      >
        <View
          style={{
            flex: 1,
            minHeight: 54,
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: theme.spacing[5],
            paddingRight: theme.spacing[1],
            borderRadius: theme.radii.pill,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
            ...theme.shadows.soft,
          }}
        >
          <Pressable
            accessibilityLabel="打开文字聊天"
            accessibilityRole="button"
            onPress={onChat}
            style={{ flex: 1, justifyContent: "center", alignSelf: "stretch" }}
          >
            <Text
              style={[
                theme.typography.textStyles.body,
                { color: theme.colors.placeholder },
              ]}
            >
              说点什么…
            </Text>
          </Pressable>
          <IconButton
            accessibilityLabel={voice.isRecording ? "停止录音" : "语音输入"}
            disabled={voice.transcribing}
            selected={voice.isRecording}
            icon={
              voice.transcribing ? (
                <ActivityIndicator color={theme.colors.accent} size="small" />
              ) : voice.isRecording ? (
                <Square
                  color={theme.colors.accent}
                  fill={theme.colors.accent}
                  size={15}
                />
              ) : (
                <Mic color={theme.colors.accent} size={19} />
              )
            }
            onPress={voice.isRecording ? voice.stop : voice.start}
          />
        </View>
        <IconButton
          accessibilityLabel="选择陪伴模式"
          icon={<Plus color={theme.colors.accent} size={22} />}
          onPress={onModeSheet}
          selected
        />
      </View>
    </PageContainer>
  );
}

type CompanionChatProps = {
  initialText?: string;
  letterContext?: string;
  mode?: string;
  onBack: () => void;
  petEmoji: string;
  petName: string;
  seedConversationId?: number | null;
};

export function CompanionChat({
  initialText = "",
  letterContext = "",
  mode = "free_chat",
  onBack,
  petEmoji,
  petName,
  seedConversationId = null,
}: CompanionChatProps) {
  const theme = useTheme();
  const { isCompact } = useResponsive();
  const [input, setInput] = useState(initialText);
  const [messages, setMessages] = useState(
    letterContext
      ? [{ role: "agent", text: letterContext }]   // 回信场景：先把这封信作为它刚说的话显示
      : [{ role: "agent", text: "嗯，我在。今天有什么想聊的吗？" }]
  );
  // 回信场景：首条用户消息需把这封信作为上下文带给后端（只带一次）
  const letterRepliedRef = useRef(false);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const convIdRef = useRef<number | null>(seedConversationId);
  const voice = useVoiceInput((text) =>
    setInput((previous) => (previous ? `${previous} ${text}` : text)),
  );

  const send = async () => {
    if (!input.trim() || thinking) return;
    const text = input.trim();
    setInput("");
    setMessages((current) => [...current, { role: "user", text }]);
    setThinking(true);
    // 回信场景：首条用户消息把这封信作为上下文带给后端，让宠物基于信回应（信只带一次、不显示在气泡里）。
    let sendText = text;
    if (letterContext && !letterRepliedRef.current) {
      letterRepliedRef.current = true;
      sendText = `（我在回复你刚写给我的信：「${letterContext}」）\n${text}`;
    }
    // 首个 token 到达前只显示"•••"占位泡；到达后再追加 assistant 泡逐 token 填充，
    // 避免出现「空泡 + 思考泡」两个气泡（DAY-201）。
    let started = false;

    try {
      if (convIdRef.current == null) {
        let petId: number | null = null;
        try {
          const pet = await getActivePet();
          petId = pet?.id ?? null;
        } catch {
          // 无主桌宠也能聊。
        }
        const conversation = await createConversation(petId, mode);
        convIdRef.current = conversation.id;
      }
      const conversationId = convIdRef.current;
      if (conversationId == null) throw new Error("会话创建失败");

      await streamChatReply(conversationId, sendText, (delta) => {
        setThinking(false);
        setMessages((current) => {
          if (!started) {
            started = true;
            return [...current, { role: "agent", text: delta }];
          }
          const next = [...current];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, text: last.text + delta };
          return next;
        });
      });
    } catch (error: any) {
      const message = error?.message || "刚刚走神了，能再说一次吗？";
      setMessages((current) => {
        if (!started) return [...current, { role: "agent", text: message }];
        const next = [...current];
        next[next.length - 1] = { role: "agent", text: message };
        return next;
      });
    } finally {
      setThinking(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 880,
          alignSelf: "center",
          flex: 1,
          paddingHorizontal: isCompact ? theme.spacing[4] : theme.spacing[8],
          paddingTop: isCompact ? theme.spacing[3] : theme.spacing[6],
        }}
      >
        <View
          style={{
            minHeight: 56,
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing[3],
            paddingBottom: theme.spacing[3],
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.divider,
          }}
        >
          <IconButton
            accessibilityLabel="返回"
            icon={<ChevronLeft color={theme.colors.textSecondary} size={22} />}
            onPress={onBack}
          />
          <CompanionAvatar emoji={petEmoji} />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                theme.typography.textStyles.bodyStrong,
                { color: theme.colors.textPrimary },
              ]}
            >
              {petName}
            </Text>
            <StatusDot label="在听" />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingBottom: theme.spacing[4],
            paddingTop: theme.spacing[6],
          }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
          ref={scrollRef}
          style={{ flex: 1 }}
        >
          {messages.map((message, index) => (
            <MessageBubble
              emoji={petEmoji}
              key={`${message.role}-${index}`}
              text={message.text}
              variant={message.role === "agent" ? "agent" : "user"}
            />
          ))}
          {thinking ? (
            <MessageBubble
              emoji={petEmoji}
              pending
              text="•••"
              variant="agent"
            />
          ) : null}
        </ScrollView>

        <View
          style={{
            marginBottom: Platform.OS === "ios" ? theme.spacing[5] : theme.spacing[4],
            minHeight: 52,
            maxHeight: 120,
            flexDirection: "row",
            alignItems: "flex-end",
            gap: theme.spacing[2],
            paddingLeft: theme.spacing[4],
            paddingRight: theme.spacing[1],
            paddingVertical: theme.spacing[1],
            borderRadius: theme.radii.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
            ...theme.shadows.soft,
          }}
        >
          <TextInput
            accessibilityLabel="聊天内容"
            multiline
            onChangeText={setInput}
            onSubmitEditing={send}
            placeholder="说点什么…"
            placeholderTextColor={theme.colors.placeholder}
            selectionColor={theme.colors.accent}
            style={[
              theme.typography.textStyles.body,
              {
                flex: 1,
                maxHeight: 104,
                minHeight: 44,
                paddingVertical: 10,
                color: theme.colors.textPrimary,
                outlineWidth: 0,
              } as any,
            ]}
            value={input}
          />
          {input.trim() ? (
            <IconButton
              accessibilityLabel="发送"
              disabled={thinking}
              icon={<Send color={theme.colors.accent} size={18} />}
              onPress={send}
              selected
            />
          ) : (
            <IconButton
              accessibilityLabel={voice.isRecording ? "停止录音" : "语音输入"}
              disabled={voice.transcribing}
              selected={voice.isRecording}
              icon={
                voice.transcribing ? (
                  <ActivityIndicator color={theme.colors.accent} size="small" />
                ) : voice.isRecording ? (
                  <Square
                    color={theme.colors.accent}
                    fill={theme.colors.accent}
                    size={15}
                  />
                ) : (
                  <Mic color={theme.colors.accent} size={18} />
                )
              }
              onPress={voice.isRecording ? voice.stop : voice.start}
            />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

type ModeSheetProps = {
  onChat: (mode: string) => void;
  onClose: () => void;
  onSleepDump: () => void;
  visible: boolean;
};

const modes = [
  {
    description: "随便聊点什么，没有主题",
    icon: "☁️",
    label: "自由聊聊",
    mode: "free_chat",
  },
  {
    description: "把今天的念头一次全说出来",
    icon: "🌊",
    label: "一股脑倒出来",
    mode: "_dump",
  },
  {
    description: "有什么在心里反复出现",
    icon: "🪨",
    label: "说件放不下的事",
    mode: "hard_thing",
  },
  {
    description: "回到某段记忆里看看",
    icon: "📽️",
    label: "回看一个片段",
    mode: "review_fragment",
  },
];

export function ModeSheet({
  onChat,
  onClose,
  onSleepDump,
  visible,
}: ModeSheetProps) {
  const theme = useTheme();

  return (
    <ResponsiveOverlay onClose={onClose} title="想怎么聊？" visible={visible}>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing[1],
          padding: theme.spacing[4],
        }}
      >
        {modes.map((mode) => (
          <ListItem
            description={mode.description}
            key={mode.mode}
            leading={
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radii.control,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.colors.accentSoft,
                }}
              >
                <Text style={{ fontSize: 22 }}>{mode.icon}</Text>
              </View>
            }
            onPress={() =>
              mode.mode === "_dump" ? onSleepDump() : onChat(mode.mode)
            }
            title={mode.label}
            trailing={
              <ChevronRight color={theme.colors.textMuted} size={18} />
            }
          />
        ))}
      </ScrollView>
    </ResponsiveOverlay>
  );
}
