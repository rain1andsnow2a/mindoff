/**
 * 往日手帐：历史会话按日分组列表，点开某段进入续聊。
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";

import {
  CompanionAvatar,
  IconButton,
  useResponsive,
  useTheme,
} from "../../design-system";
import { listConversations } from "../../api";
import { ConversationSummary, groupByDay, modeLabel, shortTitle, timeLabel } from "./shared";

type CompanionJournalProps = {
  onBack: () => void;
  onOpenConversation: (conversationId: number) => void;
  petEmoji: string;
};

/** 往日手帐页：历史会话列表。 */
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
