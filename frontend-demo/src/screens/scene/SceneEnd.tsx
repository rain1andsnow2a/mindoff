/**
 * 场景结算：LLM 摘要（key_quote/comment/action_hint）+ 珍藏/重演/离开。
 * 摘要失败时回退到场景原文（最后一条对白 → 用户最后一次选择）。
 */
import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, PageContainer, PageHeader, useTheme } from "../../design-system";
import { getScene, getSceneSummary, settleScene } from "../../api";
import { SceneDetail } from "./shared";

/** 场景结算屏。 */
export function SceneEnd({ sceneId, onBack, onReplay }: { sceneId?: number | null; onBack: () => void; onReplay: () => void }) {
  const theme = useTheme();
  const [saved, setSaved] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState("");
  const [keyQuote, setKeyQuote] = useState("");
  const [companionComment, setCompanionComment] = useState("");
  const [actionHint, setActionHint] = useState("带着这份感受，继续下一步");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sceneId) { setLoading(false); return; }
    // 兜底链：summary.key_quote → 最后一条对白 → 用户最后一次选择；都没有则留空（隐藏区块）
    const pickFallback = (s: SceneDetail | null): string => {
      if (!s) return "";
      const lastBeat = [...(s.beats || [])].reverse().find(b => (b?.text ?? "").trim());
      if (lastBeat) return lastBeat.text.trim();
      const lastChoice = [...(s.history || [])].reverse().find(h => (h?.choice ?? "").trim());
      return lastChoice ? String(lastChoice.choice).trim() : "";
    };
    getSceneSummary(sceneId)
      .then(async (res: any) => {
        const kq = (res?.key_quote ?? "").trim();
        if (kq && kq !== "……") {
          setKeyQuote(kq);
        } else {
          const s = await getScene(sceneId).catch(() => null);
          setKeyQuote(pickFallback(s));
        }
        if (res?.companion_comment) setCompanionComment(res.companion_comment);
        if (res?.action_hint) setActionHint(res.action_hint);
      })
      .catch(async () => {
        // LLM 失败时回退到场景原文
        const s = await getScene(sceneId).catch(() => null);
        setKeyQuote(pickFallback(s));
        setCompanionComment("这里没有答案，也没有正确的说法。你表达了，这就够了。");
      })
      .finally(() => setLoading(false));
  }, [sceneId]);

  const doSettle = async (keep: boolean) => {
    if (!sceneId || settling) return;
    setSettling(true);
    try {
      await settleScene(sceneId, {
        card_text: keyQuote || null,
        insight_text: keyQuote || null,
        action_text: actionHint,
        keep,
      });
      setSaved(keep);
      setError("");
    } catch (err) {
      setError((err as any)?.message ?? "结算失败");
    }
    setSettling(false);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <PageContainer maxWidth={760}>
        <PageHeader
          eyebrow="场景回顾"
          title="这一次，你说出了"
          description={loading ? "正在回顾你的表达…" : keyQuote ? `“${keyQuote}”` : undefined}
        />
        <View style={{ gap: theme.spacing[4] }}>
          {!!keyQuote && (
            <Card emphasized>
              <Text style={[theme.typography.textStyles.sectionTitle, { color: theme.colors.textPrimary }]}>{keyQuote}</Text>
            </Card>
          )}

          {!!companionComment && (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 13 }}>🌿</Text>
                <Text style={[theme.typography.textStyles.label, { color: theme.colors.textMuted }]}>小栖</Text>
              </View>
              <Text style={[theme.typography.textStyles.body, { color: theme.colors.textSecondary }]}>
                {companionComment}
              </Text>
            </Card>
          )}

          {!!error && (
            <Text style={[theme.typography.textStyles.caption, { textAlign: "center", color: theme.colors.error }]}>{error}</Text>
          )}

          <View style={{ gap: theme.spacing[2], paddingTop: theme.spacing[4] }}>
            {!saved ? (
              <Button fullWidth onPress={() => doSettle(true)} disabled={settling || loading}>
                {settling ? "正在保存…" : "把这句话留下"}
              </Button>
            ) : (
              <Card style={{ paddingVertical: theme.spacing[3], alignItems: "center", backgroundColor: theme.colors.accentSoft }}>
                <Text style={[theme.typography.textStyles.bodyStrong, { color: theme.colors.textPrimary }]}>已放入长久珍藏 ✦</Text>
              </Card>
            )}
            <Button fullWidth variant="secondary" onPress={onReplay}>再试一次</Button>
            <Button fullWidth variant="ghost" onPress={() => { doSettle(false).then(() => onBack()); }}>直接离开</Button>
            <Text style={[theme.typography.textStyles.label, { textAlign: "center", marginTop: theme.spacing[1], color: theme.colors.textMuted }]}>
              离开后，场景中的人物设定和对话将被清除。
            </Text>
          </View>
        </View>
      </PageContainer>
    </ScrollView>
  );
}
