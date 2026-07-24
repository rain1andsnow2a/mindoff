/**
 * 信箱模块：
 * 今日待启（周视图 + 任务列表）/ 桌宠来信（信封→信纸）/ 长久珍藏（双列册子）/ 三日寄存
 * + TaskDetail / StorageDetail 两个详情屏。
 */
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  Check, ChevronLeft, ChevronRight, Film, Heart, Mail, MapPin, Music,
  Play, Plus, SlidersHorizontal, Star, Archive, X,
} from "lucide-react-native";
import {
  BottomSheet, CreamRipple, GlassCard, PrimaryBtn, SafeHeader,
} from "../components";
import { CREAM, GOLD_DEEP, palette, useNight } from "../theme";
import { acceptSceneInvite, createTodo, createTreasure, deleteTodo, deleteTreasure, dropEphemeral, keepEphemeral, listEphemeral, listLetters, listTodos, listTreasures, markLetterRead, updateTodo } from "../api";

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

/** 后端 StoreItemOut(待办) → 前端 Task */
function mapTodo(t: any): Task {
  const due: string | null = t?.due_date ?? null;
  const date = due ? String(due).slice(0, 10) : TODAY_DATE;
  const hhmm = due ? String(due).slice(11, 16) : "";
  return {
    id: String(t.id),
    title: t.surface_text || t.content || "",
    date,
    time: hhmm && hhmm !== "00:00" ? hhmm : "",
    source: "来自整理",
    completed: t.status === "done",
  };
}

/** date + time(HH:MM 或自由文本) → 后端 due_date（datetime 字符串） */
function dueFrom(date: string, time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time || "").trim());
  const hh = m ? m[1].padStart(2, "0") : "00";
  const mm = m ? m[2] : "00";
  return `${date}T${hh}:${mm}:00`;
}

/** 三日寄存剩余时间文案 */
function remainText(expiresAt: string | null): string {
  if (!expiresAt) return "";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "已到期";
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days}天后到期`;
  return `${Math.max(1, Math.floor(ms / 3600000))}小时后到期`;
}


const INITIAL_KEEPSAKES: Keepsake[] = [
  { id: "k1", type: "letter", title: "桐桐写给我的信", excerpt: "你已经做得比自己感觉到的更多了。", savedAt: "7月24日", petName: "桐桐", source: "桌宠来信" },
  { id: "k2", type: "insight", title: "我不是害怕失败，而是害怕拖累队友。", excerpt: "", savedAt: "7月18日", petName: "小栖", source: "今日洞察" },
  { id: "k3", type: "scene", title: "我终于把那句话说了出来", excerpt: "场景：和妈妈的对话", savedAt: "6月12日", petName: "小栖", source: "场景结算" },
  { id: "k4", type: "music", title: "Bloom", excerpt: "桐桐夹在信里的歌", savedAt: "6月8日", petName: "桐桐", source: "信中附件" },
  { id: "k5", type: "quote", title: "朋友说：你不用每次都表现得没事。", excerpt: "", savedAt: "5月28日", petName: "小栖", source: "一句话" },
];

// 后端 TreasureOut → 前端 Keepsake
const _TREASURE_TYPE: Record<string, Keepsake["type"]> = {
  summary: "insight", idea: "insight", memory: "quote", scene: "scene", ephemeral: "moment",
};
const _TREASURE_SOURCE: Record<string, string> = {
  summary: "今日小结", idea: "灵感收藏", memory: "记忆", scene: "场景结算", ephemeral: "三日寄存",
};
function mapTreasure(t: any): Keepsake {
  const st = String(t?.source_type || "");
  return {
    id: String(t.id),
    type: _TREASURE_TYPE[st] || "insight",
    title: t.title || t.content || "",
    excerpt: t.title ? (t.content || "") : "",
    savedAt: t.created_at ? String(t.created_at).slice(5, 10).replace("-", "月") + "日" : "",
    petName: "",
    source: _TREASURE_SOURCE[st] || "珍藏",
  };
}

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

/** scene_invite 信件附件（后端 scene_recommend.generate_scene_invite 写入） */
export interface SceneInviteAttachment {
  kind: "scene_invite";
  render_kind: "preset_3d" | "dynamic_image";
  theater_id: string | null;
  seed: { title?: string; people?: string[]; place?: string; plot?: string; intent?: string };
  confidence?: number;
  scene_id?: number; // 接受后回写
}

/** 后端 LetterOut */
export interface ApiLetter {
  id: number;
  type: string;
  title: string;
  body: string;
  pet_id: number | null;
  ref_memory_id: number | null;
  attachment:
    | ({ label?: string; title?: string; artist?: string; reason?: string } & Partial<SceneInviteAttachment>)
    | null;
  is_read: boolean;
  created_at: string;
}

function isSceneInvite(letter: ApiLetter): boolean {
  return letter.type === "scene_invite" || letter.attachment?.kind === "scene_invite";
}

function _fmtLetterDate(iso: string): string {
  try {
    const d = new Date(iso);
    const wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 · 周${wd}`;
  } catch {
    return "";
  }
}

