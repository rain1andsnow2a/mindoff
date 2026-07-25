/**
 * 陪伴首页、聊天页、往日手帐与模式选择。
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
  BookOpen,
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
  GlassSurface,
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
  getConversation,
  listConversations,
  streamChatReply,
} from "../api";
import { HomePetArtwork } from "../components/HomePetArtwork";
import { useVoiceInput } from "../useVoiceInput";

// ─── 历史会话公共 ────────────────────────────────────────────────────────────

type ConversationSummary = {
  id: number;
  mode: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

const MODE_LABELS: Record<string, string> = {
  free_chat: "自由聊聊",
  brain_dump: "一股脑倒",
  hard_thing: "放不下的事",
  review_fragment: "回看片段",
};

const WEEKDAYS_CN = "日一二三四五六";

function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? "自由聊聊";
}

/** 卡片/气泡上的短标题：后端默认取首条用户消息前 40 字，兜底用模式名。 */
function shortTitle(conv: ConversationSummary): string {
  const raw = conv.title?.trim() || modeLabel(conv.mode);
  return raw.length > 18 ? `${raw.slice(0, 18)}…` : raw;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 · 周${WEEKDAYS_CN[d.getDay()]}`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type DayGroup = { label: string; items: ConversationSummary[] };

/** 列表本身按时间倒序，相邻同日合并成一组。 */
function groupByDay(list: ConversationSummary[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const conv of list) {
    const label = dayLabel(conv.updated_at || conv.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(conv);
    else groups.push({ label, items: [conv] });
  }
  return groups;
}

// ─── 陪伴首页 ────────────────────────────────────────────────────────────────

type CompanionIdleProps = {
  night: boolean;
  onChat: () => void;
  onModeSheet: () => void;
  onNightToggle: () => void;
  onOpenJournal: () => void;
  onResumeChat: (conversationId: number) => void;
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
  onOpenJournal,
  onResumeChat,
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
  const [recentConv, setRecentConv] = useState<ConversationSummary | null>(null);
  const [convCount, setConvCount] = useState(0);
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
    // 历史会话：决定「往日」胶囊与续聊气泡（列表按时间倒序，首条即最近一段）。
    listConversations()
      .then((list) => {
        if (!Array.isArray(list) || list.length === 0) return;
        setConvCount(list.length);
        setRecentConv(list[0]);
        // 若邀请气泡已自动收起，续聊气泡要重新亮出来（它是功能入口）。
        setBubbleVisible(true);
        fade.setValue(1);
      })
      .catch(() => {});
  }, [fade]);

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

    // 有可续聊的会话时气泡常驻（承载「接着聊」入口）；否则保持几秒后自动收起的装饰行为。
    if (recentConv) return;
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
  }, [fade, recentConv, reducedMotion, theme.motion.durations.enter, theme.motion.durations.exit]);

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
          {convCount > 0 ? (
            <Pressable
              accessibilityLabel={`查看往日，共 ${convCount} 段聊天`}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onOpenJournal}
              style={({ pressed }) => ({
                alignSelf: "flex-start",
                marginTop: theme.spacing[2],
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing[1],
                paddingHorizontal: theme.spacing[3],
                paddingVertical: theme.spacing[1] + 2,
                borderRadius: theme.radii.pill,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceElevated,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
                ...theme.shadows.soft,
              })}
            >
              <BookOpen size={14} color={theme.colors.accent} />
              <Text
                style={[
                  theme.typography.textStyles.caption,
                  { color: theme.colors.accent, fontWeight: "600" },
                ]}
              >
                往日{" "}
                <Text style={{ color: theme.colors.textMuted, fontWeight: "400" }}>
                  {convCount}
                </Text>
              </Text>
            </Pressable>
          ) : null}
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
            {recentConv ? (
              <Pressable
                accessibilityLabel={`接着上次的聊天：${shortTitle(recentConv)}`}
                accessibilityRole="button"
                onPress={() => onResumeChat(recentConv.id)}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              >
                <Text
                  style={[
                    theme.typography.textStyles.body,
                    { color: theme.colors.textPrimary },
                  ]}
                >
                  {`上次你说「${shortTitle(recentConv)}」`}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 2,
                    marginTop: theme.spacing[1],
                  }}
                >
                  <Text
                    style={[
                      theme.typography.textStyles.caption,
                      { color: theme.colors.accent, fontWeight: "600" },
                    ]}
                  >
                    接着聊
                  </Text>
                  <ChevronRight size={12} color={theme.colors.accent} />
                </View>
              </Pressable>
            ) : (
              <Text
                style={[
                  theme.typography.textStyles.body,
                  { color: theme.colors.textPrimary },
                ]}
              >
                {bubbleText}
              </Text>
            )}
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
        <GlassSurface style={{ flex: 1, borderRadius: theme.radii.pill }}>
          <View
            style={{
              minHeight: 54,
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: theme.spacing[5],
              paddingRight: theme.spacing[1],
              borderRadius: theme.radii.pill,
              borderWidth: 1,
              borderColor: theme.colors.border,
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
        </GlassSurface>
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

// ─── 往日手帐 ────────────────────────────────────────────────────────────────

type CompanionJournalProps = {
  onBack: () => void;
  onOpenConversation: (conversationId: number) => void;
  petEmoji: string;
};

export function CompanionJournal({
  onBack,
  onOpenConversation,
  petEmoji,
}: CompanionJournalProps) {
  const theme = useTheme();
  const { isCompact } = useResponsive();
  const [convs, setConvs] = useState<ConversationSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    listConversations()
      .then((list) => {
        if (alive) setConvs(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const groups = convs ? groupByDay(convs) : [];

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          width: "100%",
          maxWidth: 760,
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
              往日
            </Text>
            <Text
              style={[
                theme.typography.textStyles.caption,
                { color: theme.colors.textMuted },
              ]}
            >
              {convs ? `你们一起度过的 ${convs.length} 段时光` : "一起度过的时光"}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: theme.spacing[6] }}
          style={{ flex: 1 }}
        >
          {convs === null && !failed ? (
            <ActivityIndicator
              color={theme.colors.accent}
              style={{ marginTop: theme.spacing[10] }}
            />
          ) : null}
          {failed ? (
            <Text
              style={[
                theme.typography.textStyles.body,
                {
                  color: theme.colors.textSecondary,
                  marginTop: theme.spacing[10],
                  textAlign: "center",
                },
              ]}
            >
              没翻出来，待会儿再试试。
            </Text>
          ) : null}
          {convs !== null && convs.length === 0 && !failed ? (
            <Text
              style={[
                theme.typography.textStyles.body,
                {
                  color: theme.colors.textSecondary,
                  lineHeight: 26,
                  marginTop: theme.spacing[10],
                  textAlign: "center",
                },
              ]}
            >
              还没有往日。{"\n"}和它聊过第一次之后，这里会留下你们一起度过的时光。
            </Text>
          ) : null}

          {groups.map((group) => (
            <View key={group.label}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.spacing[2],
                  marginTop: theme.spacing[4],
                  marginBottom: theme.spacing[2],
                }}
              >
                <Text
                  style={[
                    theme.typography.textStyles.caption,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {group.label}
                </Text>
                <View
                  style={{ flex: 1, height: 1, backgroundColor: theme.colors.divider }}
                />
              </View>
              {group.items.map((conv) => (
                <Pressable
                  accessibilityLabel={`打开聊天：${shortTitle(conv)}`}
                  accessibilityRole="button"
                  key={conv.id}
                  onPress={() => onOpenConversation(conv.id)}
                  style={({ pressed }) => ({
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radii.card,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    marginBottom: theme.spacing[2],
                    overflow: "hidden",
                    paddingLeft: theme.spacing[5],
                    paddingRight: theme.spacing[4],
                    paddingVertical: theme.spacing[3],
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                    ...theme.shadows.soft,
                  })}
                >
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      backgroundColor:
                        conv.mode === "free_chat"
                          ? theme.colors.accentSurface
                          : theme.colors.support,
                    }}
                  />
                  <Text
                    style={[
                      theme.typography.textStyles.bodyStrong,
                      { color: theme.colors.textPrimary },
                    ]}
                  >
                    {shortTitle(conv)}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing[2],
                      marginTop: theme.spacing[2],
                    }}
                  >
                    <Text
                      style={[
                        theme.typography.textStyles.label,
                        {
                          color: theme.colors.accent,
                          backgroundColor: theme.colors.accentSoft,
                          borderRadius: theme.radii.pill,
                          overflow: "hidden",
                          paddingHorizontal: theme.spacing[2],
                          paddingVertical: 1,
                        },
                      ]}
                    >
                      {modeLabel(conv.mode)}
                    </Text>
                    <Text
                      style={[
                        theme.typography.textStyles.caption,
                        { color: theme.colors.textMuted },
                      ]}
                    >
                      {timeLabel(conv.updated_at || conv.created_at)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── 聊天页 ──────────────────────────────────────────────────────────────────

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
    seedConversationId != null
      ? ([] as { role: string; text: string }[])   // 往日会话：先加载历史，见下方 effect
      : letterContext
        ? [{ role: "agent", text: letterContext }]   // 回信场景：先把这封信作为它刚说的话显示
        : [{ role: "agent", text: "嗯，我在。今天有什么想聊的吗？" }]
  );
  const [historyLoading, setHistoryLoading] = useState(seedConversationId != null);
  // 回信场景：首条用户消息需把这封信作为上下文带给后端（只带一次）
  const letterRepliedRef = useRef(false);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const convIdRef = useRef<number | null>(seedConversationId);
  const voice = useVoiceInput((text) =>
    setInput((previous) => (previous ? `${previous} ${text}` : text)),
  );

  // 往日会话：进入时用 getConversation 把历史消息铺满，之后在同一会话里继续聊。
  useEffect(() => {
    if (seedConversationId == null) return;
    let alive = true;
    getConversation(seedConversationId)
      .then((detail) => {
        if (!alive) return;
        const history = (detail?.messages ?? []).map((m: any) => ({
          role: m.role === "user" ? "user" : "agent",
          text: m.content ?? "",
        }));
        setMessages(
          history.length
            ? history
            : [{ role: "agent", text: "嗯，我在。今天有什么想聊的吗？" }]
        );
      })
      .catch(() => {
        if (!alive) return;
        setMessages([{ role: "agent", text: "刚刚走神了，能再说一次吗？" }]);
      })
      .finally(() => {
        if (alive) setHistoryLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [seedConversationId]);

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
          {historyLoading ? (
            <ActivityIndicator
              color={theme.colors.accent}
              style={{ marginTop: theme.spacing[10] }}
            />
          ) : null}
          {seedConversationId != null && !historyLoading && messages.length > 0 ? (
            <Text
              style={[
                theme.typography.textStyles.caption,
                {
                  color: theme.colors.textMuted,
                  marginBottom: theme.spacing[4],
                  textAlign: "center",
                },
              ]}
            >
              —— 往日的聊天 ——
            </Text>
          ) : null}
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

        <GlassSurface style={{
          marginBottom: Platform.OS === "ios" ? theme.spacing[5] : theme.spacing[4],
          borderRadius: theme.radii.card,
        }}>
          <View
            style={{
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
        </GlassSurface>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── 模式选择 ────────────────────────────────────────────────────────────────

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
