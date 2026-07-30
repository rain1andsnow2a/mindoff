/**
 * 长久珍藏：单件卡片 + 详情浮层 + 筛选浮层 + 双列册子。
 */
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Film, Mail, MapPin, Music, Play, SlidersHorizontal } from "lucide-react-native";
import { GrainTexture, ResponsiveOverlay, paperColors } from "../../design-system";
import { Keepsake } from "./shared";

const TYPE_META: Record<Keepsake["type"], { label: string; accentText: string }> = {
  letter: { label: "桌宠来信", accentText: "#9C691D" },
  insight: { label: "今日洞察", accentText: "#826E50" },
  scene: { label: "片场记录", accentText: "#A26458" },
  music: { label: "音乐", accentText: "#75679D" },
  quote: { label: "一句话", accentText: "#70656B" },
  moment: { label: "时刻", accentText: "#70656B" },
};

/** 珍藏册中的单件卡片（音乐类走媒体样式，其余走信笺样式）。 */
function KeepsakeArtifact({ item, onOpen }: { item: Keepsake; onOpen: () => void }) {
  const meta = TYPE_META[item.type];
  const isMedia = item.type === "music";
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [{ marginBottom: 12, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <View style={{
        borderRadius: 24, overflow: "hidden",
        backgroundColor: "rgba(255,252,245,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.52)",
      }}>
        <GrainTexture />
        {isMedia ? (
          <View style={{ padding: 13 }}>
            <View style={{
              width: "100%", aspectRatio: 1, borderRadius: 14, marginBottom: 10,
              alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(233,228,244,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
            }}>
              <Music size={22} color="#75679D" />
            </View>
            <Text style={{ fontSize: 11, letterSpacing: 1, fontWeight: "500", color: meta.accentText, marginBottom: 6 }}>{meta.label}</Text>
            <Text style={{ fontSize: 14, fontWeight: "500", marginBottom: 4, color: paperColors.ink }} numberOfLines={1}>{item.title}</Text>
            {!!item.excerpt && <Text style={{ fontSize: 12, marginBottom: 8, color: paperColors.sub }} numberOfLines={1}>{item.excerpt}</Text>}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: paperColors.meta }}>{item.savedAt}</Text>
              <View style={{
                width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
              }}>
                <Play size={9} color="#75679D" />
              </View>
            </View>
          </View>
        ) : (
          <View style={{ padding: 15 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
              {item.type === "letter" && <Mail size={11} color={meta.accentText} />}
              {item.type === "scene" && <Film size={11} color={meta.accentText} />}
              {item.type === "moment" && <MapPin size={11} color={meta.accentText} />}
              <Text style={{ fontSize: 11, letterSpacing: 1, fontWeight: "500", color: meta.accentText }}>{meta.label}</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: "500", lineHeight: 20, marginBottom: item.excerpt ? 8 : 12, color: paperColors.ink }}>
              {item.title}
            </Text>
            {!!item.excerpt && (
              <Text style={{ fontSize: 12, lineHeight: 17, marginBottom: 12, color: paperColors.sub, fontStyle: item.type === "letter" || item.type === "scene" ? "italic" : "normal" }}>
                {item.excerpt}
              </Text>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 11, color: paperColors.meta }}>{item.source}</Text>
              <Text style={{ fontSize: 11, color: paperColors.meta }}>{item.savedAt}</Text>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** 珍藏详情浮层：正文 + 来源/陪伴 + 类型专属操作 + 移出确认。 */
function KeepsakeDetail({ item, onClose, onRemove }: {
  item: Keepsake; onClose: () => void; onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const meta = TYPE_META[item.type];
  return (
    <ResponsiveOverlay visible onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.65)" }}>
            <Text style={{ fontSize: 11, fontWeight: "500", color: meta.accentText }}>{item.source}</Text>
          </View>
          <Text style={{ fontSize: 11, color: paperColors.meta }}>{item.savedAt}</Text>
        </View>
        <Text style={{ fontSize: 19, fontWeight: "500", lineHeight: 27, marginBottom: 12, color: paperColors.ink }}>{item.title}</Text>
        {!!item.excerpt && <Text style={{ fontSize: 14, lineHeight: 22, marginBottom: 16, color: paperColors.sub }}>{item.excerpt}</Text>}
        <View style={{ gap: 6, marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: "rgba(98,87,93,0.12)" }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Text style={{ fontSize: 12, color: paperColors.meta }}>来自</Text>
            <Text style={{ fontSize: 12, color: paperColors.sub }}>{item.source}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Text style={{ fontSize: 12, color: paperColors.meta }}>陪伴</Text>
            <Text style={{ fontSize: 12, color: paperColors.sub }}>{item.petName} 🌿</Text>
          </View>
        </View>
        <View style={{ gap: 8 }}>
          {item.type === "letter" && (
            <Pressable style={{ paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(246,231,168,0.72)" }}>
              <Text style={{ fontSize: 14, color: paperColors.ink2 }}>回到对话</Text>
            </Pressable>
          )}
          {item.type === "scene" && (
            <Pressable style={{ paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(246,225,143,0.72)" }}>
              <Text style={{ fontSize: 14, color: "#6E5A28" }}>再次体验场景</Text>
            </Pressable>
          )}
          {item.type === "music" && (
            <Pressable style={{ paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(233,228,244,0.72)" }}>
              <Text style={{ fontSize: 14, color: paperColors.ink }}>播放歌曲</Text>
            </Pressable>
          )}
          {!confirmRemove ? (
            <Pressable onPress={() => setConfirmRemove(true)} style={{ paddingVertical: 10, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: paperColors.dim }}>移出珍藏</Text>
            </Pressable>
          ) : (
            <View style={{ borderRadius: 16, padding: 16, backgroundColor: "rgba(255,252,245,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" }}>
              <Text style={{ fontSize: 13, textAlign: "center", marginBottom: 12, color: paperColors.sub2 }}>移出后不能恢复，确定吗？</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => setConfirmRemove(false)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(255,252,245,0.8)" }}>
                  <Text style={{ fontSize: 13, color: paperColors.sub }}>再想想</Text>
                </Pressable>
                <Pressable onPress={onRemove}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(243,218,202,0.65)" }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: paperColors.ink }}>确认移出</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </ResponsiveOverlay>
  );
}

/** 珍藏筛选浮层：按类型过滤。 */
function KeepsakeFilterSheet({ visible, active, onSelect, onClose }: {
  visible: boolean; active: string; onSelect: (f: string) => void; onClose: () => void;
}) {
  const filters = ["全部", "来信", "洞察", "灵感", "场景", "音乐与书籍"];
  return (
    <ResponsiveOverlay visible={visible} onClose={onClose} title="筛选珍藏">
      <View style={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {filters.map(f => (
          <Pressable key={f} onPress={() => { onSelect(f); onClose(); }}
            style={{
              paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
              backgroundColor: active === f ? "rgba(246,231,168,0.88)" : "rgba(255,252,245,0.65)",
              borderWidth: active === f ? 1.5 : 1,
              borderColor: active === f ? "rgba(156,105,29,0.35)" : "rgba(255,255,255,0.45)",
            }}>
            <Text style={{ fontSize: 14, color: active === f ? "#4B4346" : "#6E6764" }}>{f}</Text>
          </Pressable>
        ))}
      </View>
    </ResponsiveOverlay>
  );
}

/** 珍藏册：双列瀑布布局 + 类型筛选 + 空态。 */
export function KeepsakeAlbum({ keepsakes, onSelectItem, onRemove }: {
  keepsakes: Keepsake[];
  onSelectItem: (k: Keepsake) => void;
  onRemove: (id: string) => void;
}) {
  const [showFilter, setShowFilter] = useState(false);
  const [activeFilter, setActiveFilter] = useState("全部");

  const filterMap: Record<string, Keepsake["type"][]> = {
    "全部": ["letter", "insight", "scene", "music", "quote", "moment"],
    "来信": ["letter"], "洞察": ["insight"], "灵感": ["quote"],
    "场景": ["scene"], "音乐与书籍": ["music"],
  };
  const visible = activeFilter === "全部" ? keepsakes : keepsakes.filter(k => (filterMap[activeFilter] || []).includes(k.type));
  const leftCol = visible.filter((_, i) => i % 2 === 0);
  const rightCol = visible.filter((_, i) => i % 2 !== 0);

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 12 }}>
        <Pressable onPress={() => setShowFilter(true)}
          style={{
            flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
            backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
          }}>
          <SlidersHorizontal size={12} color={paperColors.meta} />
          <Text style={{ fontSize: 12, color: paperColors.meta }}>{activeFilter !== "全部" ? activeFilter : "筛选"}</Text>
        </Pressable>
      </View>

      {visible.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 48, gap: 16 }}>
          <View style={{
            width: 66, height: 84, borderRadius: 14, alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
          }}>
            <Text style={{ fontSize: 24 }}>✉</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 15, fontWeight: "500", marginBottom: 6, color: paperColors.ink }}>这里还空着</Text>
            <Text style={{ fontSize: 13, lineHeight: 19, textAlign: "center", color: paperColors.meta }}>
              只有你决定留下的东西，{"\n"}才会来到这里。
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            {leftCol.map(k => <KeepsakeArtifact key={k.id} item={k} onOpen={() => onSelectItem(k)} />)}
          </View>
          <View style={{ flex: 1, marginTop: 20 }}>
            {rightCol.map(k => <KeepsakeArtifact key={k.id} item={k} onOpen={() => onSelectItem(k)} />)}
          </View>
        </View>
      )}

      <KeepsakeFilterSheet visible={showFilter} active={activeFilter} onSelect={setActiveFilter} onClose={() => setShowFilter(false)} />
    </View>
  );
}

export { KeepsakeDetail };