function SealedEnvelope({ letter, onOpen, isOpening }: {
  letter: ApiLetter; onOpen: () => void; isOpening: boolean;
}) {
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
              backgroundColor: isSceneInvite(letter) ? "rgba(243,218,202,0.75)" : "rgba(246,231,168,0.72)",
              borderWidth: 1, borderColor: "rgba(255,255,255,0.55)",
            }}>
              {isSceneInvite(letter)
                ? <Film size={16} color="#A26458" />
                : <Text style={{ fontSize: 17 }}>🌿</Text>}
            </View>
          </View>
          {isSceneInvite(letter) && (
            <View style={{ alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginBottom: 6, backgroundColor: "rgba(243,218,202,0.5)" }}>
              <Text style={{ fontSize: 10, fontWeight: "500", letterSpacing: 1, color: "#A26458" }}>场景邀请</Text>
            </View>
          )}
          <Text style={{ fontSize: 16, fontWeight: "500", marginBottom: 6, color: "#4D4249" }}>{letter.title}</Text>
          <Text style={{ fontSize: 12, marginBottom: 5, color: "#8C8187" }}>{_fmtLetterDate(letter.created_at)}</Text>
          <Text style={{ fontSize: 12, color: "#A39A9F" }} numberOfLines={1}>{letter.body.slice(0, 24)}…</Text>
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

function LetterAttachment({ attachment, saved, onSave }: {
  attachment: NonNullable<ApiLetter["attachment"]>; saved: boolean; onSave: () => void;
}) {
  return (
    <View style={{
      marginVertical: 20, borderRadius: 18, overflow: "hidden",
      backgroundColor: "rgba(249,241,204,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.55)",
    }}>
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <Music size={12} color="#B98232" />
          <Text style={{ fontSize: 12, fontWeight: "500", color: "#B98232" }}>{attachment.label ?? "信里夹了点什么"}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(246,231,168,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
          }}>
            <Text style={{ fontSize: 20 }}>🎵</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "500", color: "#4D4249" }} numberOfLines={1}>{attachment.title}</Text>
            {!!attachment.artist && <Text style={{ fontSize: 12, marginTop: 2, color: "#8C8187" }}>{attachment.artist}</Text>}
          </View>
        </View>
        {!!attachment.reason && (
          <Text style={{ fontSize: 13, marginTop: 12, lineHeight: 19, color: "#62575D" }}>{attachment.reason}</Text>
        )}
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

