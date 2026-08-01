import React, { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { ArrowLeft, Pencil, ShieldCheck, Trash2 } from "lucide-react-native";

import {
  Button, Card, Chip, EmptyState, IconButton, LoadingState, PageContainer,
  TextArea, useResponsive, useTheme,
} from "../design-system";
import {
  correctUserProfile, deleteUserProfile, getUserProfile, updatePreferences,
  type UserProfileItem,
} from "../api";

const SOURCE_LABELS: Record<string, string> = {
  conversation: "文字聊天", voice_call: "语音聊天", brain_dump: "一股脑倒", scene: "片场",
};

export function UserProfileScreen({ onBack, onToast }: { onBack: () => void; onToast: (text: string) => void }) {
  const theme = useTheme();
  const { isExpanded } = useResponsive();
  const [items, setItems] = useState<UserProfileItem[]>([]);
  const [learning, setLearning] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<UserProfileItem | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    getUserProfile()
      .then((data) => { if (alive) { setItems(data.items); setLearning(data.learning_enabled); } })
      .catch(() => { if (alive) onToast("画像暂时没有加载出来"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const toggleLearning = async () => {
    const next = !learning;
    setLearning(next);
    try {
      await updatePreferences({ profile_learning_enabled: next });
      onToast(next ? "已继续学习新的理解" : "已暂停学习，已有理解不会删除");
    } catch (error: any) {
      setLearning(!next);
      onToast(error?.message || "设置没有保存成功");
    }
  };

  const saveCorrection = async () => {
    if (!editing || !draft.trim()) return;
    setSaving(true);
    try {
      const updated = await correctUserProfile(editing.id, draft.trim());
      setItems((current) => current.map((item) => item.id === editing.id ? updated : item));
      setEditing(null);
      onToast("已按你的说法改正");
    } catch (error: any) {
      onToast(error?.message || "暂时没能保存纠正");
    } finally {
      setSaving(false);
    }
  };

  const remove = (item: UserProfileItem) => Alert.alert(
    "删除这条理解？", "删除后，喵灵不会再使用这条理解。",
    [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: async () => {
        try {
          await deleteUserProfile(item.id);
          setItems((current) => current.filter((row) => row.id !== item.id));
          onToast("这条理解已删除");
        } catch (error: any) { onToast(error?.message || "暂时没能删除"); }
      } },
    ],
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }}>
        <PageContainer maxWidth={1040}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.spacing[3], marginBottom: theme.spacing[6] }}>
            <IconButton accessibilityLabel="返回" onPress={onBack} icon={
              <ArrowLeft size={20} color={theme.colors.textSecondary} />
            } />
            <View style={{ flex: 1, minWidth: 0, paddingTop: theme.spacing[1] }}>
              <Text style={[theme.typography.textStyles.label, { color: theme.colors.accent }]}>可见、可改、可删除</Text>
              <Text accessibilityRole="header" style={[theme.typography.textStyles.pageTitle, { marginTop: theme.spacing[2], color: theme.colors.textPrimary }]}>喵灵对我的理解</Text>
              <Text style={[theme.typography.textStyles.body, { marginTop: theme.spacing[3], color: theme.colors.textSecondary }]}>这些是从多次交流中慢慢形成的理解，可能不完整，也可能会变。你始终说了算。</Text>
            </View>
          </View>

          <Card variant="emphasized" style={{ marginBottom: theme.spacing[6] }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[4] }}>
              <ShieldCheck size={22} color={theme.colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.textStyles.bodyStrong, { color: theme.colors.textPrimary }]}>继续从新对话中学习</Text>
                <Text style={[theme.typography.textStyles.caption, { marginTop: 3, color: theme.colors.textSecondary }]}>暂停后不再新增观察；已有内容仍可查看、改正或删除。</Text>
              </View>
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: learning }} onPress={toggleLearning}
                style={{ width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: "center", backgroundColor: learning ? theme.colors.accentSurface : theme.colors.disabledSurface }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.surface,
                  alignSelf: learning ? "flex-end" : "flex-start", ...theme.shadows.soft }} />
              </Pressable>
            </View>
          </Card>

          {loading ? <LoadingState label="正在整理这些理解…" /> : items.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={26} color={theme.colors.textMuted} />} title="还没有形成稳定理解"
              description="多聊几次后，重复出现且证据较充分的内容会出现在这里。" />
          ) : (
            <View style={{ flexDirection: isExpanded ? "row" : "column", flexWrap: "wrap", gap: theme.spacing[4] }}>
              {items.map((item) => (
                <Card key={item.id} style={{ width: isExpanded ? "48%" : "100%", gap: theme.spacing[4] }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
                    <Chip>{item.category}</Chip><Chip>{item.sensitivity}</Chip>
                  </View>
                  <Text style={[theme.typography.textStyles.body, { color: theme.colors.textPrimary }]}>{item.statement}</Text>
                  <Text style={[theme.typography.textStyles.caption, { color: theme.colors.textSecondary }]}>
                    来自最近 {item.evidence_count} 次相关表达
                    {item.evidence_sources.length ? ` · ${item.evidence_sources.map((x) => SOURCE_LABELS[x] ?? x).join("、")}` : ""}
                  </Text>
                  <View style={{ flexDirection: "row", gap: theme.spacing[2], justifyContent: "flex-end" }}>
                    <Button variant="ghost" size="compact" onPress={() => { setEditing(item); setDraft(item.statement); }}><Pencil size={14} /> 这不太对</Button>
                    <Button variant="ghost" size="compact" onPress={() => remove(item)}><Trash2 size={14} /> 删除</Button>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </PageContainer>
      </ScrollView>

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable onPress={() => setEditing(null)} style={{ flex: 1, backgroundColor: "rgba(31,25,20,0.38)", justifyContent: "center", padding: theme.spacing[5] }}>
          <Pressable onPress={() => undefined} style={{ width: "100%", maxWidth: 560, alignSelf: "center" }}>
            <Card style={{ gap: theme.spacing[5] }}>
              <View>
                <Text style={[theme.typography.textStyles.sectionTitle, { color: theme.colors.textPrimary }]}>告诉我更准确的说法</Text>
                <Text style={[theme.typography.textStyles.caption, { marginTop: 5, color: theme.colors.textSecondary }]}>你的纠正优先级最高，后续自动学习不会覆盖它。</Text>
              </View>
              <TextArea value={draft} onChangeText={setDraft} maxLength={300} autoFocus />
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: theme.spacing[3] }}>
                <Button variant="ghost" onPress={() => setEditing(null)}>取消</Button>
                <Button loading={saving} disabled={!draft.trim()} onPress={saveCorrection}>保存纠正</Button>
              </View>
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
