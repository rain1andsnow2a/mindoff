/**
 * 信箱模块（移植自 proto）：
 * 今日待启（周视图 + 任务列表）/ 桌宠来信（信封→信纸）/ 长久珍藏（双列册子）/ 三日寄存
 * + TaskDetail / StorageDetail 两个详情屏。
 */
import React, { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  Check, ChevronLeft, ChevronRight, Film, Heart, Mail, MapPin, Music,
  Play, Plus, SlidersHorizontal, Star, Archive, X,
} from "lucide-react-native";
import {
  BottomSheet, CreamRipple, GlassCard, PrimaryBtn, SafeHeader,
} from "../components";
import { CREAM, GOLD_DEEP, palette, useNight } from "../theme";

// ─── Types & Mock ────────────────────────────────────────────────────────────

export interface Task {
  id: string; title: string; date: string; time: string;
  source: string; completed: boolean;
}

export interface Keepsake {
  id: string;
  type: "letter" | "insight" | "scene" | "music" | "quote" | "moment";
  title: string; excerpt: string; savedAt: string;
  petName: string; source: string;
}

const TODAY_DATE = "2026-07-23";

const INITIAL_TASKS: Task[] = [
  { id: "t1", title: "回复那封邮件", date: "2026-07-23", time: "今天内", source: "来自昨晚的整理", completed: false },
  { id: "t2", title: "和朋友见面", date: "2026-07-23", time: "15:00", source: "手动添加", completed: false },
  { id: "t3", title: "记得喝水", date: "2026-07-23", time: "持续", source: "桌宠提醒", completed: true },
  { id: "t4", title: "与朋友的约定", date: "2026-07-24", time: "15:00", source: "来自昨晚的整理", completed: false },
  { id: "t5", title: "整理书桌", date: "2026-07-22", time: "", source: "手动添加", completed: true },
];

const INITIAL_KEEPSAKES: Keepsake[] = [
  { id: "k1", type: "letter", title: "桐桐写给我的信", excerpt: "你已经做得比自己感觉到的更多了。", savedAt: "7月24日", petName: "桐桐", source: "桌宠来信" },
  { id: "k2", type: "insight", title: "我不是害怕失败，而是害怕拖累队友。", excerpt: "", savedAt: "7月18日", petName: "小栖", source: "今日洞察" },
  { id: "k3", type: "scene", title: "我终于把那句话说了出来", excerpt: "场景：和妈妈的对话", savedAt: "6月12日", petName: "小栖", source: "场景结算" },
  { id: "k4", type: "music", title: "Bloom", excerpt: "桐桐夹在信里的歌", savedAt: "6月8日", petName: "桐桐", source: "信中附件" },
  { id: "k5", type: "quote", title: "朋友说：你不用每次都表现得没事。", excerpt: "", savedAt: "5月28日", petName: "小栖", source: "一句话" },
];

const LETTER_DATA = {
  date: "7月24日 · 星期五",
  greeting: "晚上好呀",
  from: "桐桐",
  deliveryTime: "7月24日 · 晚上 9:30 送达",
  preview: "今天也有一些话想告诉你",
  body: [
    "我记得你今天一直在推进那件很重要的事情，好像没有给自己留下多少喘气的时间。你已经做得比自己感觉到的更多了。",
    "如果今晚还是有点紧绷，也不用急着把所有事情想明白。先在这里坐一会儿，我会陪着你。",
    "我还给你夹了一首很慢的歌，希望它能替我抱抱你。",
  ],
  attachment: { label: "信里夹了一首歌", title: "Bloom", artist: "ODESZA", reason: "旋律很慢，适合把今天一点点放下来。" },
};

// ─── Week helpers ────────────────────────────────────────────────────────────

