/**
 * 睡前倾倒、处理中与整理回执。
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { ChevronLeft, Clock, Mic, Square } from "lucide-react-native";

import { streamBrainDump, type SSEEvent } from "../api";
import {
  Button,
  Card,
  CreamRipple,
  IconButton,
  PageContainer,
  useReducedMotion,
  useResponsive,
  useTheme,
} from "../design-system";
import { useVoiceInput } from "../useVoiceInput";

type SleepDumpProps = {
  initialText?: string;
  onBack: () => void;
  onProcess: (text: string) => void;
};

export function SleepDump({
  initialText = "",
  onBack,
  onProcess,
}: SleepDumpProps) {
  const theme = useTheme();
  const { isCompact } = useResponsive();
  const [text, setText] = useState(initialText);
  const voice = useVoiceInput((transcript) =>
    setText((previous) =>
      previous ? `${previous}\n${transcript}` : transcript,
    ),
  );

  return (
    <PageContainer
      maxWidth={880}
      style={{
        flex: 1,
        paddingBottom: isCompact ? theme.spacing[4] : theme.spacing[8],
        paddingTop: isCompact ? theme.spacing[3] : theme.spacing[6],
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          marginBottom: theme.spacing[5],
        }}
      >
        <IconButton
          accessibilityLabel="返回"
          icon={<ChevronLeft color={theme.colors.textSecondary} size={22} />}
          onPress={onBack}
        />
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            style={[
              theme.typography.textStyles.pageTitle,
              { color: theme.colors.textPrimary },
            ]}
          >
            今晚的念头
          </Text>
        </View>
      </View>

      <Text
        style={[
          theme.typography.textStyles.body,
          {
            maxWidth: 680,
            marginBottom: theme.spacing[4],
            color: theme.colors.textSecondary,
          },
        ]}
      >
        计划、担心、灵感、情绪——什么都可以，混在一起说也没关系
      </Text>

      <Card
        style={{
          flex: 1,
          minHeight: isCompact ? 280 : 360,
          padding: 0,
          overflow: "hidden",
        }}
      >
        <TextInput
          accessibilityLabel="今晚想倾倒的念头"
          multiline
          onChangeText={setText}
          placeholder={"今天想说的都在这里…\n\n整理是我的事，你只管说。"}
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accent}
          style={[
            theme.typography.textStyles.body,
            {
              flex: 1,
              minHeight: isCompact ? 280 : 360,
              padding: theme.spacing[5],
              color: theme.colors.textPrimary,
              textAlignVertical: "top",
              outlineWidth: 0,
            } as any,
          ]}
          value={text}
        />
      </Card>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[3],
          marginTop: theme.spacing[4],
        }}
      >
        <Pressable
          accessibilityLabel="按住说话，松开结束"
          accessibilityRole="button"
          accessibilityState={{ busy: voice.transcribing }}
          disabled={voice.transcribing}
          onPressIn={voice.start}
          onPressOut={voice.stop}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: theme.radii.control,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: voice.isRecording
              ? theme.colors.accentSoft
              : pressed
                ? theme.colors.surfacePressed
                : "transparent",
            opacity: voice.transcribing ? 0.5 : 1,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          {
            voice.isRecording ? (
              <Square
                color={theme.colors.accent}
                fill={theme.colors.accent}
                size={17}
              />
            ) : (
              <Mic
                color={
                  voice.transcribing
                    ? theme.colors.disabledText
                    : theme.colors.textSecondary
                }
                size={20}
              />
            )
          }
        </Pressable>
        <View style={{ flex: 1 }}>
          <Button fullWidth onPress={() => onProcess(text)} size="large">
            说完了，帮我整理
          </Button>
        </View>
      </View>
    </PageContainer>
  );
}

export interface DumpReceipt {
  error?: string;
  fallback?: boolean;
  items: { content: string; kind: string; memory_id: number }[];
  kind_counts: Record<string, number>;
  total: number;
}

type FlyingChipProps = {
  index: number;
  text: string;
  total: number;
};

function FlyingChip({ index, text, total }: FlyingChipProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const animation = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      animation.setValue(1);
      return;
    }
    Animated.timing(animation, {
      duration: theme.motion.durations.enter,
      toValue: 1,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [animation, reducedMotion, theme.motion.durations.enter]);

  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const radius = 84 + (index % 3) * 12;
  const translateX = Math.cos(angle) * radius;
  const translateY = Math.sin(angle) * radius;

  return (
    <Animated.View
      style={{
        position: "absolute",
        maxWidth: 180,
        paddingHorizontal: theme.spacing[3],
        paddingVertical: theme.spacing[2],
        borderRadius: theme.radii.pill,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceElevated,
        opacity: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 0.94],
        }),
        transform: [
          {
            translateX: animation.interpolate({
              inputRange: [0, 1],
              outputRange: [translateX, 0],
            }),
          },
          {
            translateY: animation.interpolate({
              inputRange: [0, 1],
              outputRange: [translateY, 0],
            }),
          },
          {
            scale: animation.interpolate({
              inputRange: [0, 1],
              outputRange: [0.88, 1],
            }),
          },
        ],
        ...theme.shadows.soft,
      }}
    >
      <Text
        numberOfLines={1}
        style={[
          theme.typography.textStyles.caption,
          { color: theme.colors.textSecondary },
        ]}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

type ProcessingScreenProps = {
  onDone: (receipt: DumpReceipt | null) => void;
  text: string;
};

export function ProcessingScreen({ onDone, text }: ProcessingScreenProps) {
  const theme = useTheme();
  const [showRipple, setShowRipple] = useState(false);
  const [fragments, setFragments] = useState<string[]>([]);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let receipt: DumpReceipt | null = null;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (doneRef.current || cancelled) return;
      doneRef.current = true;
      setShowRipple(true);
      finishTimer = setTimeout(() => {
        if (cancelled) return;
        setShowRipple(false);
        onDone(receipt);
      }, 600);
    };

    streamBrainDump(text, (event: SSEEvent) => {
      if (cancelled) return;
      if (event.event === "item.classified") {
        const fragment: string =
          event.data?.surface_text || event.data?.content || "";
        if (fragment) {
          setFragments((current) => [
            ...current,
            fragment.length > 10 ? `${fragment.slice(0, 10)}…` : fragment,
          ]);
        }
      } else if (event.event === "receipt") {
        receipt = event.data as DumpReceipt;
      }
    })
      .then(finish)
      .catch(finish);

    return () => {
      cancelled = true;
      if (finishTimer) clearTimeout(finishTimer);
    };
  }, [onDone, text]);

  const shown = fragments.length ? fragments : ["正在整理…"];

  return (
    <PageContainer
      maxWidth={720}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: theme.spacing[8],
      }}
    >
      <CreamRipple active={showRipple} />
      <View
        accessibilityRole="progressbar"
        style={{
          width: 288,
          height: 288,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {shown.map((fragment, index) => (
          <FlyingChip
            index={index}
            key={`${fragment}-${index}`}
            text={fragment}
            total={shown.length}
          />
        ))}
        <View
          style={{
            width: 82,
            height: 82,
            borderRadius: 41,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
            ...theme.shadows.floating,
          }}
        >
          <Text style={{ fontSize: 26 }}>🌶</Text>
        </View>
      </View>
      <Text
        style={[
          theme.typography.textStyles.body,
          {
            marginTop: theme.spacing[6],
            textAlign: "center",
            color: theme.colors.textSecondary,
          },
        ]}
      >
        正在接住你的念头…
      </Text>
    </PageContainer>
  );
}

const KIND_META = [
  { icon: "📮", key: "待办", label: "明天要接住", unit: "件事" },
  { icon: "💡", key: "灵感", label: "值得留下的想法", unit: "条" },
  { icon: "🫧", key: "情绪", label: "被听见的感受", unit: "个" },
  { icon: "🌙", key: "片段", label: "今晚静静收着", unit: "个" },
];

type ReceiptScreenProps = {
  onDone: () => void;
  onView: () => void;
  receipt: DumpReceipt | null;
};

export function ReceiptScreen({
  onDone,
  onView,
  receipt,
}: ReceiptScreenProps) {
  const theme = useTheme();
  const { isCompact, isExpanded } = useResponsive();
  const reducedMotion = useReducedMotion();
  const fade = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      fade.setValue(1);
      return;
    }
    Animated.timing(fade, {
      duration: theme.motion.durations.enter,
      toValue: 1,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [fade, reducedMotion, theme.motion.durations.enter]);

  const counts = receipt?.kind_counts ?? {};
  const total = receipt?.total ?? 0;
  const cards = KIND_META.map((meta) => ({
    ...meta,
    value:
      meta.key === "灵感"
        ? (counts["灵感"] || 0) + (counts["小结"] || 0)
        : counts[meta.key] || 0,
  }));
  const topTodo = receipt?.items?.find((item) => item.kind === "待办");

  return (
    <PageContainer
      maxWidth={1040}
      style={{
        flex: 1,
        paddingBottom: isCompact ? theme.spacing[4] : theme.spacing[8],
        paddingTop: isCompact ? theme.spacing[5] : theme.spacing[8],
      }}
    >
      <Animated.View style={{ marginBottom: theme.spacing[6], opacity: fade }}>
        <Text
          style={[
            theme.typography.textStyles.label,
            { marginBottom: theme.spacing[1], color: theme.colors.textSecondary },
          ]}
        >
          今晚
        </Text>
        <Text
          accessibilityRole="header"
          style={[
            theme.typography.textStyles.pageTitle,
            { color: theme.colors.textPrimary },
          ]}
        >
          已替你接住{"\n"}
          <Text style={{ color: theme.colors.accent }}>{total} 个念头</Text>
        </Text>
      </Animated.View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: theme.spacing[5] }}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.spacing[3],
            marginBottom: theme.spacing[4],
          }}
        >
          {cards.map((item) => (
            <Card
              key={item.key}
              style={{
                width: isExpanded ? "23%" : "47%",
                flexGrow: 1,
                minWidth: isExpanded ? 180 : 140,
              }}
            >
              <Text style={{ fontSize: 23, marginBottom: theme.spacing[3] }}>
                {item.icon}
              </Text>
              <Text
                style={[
                  theme.typography.textStyles.sectionTitle,
                  {
                    marginBottom: theme.spacing[1],
                    color: theme.colors.textPrimary,
                  },
                ]}
              >
                {item.value} {item.unit}
              </Text>
              <Text
                style={[
                  theme.typography.textStyles.caption,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {item.label}
              </Text>
            </Card>
          ))}
        </View>

        {topTodo ? (
          <Card emphasized>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing[2],
                marginBottom: theme.spacing[2],
              }}
            >
              <Clock color={theme.colors.accent} size={16} />
              <Text
                style={[
                  theme.typography.textStyles.label,
                  { color: theme.colors.accent },
                ]}
              >
                明天最值得关注
              </Text>
            </View>
            <Text
              style={[
                theme.typography.textStyles.bodyStrong,
                { color: theme.colors.textPrimary },
              ]}
            >
              {topTodo.content}
            </Text>
          </Card>
        ) : null}

        {receipt?.fallback ? (
          <Text
            style={[
              theme.typography.textStyles.caption,
              { marginTop: theme.spacing[3], color: theme.colors.textSecondary },
            ]}
          >
            今晚先替你收着了，明天再慢慢看。
          </Text>
        ) : null}
      </ScrollView>

      <View
        style={{
          width: "100%",
          maxWidth: 680,
          alignSelf: "center",
          flexDirection: isCompact ? "column" : "row",
          gap: theme.spacing[3],
          paddingTop: theme.spacing[3],
        }}
      >
        <View style={{ flex: 1 }}>
          <Button fullWidth onPress={onDone} size="large">
            今晚到这里
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button fullWidth onPress={onView} size="large" variant="secondary">
            看看我替你放在哪里
          </Button>
        </View>
      </View>
    </PageContainer>
  );
}