/** scene_invite 场景邀请卡：Film 图标 + 场景种子摘要 + 「进入场景」按钮 */
function SceneInviteCard({ attachment, onEnter, entering }: {
  attachment: SceneInviteAttachment; onEnter?: () => void; entering?: boolean;
}) {
  const seed = attachment.seed || {};
  const people = Array.isArray(seed.people) ? seed.people.filter(Boolean).join("、") : "";
  return (
    <View style={{
      marginVertical: 20, borderRadius: 18, overflow: "hidden",
      backgroundColor: "rgba(243,218,202,0.4)", borderWidth: 1, borderColor: "rgba(255,255,255,0.55)",
    }}>
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <Film size={12} color="#A26458" />
          <Text style={{ fontSize: 12, fontWeight: "500", color: "#A26458" }}>为你备好了一个小场景</Text>
        </View>
        {!!seed.title && (
          <Text style={{ fontSize: 14, fontWeight: "500", marginBottom: 6, color: "#4D4249" }}>{seed.title}</Text>
        )}
        {(!!seed.place || !!people) && (
          <Text style={{ fontSize: 12, marginBottom: 6, color: "#8C8187" }}>
            {[seed.place, people].filter(Boolean).join(" · ")}
          </Text>
        )}
        {!!seed.plot && (
          <Text style={{ fontSize: 13, lineHeight: 19, marginBottom: 12, color: "#62575D" }}>{seed.plot}</Text>
        )}
        <Pressable onPress={onEnter} disabled={!onEnter || entering}
          style={({ pressed }) => [{
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
            paddingVertical: 12, borderRadius: 999,
            backgroundColor: entering ? "rgba(243,218,202,0.4)" : "rgba(243,218,202,0.8)",
            borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
            transform: [{ scale: pressed ? 0.97 : 1 }],
          }]}>
          <Play size={12} color="#4D4249" />
          <Text style={{ fontSize: 14, fontWeight: "500", color: "#4D4249" }}>
            {entering ? "正在布置场景…" : "进入场景"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function LetterPaper({ letter, petName, saved, onAck, onReply, onSave, onEnterScene, entering }: {
  letter: ApiLetter; petName: string;
  saved: boolean; onAck: () => void; onReply: () => void; onSave: () => void;
  onEnterScene?: () => void; entering?: boolean;
}) {
  const [attachSaved, setAttachSaved] = useState(false);
  const sceneInvite = isSceneInvite(letter);
  const paras = letter.body.split("\n").filter(p => p.trim());
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
            <Text style={{ fontSize: 12, marginBottom: 4, color: "#8C8187" }}>{_fmtLetterDate(letter.created_at)}</Text>
            <Text style={{ fontSize: 20, fontWeight: "500", color: "#4D4249" }}>{letter.title}</Text>
          </View>
          <View style={{
            width: 38, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(246,231,168,0.6)", borderWidth: 1.5, borderColor: "rgba(196,149,58,0.3)", borderStyle: "dashed",
          }}>
            <Text style={{ fontSize: 18 }}>🌿</Text>
          </View>
        </View>

        <View style={{ gap: 16 }}>
          {paras.map((para, i) => (
            <Text key={i} style={{ fontSize: 15, lineHeight: 25, color: "#62575D" }}>{para}</Text>
          ))}
        </View>

        {letter.attachment && sceneInvite && (
          <SceneInviteCard attachment={letter.attachment as SceneInviteAttachment}
            onEnter={onEnterScene} entering={entering} />
        )}
        {letter.attachment && !sceneInvite && (
          <LetterAttachment attachment={letter.attachment} saved={attachSaved} onSave={() => setAttachSaved(s => !s)} />
        )}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <Text style={{ fontSize: 15, fontStyle: "italic", letterSpacing: 0.5, color: "#8C8187" }}>{petName}</Text>
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

function DailyLetterView({ letters, petName, letterState, onReply, onOpenLetter, onSaveLetter, onAckLetter, onEnterScene, entering }: {
  letters: ApiLetter[]; petName: string; letterState: LetterState;
  onReply: () => void; onOpenLetter: () => void; onSaveLetter: () => void; onAckLetter: () => void;
  onEnterScene?: (letter: ApiLetter) => void; entering?: boolean;
}) {
  const letter = letters[0] ?? null;
  const saved = letterState === "saved";
  const isOpening = letterState === "opening";
  const showEnvelope = letter != null && (letterState === "sealed" || letterState === "opening");
  const showLetter = letter != null && (letterState === "opened" || letterState === "saved");

  return (
    <View>
      {(letter == null || letterState === "waiting") && <WaitingLetterState />}
      {showEnvelope && (
        <View style={{ alignItems: "center", paddingVertical: 32 }}>
          <SealedEnvelope letter={letter} onOpen={onOpenLetter} isOpening={isOpening} />
        </View>
      )}
      {showLetter && (
        <LetterPaper letter={letter} petName={petName} saved={saved}
          onAck={onAckLetter} onReply={onReply} onSave={onSaveLetter}
          onEnterScene={onEnterScene ? () => onEnterScene(letter) : undefined}
          entering={entering} />
      )}
    </View>
  );
}

// ─── Mailbox Screen ──────────────────────────────────────────────────────────

export function MailboxScreen({ onTaskDetail, onStorageDetail, onReplyLetter, onToast, onPlayScene, petName = "你的伙伴" }: {
  onTaskDetail: () => void;
  onStorageDetail: () => void;
  onReplyLetter: () => void;
  onToast?: (msg: string) => void;
  /** 接受场景邀请后进入片场演绎（sceneId + 预设剧场 id，dynamic_image 时 theaterId 为 null） */
  onPlayScene?: (sceneId: number, theaterId: string | null) => void;
  petName?: string;
}) {
  const night = useNight();
  const C = palette(night);
  const [sec, setSec] = useState(0);
  const sections = ["桌宠来信", "今日待启", "长久珍藏", "三日寄存"];

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDate, setSelectedDate] = useState(TODAY_DATE);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAddTask, setShowAddTask] = useState(false);

  const [keepsakes, setKeepsakes] = useState<Keepsake[]>([]);
  const [selectedKeepsake, setSelectedKeepsake] = useState<Keepsake | null>(null);
  const [ephem, setEphem] = useState<any[]>([]);

  // ─── 来信（真实后端）───
  const [letters, setLetters] = useState<ApiLetter[]>([]);
  const [letterState, setLetterState] = useState<LetterState>("waiting");
  const [savedLetterIds, setSavedLetterIds] = useState<Set<number>>(new Set());

  const activeLetter = letters[0] ?? null;

  const reloadLetters = async () => {
    try {
      const list = await listLetters("");
      const arr = Array.isArray(list) ? list : [];
      setLetters(arr);
      const first = arr[0] ?? null;
      if (!first) setLetterState("waiting");
      else if (first.is_read) setLetterState(savedLetterIds.has(first.id) ? "saved" : "opened");
      else setLetterState("sealed");
    } catch { /* 网络异常保持当前 */ }
  };

  const handleOpenLetter = () => {
    if (letterState !== "sealed" || !activeLetter) return;
    setLetterState("opening");
    markLetterRead(activeLetter.id).catch(() => {});
    setLetters(ls => ls.map(l => l.id === activeLetter.id ? { ...l, is_read: true } : l));
    setTimeout(() => setLetterState("opened"), 680);
  };

  const handleSaveLetter = async () => {
    if (!activeLetter || savedLetterIds.has(activeLetter.id)) return;
    try {
      await createTreasure({
        source_type: "letter", source_id: activeLetter.id,
        title: activeLetter.title, content: activeLetter.body,
      });
      setSavedLetterIds(s => new Set(s).add(activeLetter.id));
      setLetterState("saved");
      onToast?.("已放入长久珍藏 ✦");
      reloadTreasures();
    } catch {
      onToast?.("没存上，待会儿再试试");
    }
  };

  const handleAckLetter = () => onToast?.("它知道你收到了");

  // ─── scene_invite：接受邀请 → 建场景 → 进片场 ───
  const [enteringScene, setEnteringScene] = useState(false);
  const handleEnterScene = async (letter: ApiLetter) => {
    if (enteringScene) return;
    setEnteringScene(true);
    try {
      const res = await acceptSceneInvite(letter.id);
      setLetters(ls => ls.map(l => l.id === letter.id ? { ...l, is_read: true } : l));
      if (onPlayScene) onPlayScene(res.scene_id, res.theater_id ?? null);
      else onToast?.("场景已备好，去片场看看吧");
    } catch (e: any) {
      onToast?.(e?.message || "场景没布置好，待会儿再试试");
    } finally {
      setEnteringScene(false);
    }
  };

  const dayTasks = tasks.filter(t => t.date === selectedDate);
  const reloadTasks = async () => {
    try {
      const list = await listTodos("");
      setTasks((Array.isArray(list) ? list : []).map(mapTodo));
    } catch { /* 网络异常保持当前列表 */ }
  };
  const reloadTreasures = async () => {
    try {
      const list = await listTreasures();
      setKeepsakes((Array.isArray(list) ? list : []).map(mapTreasure));
    } catch { /* 网络异常保持当前列表 */ }
  };
  const reloadEphemeral = async () => {
    try {
      const list = await listEphemeral();
      setEphem(Array.isArray(list) ? list : []);
    } catch { /* 网络异常保持当前列表 */ }
  };
  useEffect(() => { reloadTasks(); reloadTreasures(); reloadEphemeral(); reloadLetters(); }, []);

  const keepEph = (id: number) => {
    setEphem(list => list.filter(e => e.id !== id));
    keepEphemeral(id).then(reloadTreasures).catch(() => {});
  };
  const dropEph = (id: number) => {
    setEphem(list => list.filter(e => e.id !== id));
    dropEphemeral(id).catch(() => {});
  };

  const toggleTask = (id: string) => {
    let done = false;
    setTasks(ts => ts.map(t => {
      if (t.id === id) { done = !t.completed; return { ...t, completed: done }; }
      return t;
    }));
    updateTodo(Number(id), { status: done ? "done" : "pending" }).catch(() => {});
  };
  const deleteTask = (id: string) => {
    setTasks(ts => ts.filter(t => t.id !== id));
    deleteTodo(Number(id)).catch(() => {});
  };
  const addTask = async (t: Task) => {
    setTasks(ts => [...ts, t]); // 乐观追加，reload 后换成真实 id
    try {
      await createTodo({ content: t.title, surface_text: t.title, due_date: dueFrom(t.date, t.time) });
      await reloadTasks();
    } catch { /* 失败保留乐观项 */ }
  };
  const removeKeepsake = (id: string) => {
    setKeepsakes(ks => ks.filter(k => k.id !== id));
    setSelectedKeepsake(null);
    deleteTreasure(Number(id)).catch(() => {});
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12 }}>
        <Text style={{ fontSize: 26, fontWeight: "500", letterSpacing: -0.5, color: C.text }}>信箱</Text>
      </View>
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {sections.map((s, i) => {
            const unread = i === 0 ? letters.filter(l => !l.is_read).length : 0;
            return (
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
              }}>{s}{unread > 0 ? ` · ${unread}` : ""}</Text>
            </Pressable>
            );
          })}
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
          <DailyLetterView letters={letters} petName={petName} letterState={letterState}
            onOpenLetter={handleOpenLetter} onSaveLetter={handleSaveLetter}
            onAckLetter={handleAckLetter} onReply={onReplyLetter}
            onEnterScene={handleEnterScene} entering={enteringScene} />
        )}
        {sec === 2 && (
          <KeepsakeAlbum keepsakes={keepsakes} onSelectItem={setSelectedKeepsake} onRemove={removeKeepsake} />
        )}
        {sec === 3 && (
          <>
            {ephem.length === 0 && (
              <Text style={{ fontSize: 13, color: C.muted, paddingVertical: 24, textAlign: "center" }}>
                这里暂时空空的，睡前说的情绪和碎片会先在这儿待三天。
              </Text>
            )}
            {ephem.map((it) => (
              <GlassCard key={it.id} style={{ padding: 16, marginBottom: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "500", marginBottom: 6, color: C.text }}>
                  {it.surface_text || it.content}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: "rgba(246,231,168,0.65)" }}>
                    <Text style={{ fontSize: 11, color: "#655D61" }}>{it.kind}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: C.muted }}>{remainText(it.expires_at)}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable onPress={() => keepEph(it.id)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: "center", backgroundColor: "rgba(246,231,168,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" }}>
                    <Text style={{ fontSize: 13, fontWeight: "500", color: C.text }}>珍藏</Text>
                  </Pressable>
                  <Pressable onPress={() => dropEph(it.id)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: "center", backgroundColor: "rgba(221,237,227,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" }}>
                    <Text style={{ fontSize: 13, fontWeight: "500", color: C.text }}>放下</Text>
                  </Pressable>
                </View>
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