const WEEKDAYS_CN = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const DAY_CN = ["日", "一", "二", "三", "四", "五", "六"];

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  d.setHours(0, 0, 0, 0);
  return d;
}
function shiftDays(date: Date, n: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseISO(s: string): Date {
  const [y, m, dd] = s.split("-").map(Number);
  return new Date(y, m - 1, dd);
}

// ─── WeekNavigator ───────────────────────────────────────────────────────────

function WeekNavigator({ weekOffset, selectedDate, onWeekChange, onSelectDate, tasks }: {
  weekOffset: number; selectedDate: string;
  onWeekChange: (d: number) => void; onSelectDate: (s: string) => void;
  tasks: Task[];
}) {
  const night = useNight();
  const C = palette(night);
  const baseMonday = getMondayOf(parseISO(TODAY_DATE));
  const monday = shiftDays(baseMonday, weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => shiftDays(monday, i));
  const rangeLabel = `${days[0].getMonth() + 1}月${days[0].getDate()}日—${days[6].getMonth() + 1}月${days[6].getDate()}日`;
  const dots = (ds: string) => Math.min(tasks.filter(t => t.date === ds && !t.completed).length, 3);

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: C.text2 }}>{rangeLabel}</Text>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {([-1, 1] as const).map(d => (
            <Pressable key={d} onPress={() => onWeekChange(d)}
              style={{
                width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14,
                backgroundColor: night ? "rgba(255,248,244,0.08)" : "rgba(255,252,245,0.72)",
                borderWidth: 1, borderColor: night ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.45)",
              }}>
              {d < 0 ? <ChevronLeft size={13} color={C.text2} /> : <ChevronRight size={13} color={C.text2} />}
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {days.map((day, i) => {
          const ds = toISO(day);
          const sel = ds === selectedDate;
          const tod = ds === TODAY_DATE;
          const dotCount = dots(ds);
          return (
            <Pressable key={i} onPress={() => onSelectDate(ds)}
              style={{
                flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 14,
                backgroundColor: sel ? "rgba(246,231,168,0.8)" : tod ? "rgba(249,240,200,0.45)" : "transparent",
                borderWidth: 1.5, borderColor: sel ? "rgba(255,255,255,0.62)" : "transparent",
              }}>
              <Text style={{ fontSize: 10, marginBottom: 2, color: sel ? (night ? "#7E7479" : "#847D72") : (night ? "#A399A0" : "#C0B5A8") }}>
                {WEEKDAYS_CN[i]}
              </Text>
              <Text style={{
                fontSize: 14, fontWeight: "500",
                color: sel ? (night ? "#484145" : "#4B463F") : tod ? (night ? "#C5BBC1" : "#847D72") : C.text,
              }}>
                {day.getDate()}
              </Text>
              <View style={{ flexDirection: "row", gap: 2, marginTop: 4, height: 6, alignItems: "center" }}>
                {Array.from({ length: dotCount }, (_, j) => (
                  <View key={j} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: sel ? "rgba(196,149,58,0.7)" : "rgba(196,149,58,0.5)" }} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── TaskRow ─────────────────────────────────────────────────────────────────

function TaskRow({ task, onToggle, onDelete }: {
  task: Task; onToggle: () => void; onDelete: () => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16,
        backgroundColor: task.completed ? "rgba(255,252,245,0.42)" : "rgba(255,252,245,0.72)",
        borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
      }}>
        <Pressable onPress={onToggle} style={{
          width: 22, height: 22, borderRadius: 11,
          backgroundColor: task.completed ? "rgba(246,231,168,0.9)" : "transparent",
          borderWidth: 2, borderColor: task.completed ? "rgba(196,149,58,0.7)" : "rgba(91,79,62,0.2)",
          alignItems: "center", justifyContent: "center",
        }}>
          {task.completed && <Check size={11} color="#484145" />}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: 14, fontWeight: "500", lineHeight: 20,
            color: task.completed ? "#A39A9F" : "#484145",
            textDecorationLine: task.completed ? "line-through" : "none",
          }}>
            {task.title}
          </Text>
          <Text style={{ fontSize: 11, marginTop: 2, color: "#7E7479" }}>{task.source}</Text>
        </View>
        {!!task.time && !actionsOpen && (
          <Text style={{ fontSize: 12, color: "#A39A9F" }}>{task.time}</Text>
        )}
        <Pressable onPress={() => setActionsOpen(v => !v)}
          style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#7E7479", fontSize: 13, letterSpacing: 1 }}>···</Text>
        </Pressable>
      </View>
      {actionsOpen && (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingHorizontal: 8, paddingTop: 6 }}>
          <Pressable onPress={() => setActionsOpen(false)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,252,245,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" }}>
            <Text style={{ fontSize: 12, color: "#655D61" }}>编辑</Text>
          </Pressable>
          <Pressable onPress={() => { onDelete(); setActionsOpen(false); }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(243,216,199,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" }}>
            <Text style={{ fontSize: 12, color: "#655D61" }}>删除</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── CompletedTasksSection ───────────────────────────────────────────────────

function CompletedTasksSection({ tasks }: { tasks: Task[] }) {
  const night = useNight();
  const C = palette(night);
  const [open, setOpen] = useState(false);
  if (!tasks.length) return null;
  return (
    <View style={{ marginTop: 4 }}>
      <Pressable onPress={() => setOpen(v => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 }}>
        <ChevronRight size={12} color={C.muted} style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }} />
        <Text style={{ fontSize: 12, color: C.muted }}>今天完成了 {tasks.length} 件</Text>
      </Pressable>
      {open && tasks.map(t => (
        <View key={t.id} style={{
          flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, marginBottom: 6,
          backgroundColor: "rgba(255,252,245,0.4)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)",
        }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(196,149,58,0.5)" }}>
            <Check size={9} color="#484145" />
          </View>
          <Text style={{ fontSize: 13, flex: 1, color: C.muted, textDecorationLine: "line-through" }} numberOfLines={1}>{t.title}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── AddTaskSheet ────────────────────────────────────────────────────────────

function AddTaskSheet({ visible, defaultDate, onClose, onAdd }: {
  visible: boolean; defaultDate: string; onClose: () => void; onAdd: (t: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const d = parseISO(defaultDate);
  const label = `${d.getMonth() + 1}月${d.getDate()}日`;

  const commit = () => {
    if (!title.trim()) return;
    onAdd({ id: `t${Date.now()}`, title: title.trim(), date: defaultDate, time, source: "手动添加", completed: false });
    setTitle(""); setTime("");
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="添加一件事">
      <View style={{ paddingHorizontal: 20, paddingBottom: 32, gap: 16, paddingTop: 4 }}>
        <TextInput
          value={title} onChangeText={setTitle}
          placeholder="要做什么…" placeholderTextColor="#A39A9F"
          style={{
            paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, fontSize: 15,
            backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", color: "#484145",
          }}
          onSubmitEditing={commit} autoFocus
        />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, flex: 1,
            backgroundColor: "rgba(246,231,168,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)",
          }}>
            <Text style={{ fontSize: 13 }}>📅</Text>
            <Text style={{ fontSize: 14, color: "#484145" }}>{label}</Text>
          </View>
          <TextInput
            value={time} onChangeText={setTime}
            placeholder="时间（可选）" placeholderTextColor="#A39A9F"
            style={{
              flex: 1, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, fontSize: 14,
              backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", color: "#484145",
            }}
          />
        </View>
        <PrimaryBtn onClick={commit} full disabled={!title.trim()}>放到这一天</PrimaryBtn>
      </View>
    </BottomSheet>
  );
}

// ─── DailyTaskList ───────────────────────────────────────────────────────────

function DailyTaskList({ selectedDate, tasks, onToggle, onDelete, onAdd }: {
  selectedDate: string; tasks: Task[];
  onToggle: (id: string) => void; onDelete: (id: string) => void; onAdd: () => void;
}) {
  const night = useNight();
  const C = palette(night);
  const d = parseISO(selectedDate);
  const dayName = `星期${DAY_CN[d.getDay()]}`;
  const label = `${d.getMonth() + 1}月${d.getDate()}日，${dayName}`;
  const isTd = selectedDate === TODAY_DATE;
  const active = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 16, fontWeight: "500", color: C.text }}>{label}</Text>
          <Text style={{ fontSize: 12, marginTop: 2, color: C.text2 }}>
            {active.length > 0 ? `${isTd ? "今天" : "这天"}有 ${active.length} 件事等你接住` : `${isTd ? "今天" : "这天"}还没有待办`}
          </Text>
        </View>
        <Pressable onPress={onAdd}
          style={({ pressed }) => [{
            flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
            backgroundColor: "rgba(246,231,168,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
            transform: [{ scale: pressed ? 0.97 : 1 }],
          }]}>
          <Plus size={12} color="#463F3C" />
          <Text style={{ fontSize: 13, fontWeight: "500", color: "#463F3C" }}>添加</Text>
        </Pressable>
      </View>

      {tasks.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 40, gap: 16 }}>
          <View style={{
            width: 64, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
          }}>
            <Text style={{ fontSize: 24 }}>✦</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 15, fontWeight: "500", marginBottom: 4, color: C.text }}>这一天还是空的</Text>
            <Text style={{ fontSize: 13, color: C.muted }}>可以先留一点位置给自己。</Text>
          </View>
          <Pressable onPress={onAdd}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(246,231,168,0.65)" }}>
            <Text style={{ fontSize: 13, color: "#463F3C" }}>添加一件事</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {active.map(t => (
            <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
          ))}
          <CompletedTasksSection tasks={done} />
        </>
      )}
    </View>
  );
}

// ─── Keepsake ────────────────────────────────────────────────────────────────

const TYPE_META: Record<Keepsake["type"], { label: string; accentText: string }> = {
  letter: { label: "桌宠来信", accentText: "#9C691D" },
  insight: { label: "今日洞察", accentText: "#826E50" },
  scene: { label: "片场记录", accentText: "#A26458" },
  music: { label: "音乐", accentText: "#75679D" },
  quote: { label: "一句话", accentText: "#70656B" },
  moment: { label: "时刻", accentText: "#70656B" },
};

function KeepsakeArtifact({ item, onOpen }: { item: Keepsake; onOpen: () => void }) {
  const meta = TYPE_META[item.type];
  const isMedia = item.type === "music";
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [{ marginBottom: 12, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <View style={{
        borderRadius: 24, overflow: "hidden",
        backgroundColor: "rgba(255,252,245,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.52)",
      }}>
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
            <Text style={{ fontSize: 14, fontWeight: "500", marginBottom: 4, color: "#484145" }} numberOfLines={1}>{item.title}</Text>
            {!!item.excerpt && <Text style={{ fontSize: 12, marginBottom: 8, color: "#655D61" }} numberOfLines={1}>{item.excerpt}</Text>}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: "#7E7479" }}>{item.savedAt}</Text>
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
            <Text style={{ fontSize: 14, fontWeight: "500", lineHeight: 20, marginBottom: item.excerpt ? 8 : 12, color: "#484145" }}>
              {item.title}
            </Text>
            {!!item.excerpt && (
              <Text style={{ fontSize: 12, lineHeight: 17, marginBottom: 12, color: "#655D61", fontStyle: item.type === "letter" || item.type === "scene" ? "italic" : "normal" }}>
                {item.excerpt}
              </Text>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 11, color: "#7E7479" }}>{item.source}</Text>
              <Text style={{ fontSize: 11, color: "#7E7479" }}>{item.savedAt}</Text>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function KeepsakeDetail({ item, onClose, onRemove }: {
  item: Keepsake; onClose: () => void; onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const meta = TYPE_META[item.type];
  return (
    <BottomSheet visible onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.65)" }}>
            <Text style={{ fontSize: 11, fontWeight: "500", color: meta.accentText }}>{item.source}</Text>
          </View>
          <Text style={{ fontSize: 11, color: "#7E7479" }}>{item.savedAt}</Text>
        </View>
        <Text style={{ fontSize: 19, fontWeight: "500", lineHeight: 27, marginBottom: 12, color: "#484145" }}>{item.title}</Text>
        {!!item.excerpt && <Text style={{ fontSize: 14, lineHeight: 22, marginBottom: 16, color: "#655D61" }}>{item.excerpt}</Text>}
        <View style={{ gap: 6, marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: "rgba(98,87,93,0.12)" }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Text style={{ fontSize: 12, color: "#7E7479" }}>来自</Text>
            <Text style={{ fontSize: 12, color: "#655D61" }}>{item.source}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Text style={{ fontSize: 12, color: "#7E7479" }}>陪伴</Text>
            <Text style={{ fontSize: 12, color: "#655D61" }}>{item.petName} 🌿</Text>
          </View>
        </View>
        <View style={{ gap: 8 }}>
          {item.type === "letter" && (
            <Pressable style={{ paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(246,231,168,0.72)" }}>
              <Text style={{ fontSize: 14, color: "#4D4249" }}>回到对话</Text>
            </Pressable>
          )}
          {item.type === "scene" && (
            <Pressable style={{ paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(243,218,202,0.65)" }}>
              <Text style={{ fontSize: 14, color: "#484145" }}>再次体验场景</Text>
            </Pressable>
          )}
          {item.type === "music" && (
            <Pressable style={{ paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(233,228,244,0.72)" }}>
              <Text style={{ fontSize: 14, color: "#484145" }}>播放歌曲</Text>
            </Pressable>
          )}
          {!confirmRemove ? (
            <Pressable onPress={() => setConfirmRemove(true)} style={{ paddingVertical: 10, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: "#A39A9F" }}>移出珍藏</Text>
            </Pressable>
          ) : (
            <View style={{ borderRadius: 16, padding: 16, backgroundColor: "rgba(255,252,245,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" }}>
              <Text style={{ fontSize: 13, textAlign: "center", marginBottom: 12, color: "#847D72" }}>移出后不能恢复，确定吗？</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => setConfirmRemove(false)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(255,252,245,0.8)" }}>
                  <Text style={{ fontSize: 13, color: "#655D61" }}>再想想</Text>
                </Pressable>
                <Pressable onPress={onRemove}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(243,218,202,0.65)" }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: "#484145" }}>确认移出</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </BottomSheet>
  );
}

function KeepsakeFilterSheet({ visible, active, onSelect, onClose }: {
  visible: boolean; active: string; onSelect: (f: string) => void; onClose: () => void;
}) {
  const filters = ["全部", "来信", "洞察", "灵感", "场景", "音乐与书籍"];
  return (
    <BottomSheet visible={visible} onClose={onClose} title="筛选珍藏">
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
    </BottomSheet>
  );
}

function KeepsakeAlbum({ keepsakes, onSelectItem, onRemove }: {
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
          <SlidersHorizontal size={12} color="#7E7479" />
          <Text style={{ fontSize: 12, color: "#7E7479" }}>{activeFilter !== "全部" ? activeFilter : "筛选"}</Text>
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
            <Text style={{ fontSize: 15, fontWeight: "500", marginBottom: 6, color: "#484145" }}>这里还空着</Text>
            <Text style={{ fontSize: 13, lineHeight: 19, textAlign: "center", color: "#7E7479" }}>
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

// ─── Letter ──────────────────────────────────────────────────────────────────

export type LetterState = "waiting" | "sealed" | "opening" | "opened" | "saved";

function SealedEnvelope({ onOpen, isOpening }: { onOpen: () => void; isOpening: boolean }) {
  const night = useNight();
  const C = palette(night);
  const [showRipple, setShowRipple] = useState(false);
  const handleTap = () => {
    setShowRipple(true);
    setTimeout(() => setShowRipple(false), 700);
    onOpen();
  };
  return (
    <Pressable onPress={handleTap} style={({ pressed }) => [{ alignItems: "center", transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <CreamRipple active={showRipple} />
      <View style={{
        width: 320, height: 205, borderRadius: 22, overflow: "hidden",
        backgroundColor: "rgba(252,247,225,0.96)", borderWidth: 1, borderColor: "rgba(255,255,255,0.58)",
      }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
          <View style={{ alignItems: "flex-end", marginBottom: 14 }}>
            <View style={{
              width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(246,231,168,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.55)",
            }}>
              <Text style={{ fontSize: 17 }}>🌿</Text>
            </View>
          </View>
          <Text style={{ fontSize: 16, fontWeight: "500", marginBottom: 6, color: "#4D4249" }}>桐桐今天写给你</Text>
          <Text style={{ fontSize: 12, marginBottom: 5, color: "#8C8187" }}>{LETTER_DATA.deliveryTime}</Text>
          <Text style={{ fontSize: 12, color: "#A39A9F" }}>{LETTER_DATA.preview}</Text>
        </View>
        {/* 信封下折角近似 */}
        <View style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 54,
          backgroundColor: "rgba(243,216,199,0.20)",
        }} />
      </View>
      {!isOpening && (
        <Text style={{ marginTop: 20, fontSize: 13, letterSpacing: 0.3, color: C.muted }}>轻点拆开</Text>
      )}
    </Pressable>
  );
}

function LetterAttachment({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  return (
    <View style={{
      marginVertical: 20, borderRadius: 18, overflow: "hidden",
      backgroundColor: "rgba(249,241,204,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.55)",
    }}>
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <Music size={12} color="#B98232" />
          <Text style={{ fontSize: 12, fontWeight: "500", color: "#B98232" }}>{LETTER_DATA.attachment.label}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(246,231,168,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
          }}>
            <Text style={{ fontSize: 20 }}>🎵</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: "#4D4249" }} numberOfLines={1}>{LETTER_DATA.attachment.title}</Text>
            <Text style={{ fontSize: 12, marginTop: 2, color: "#8C8187" }}>{LETTER_DATA.attachment.artist}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 13, marginTop: 12, lineHeight: 19, color: "#62575D" }}>{LETTER_DATA.attachment.reason}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Pressable style={{
            flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
            backgroundColor: "rgba(246,231,168,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
          }}>
            <Play size={11} color="#4D4249" />
            <Text style={{ fontSize: 13, fontWeight: "500", color: "#4D4249" }}>试听一下</Text>
          </Pressable>
          <Pressable onPress={onSave}
            style={{
              flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
              backgroundColor: saved ? "rgba(221,237,227,0.55)" : "rgba(255,255,255,0.5)",
              borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
            }}>
            <Heart size={11} color={saved ? "#5A8A6A" : "#8C8187"} />
            <Text style={{ fontSize: 13, color: saved ? "#5A8A6A" : "#8C8187" }}>{saved ? "已留着" : "替我留着"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function LetterPaper({ saved, onAck, onReply, onSave }: {
  saved: boolean; onAck: () => void; onReply: () => void; onSave: () => void;
}) {
  const [attachSaved, setAttachSaved] = useState(false);
  return (
    <View style={{
      borderRadius: 24, overflow: "hidden",
      backgroundColor: "rgba(255,253,247,0.96)", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)",
    }}>
      {/* 信纸左侧边线 */}
      <View style={{ position: "absolute", left: 44, top: 0, bottom: 0, width: 1, backgroundColor: "rgba(243,216,199,0.3)" }} />
      <View style={{ padding: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <View>
            <Text style={{ fontSize: 12, marginBottom: 4, color: "#8C8187" }}>{LETTER_DATA.date}</Text>
            <Text style={{ fontSize: 20, fontWeight: "500", color: "#4D4249" }}>{LETTER_DATA.greeting}</Text>
          </View>
          <View style={{
            width: 38, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(246,231,168,0.6)", borderWidth: 1.5, borderColor: "rgba(196,149,58,0.3)", borderStyle: "dashed",
          }}>
            <Text style={{ fontSize: 18 }}>🌿</Text>
          </View>
        </View>

        <View style={{ gap: 16 }}>
          {LETTER_DATA.body.map((para, i) => (
            <Text key={i} style={{ fontSize: 15, lineHeight: 25, color: "#62575D" }}>{para}</Text>
          ))}
        </View>

        <LetterAttachment saved={attachSaved} onSave={() => setAttachSaved(s => !s)} />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <Text style={{ fontSize: 15, fontStyle: "italic", letterSpacing: 0.5, color: "#8C8187" }}>{LETTER_DATA.from}</Text>
          <View style={{ width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(243,216,199,0.45)" }}>
            <Text style={{ fontSize: 14 }}>✦</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={{ marginTop: 24, gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={onAck}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(246,231,168,0.75)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: "#4D4249" }}>收到啦</Text>
            </Pressable>
            <Pressable onPress={onReply}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 999, alignItems: "center", backgroundColor: "rgba(255,252,245,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" }}>
              <Text style={{ fontSize: 14, color: "#62575D" }}>回它一句</Text>
            </Pressable>
          </View>
          <Pressable onPress={onSave}
            style={{
              paddingVertical: 12, borderRadius: 999, alignItems: "center",
              backgroundColor: saved ? "rgba(221,237,227,0.55)" : "rgba(255,252,245,0.6)",
              borderWidth: 1, borderColor: "rgba(255,255,255,0.4)",
            }}>
            <Text style={{ fontSize: 14, color: saved ? "#5A8A6A" : "#8C8187" }}>
              {saved ? "✓ 已经替你收好" : "把这封信留下"}
            </Text>
          </Pressable>
          {!saved && (
            <Text style={{ textAlign: "center", fontSize: 11, marginTop: 8, lineHeight: 16, color: "#8C8187" }}>
              如果不留下，它会在明天的新信到达时离开。
            </Text>
          )}
          {saved && (
            <Pressable style={{ alignItems: "center", marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: "#A39A9F" }}>去长久珍藏看看</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function WaitingLetterState() {
  const night = useNight();
  const C = palette(night);
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 20 }}>
      <View style={{
        width: 120, height: 80, borderRadius: 14, alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
      }}>
        <Text style={{ fontSize: 28 }}>✉️</Text>
      </View>
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 15, fontWeight: "500", marginBottom: 6, color: C.text }}>今天的信还在路上</Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: C.muted }}>有想告诉你的时候，它会送来。</Text>
      </View>
    </View>
  );
}

function DailyLetterView({ onReply, letterState, onOpenLetter, onSaveLetter, onAckLetter }: {
  onReply: () => void; letterState: LetterState;
  onOpenLetter: () => void; onSaveLetter: () => void; onAckLetter: () => void;
}) {
  const saved = letterState === "saved";
  const isOpening = letterState === "opening";
  const showEnvelope = letterState === "sealed" || letterState === "opening";
  const showLetter = letterState === "opened" || letterState === "saved";

  return (
    <View>
      {letterState === "waiting" && <WaitingLetterState />}
      {showEnvelope && (
        <View style={{ alignItems: "center", paddingVertical: 32 }}>
          <SealedEnvelope onOpen={onOpenLetter} isOpening={isOpening} />
        </View>
      )}
      {showLetter && (
        <LetterPaper saved={saved} onAck={onAckLetter} onReply={onReply} onSave={onSaveLetter} />
      )}
    </View>
  );
}

// ─── Mailbox Screen ──────────────────────────────────────────────────────────

export function MailboxScreen({ onTaskDetail, onStorageDetail, letterState, onOpenLetter, onSaveLetter, onAckLetter, onReplyLetter }: {
  onTaskDetail: () => void;
  onStorageDetail: () => void;
  letterState: LetterState;
  onOpenLetter: () => void;
  onSaveLetter: () => void;
  onAckLetter: () => void;
  onReplyLetter: () => void;
}) {
  const night = useNight();
  const C = palette(night);
  const [sec, setSec] = useState(0);
  const sections = ["桌宠来信", "今日待启", "长久珍藏", "三日寄存"];

  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [selectedDate, setSelectedDate] = useState(TODAY_DATE);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAddTask, setShowAddTask] = useState(false);

  const [keepsakes, setKeepsakes] = useState<Keepsake[]>(INITIAL_KEEPSAKES);
  const [selectedKeepsake, setSelectedKeepsake] = useState<Keepsake | null>(null);

  const dayTasks = tasks.filter(t => t.date === selectedDate);
  const toggleTask = (id: string) => setTasks(ts => ts.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  const deleteTask = (id: string) => setTasks(ts => ts.filter(t => t.id !== id));
  const addTask = (t: Task) => setTasks(ts => [...ts, t]);
  const removeKeepsake = (id: string) => {
    setKeepsakes(ks => ks.filter(k => k.id !== id));
    setSelectedKeepsake(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12 }}>
        <Text style={{ fontSize: 26, fontWeight: "500", letterSpacing: -0.5, color: C.text }}>信箱</Text>
      </View>
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {sections.map((s, i) => (
            <Pressable key={i} onPress={() => setSec(i)}
              style={{
                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                backgroundColor: sec === i
                  ? (night ? "rgba(216,188,118,0.32)" : "rgba(246,231,168,0.88)")
                  : (night ? "rgba(59,51,64,0.55)" : "rgba(255,252,245,0.65)"),
                borderWidth: 1,
                borderColor: night ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.4)",
              }}>
              <Text style={{
                fontSize: 13, fontWeight: "500",
                color: sec === i ? (night ? "#F4EFEA" : "#494145") : (night ? "#B7ADB4" : "#6E6764"),
              }}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        {sec === 1 && (
          <>
            <WeekNavigator weekOffset={weekOffset} selectedDate={selectedDate}
              onWeekChange={d => setWeekOffset(o => o + d)} onSelectDate={setSelectedDate} tasks={tasks} />
            <DailyTaskList selectedDate={selectedDate} tasks={dayTasks}
              onToggle={toggleTask} onDelete={deleteTask} onAdd={() => setShowAddTask(true)} />
          </>
        )}
        {sec === 0 && (
          <DailyLetterView letterState={letterState} onOpenLetter={onOpenLetter}
            onSaveLetter={onSaveLetter} onAckLetter={onAckLetter} onReply={onReplyLetter} />
        )}
        {sec === 2 && (
          <KeepsakeAlbum keepsakes={keepsakes} onSelectItem={setSelectedKeepsake} onRemove={removeKeepsake} />
        )}
        {sec === 3 && (
          <>
            {[
              { title: "那次和妈妈的通话", time: "2天后到期", tag: "温暖" },
              { title: "昨晚想到的一个主意", time: "1天后到期", tag: "灵感" },
              { title: "有点烦那件事", time: "今天到期", tag: "情绪" },
            ].map((s, i) => (
              <GlassCard key={i} style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 12 }} onClick={onStorageDetail}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "500", marginBottom: 6, color: C.text }}>{s.title}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(246,231,168,0.65)" }}>
                      <Text style={{ fontSize: 11, color: "#655D61" }}>{s.tag}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: C.muted }}>{s.time}</Text>
                  </View>
                </View>
                <ChevronRight size={15} color={C.muted} />
              </GlassCard>
            ))}
          </>
        )}
      </ScrollView>

      <AddTaskSheet visible={showAddTask} defaultDate={selectedDate}
        onClose={() => setShowAddTask(false)} onAdd={addTask} />
      {selectedKeepsake && (
        <KeepsakeDetail item={selectedKeepsake}
          onClose={() => setSelectedKeepsake(null)} onRemove={() => removeKeepsake(selectedKeepsake.id)} />
      )}
    </View>
  );
}

// ─── Task Detail ─────────────────────────────────────────────────────────────

export function TaskDetail({ onBack }: { onBack: () => void }) {
  const night = useNight();
  const C = palette(night);
  const [done, setDone] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} title="今日待启" />
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100, gap: 16 }}>
        <GlassCard style={{ padding: 24 }}>
          <Text style={{ fontSize: 28, marginBottom: 12 }}>📅</Text>
          <Text style={{ fontSize: 20, fontWeight: "500", marginBottom: 6, color: C.text }}>与朋友的约定</Text>
          <Text style={{ fontSize: 14, marginBottom: 12, color: C.text2 }}>下午 3:00 · 你昨晚提到担心会迟到</Text>
          <Text style={{ fontSize: 14, lineHeight: 22, color: C.text2 }}>昨晚你说起这件事，有点担心来不及。我帮你留着了。</Text>
        </GlassCard>
        <Pressable onPress={() => setDone(!done)}
          style={{
            padding: 16, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 12,
            backgroundColor: done ? "rgba(246,231,168,0.6)" : "rgba(255,252,245,0.65)",
            borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
          }}>
          <View style={{
            width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center",
            backgroundColor: done ? "rgba(196,149,58,0.8)" : "transparent",
            borderWidth: 2, borderColor: done ? "rgba(196,149,58,0.8)" : "rgba(91,79,62,0.22)",
          }}>
            {done && <Check size={12} color="#fff" />}
          </View>
          <Text style={{
            fontSize: 15, fontWeight: "500", color: C.text,
            textDecorationLine: done ? "line-through" : "none",
          }}>
            {done ? "已完成，做到了" : "标记为完成"}
          </Text>
        </Pressable>
        {done && (
          <GlassCard style={{ padding: 16, alignItems: "center", backgroundColor: "rgba(221,237,227,0.45)" }}>
            <Text style={{ fontSize: 14, color: C.text }}>做完了，今天又少了一件事 🌿</Text>
          </GlassCard>
        )}
      </View>
    </View>
  );
}

// ─── Storage Detail ──────────────────────────────────────────────────────────

export function StorageDetail({ onBack }: { onBack: () => void }) {
  const night = useNight();
  const C = palette(night);
  const [action, setAction] = useState<"none" | "treasure" | "release">("none");
  return (
    <View style={{ flex: 1 }}>
      <SafeHeader onBack={onBack} title="三日寄存" />
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100, gap: 16 }}>
        <GlassCard style={{ padding: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(246,231,168,0.7)" }}>
              <Text style={{ fontSize: 11, fontWeight: "500", color: "#655D61" }}>情绪</Text>
            </View>
            <Text style={{ fontSize: 12, color: C.muted }}>1天后到期</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: "500", marginBottom: 12, color: C.text }}>那次和妈妈的通话</Text>
          <Text style={{ fontSize: 14, lineHeight: 22, color: C.text2 }}>
            昨晚说到你们的对话，你有点担心她最近的状态。这个感受被我留在这里了，三天后如果你没有更多想说的，我会轻轻放下它。
          </Text>
        </GlassCard>
        {action === "none" && (
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable onPress={() => setAction("treasure")}
              style={({ pressed }) => [{
                flex: 1, paddingVertical: 16, borderRadius: 20, alignItems: "center", gap: 8,
                backgroundColor: "rgba(246,231,168,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)",
                transform: [{ scale: pressed ? 0.97 : 1 }],
              }]}>
              <Star size={20} color={GOLD_DEEP} />
              <Text style={{ fontSize: 14, fontWeight: "500", color: C.text }}>珍藏</Text>
            </Pressable>
            <Pressable onPress={() => setAction("release")}
              style={({ pressed }) => [{
                flex: 1, paddingVertical: 16, borderRadius: 20, alignItems: "center", gap: 8,
                backgroundColor: "rgba(221,237,227,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)",
                transform: [{ scale: pressed ? 0.97 : 1 }],
              }]}>
              <Archive size={20} color="#5A8A6A" />
              <Text style={{ fontSize: 14, fontWeight: "500", color: C.text }}>放下</Text>
            </Pressable>
          </View>
        )}
        {action !== "none" && (
          <GlassCard style={{
            padding: 20, alignItems: "center",
            backgroundColor: action === "treasure" ? "rgba(246,231,168,0.42)" : "rgba(221,237,227,0.42)",
          }}>
            <Text style={{ fontSize: 22, marginBottom: 8 }}>{action === "treasure" ? "⭐" : "🌊"}</Text>
            <Text style={{ fontSize: 14, color: C.text }}>
              {action === "treasure" ? "已加入长久珍藏" : "已轻轻放下，谢谢你把它告诉我"}
            </Text>
          </GlassCard>
        )}
      </View>
    </View>
  );
}
