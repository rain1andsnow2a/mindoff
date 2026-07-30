/**
 * 今日待启：周导航 + 单条任务行 + 已完成折叠 + 添加浮层 + 当日列表。
 */
import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react-native";
import { Button, ResponsiveOverlay, paperColors } from "../../design-system";
import {
  DAY_CN,
  Task,
  TODAY_DATE,
  WEEKDAYS_CN,
  getMondayOf,
  parseISO,
  shiftDays,
  toISO,
  useMailboxSurface,
} from "./shared";

/** 周视图导航：切换周、选中某天，并按待办数量显示圆点。 */
function WeekNavigator({ weekOffset, selectedDate, onWeekChange, onSelectDate, tasks }: {
  weekOffset: number; selectedDate: string;
  onWeekChange: (d: number) => void; onSelectDate: (s: string) => void;
  tasks: Task[];
}) {
  const { night, C } = useMailboxSurface();
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
              <Text style={{ fontSize: 10, marginBottom: 2, color: sel ? (night ? paperColors.meta : paperColors.sub2) : (night ? "#A399A0" : "#C0B5A8") }}>
                {WEEKDAYS_CN[i]}
              </Text>
              <Text style={{
                fontSize: 14, fontWeight: "500",
                color: sel ? (night ? paperColors.ink : "#4B463F") : tod ? (night ? "#C5BBC1" : paperColors.sub2) : C.text,
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

/** 单条任务行：勾选完成 / 展开编辑·删除动作。 */
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
          {task.completed && <Check size={11} color={paperColors.ink} />}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: 14, fontWeight: "500", lineHeight: 20,
            color: task.completed ? paperColors.dim : paperColors.ink,
            textDecorationLine: task.completed ? "line-through" : "none",
          }}>
            {task.title}
          </Text>
          <Text style={{ fontSize: 11, marginTop: 2, color: paperColors.meta }}>{task.source}</Text>
        </View>
        {!!task.time && !actionsOpen && (
          <Text style={{ fontSize: 12, color: paperColors.dim }}>{task.time}</Text>
        )}
        <Pressable onPress={() => setActionsOpen(v => !v)}
          style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: paperColors.meta, fontSize: 13, letterSpacing: 1 }}>···</Text>
        </Pressable>
      </View>
      {actionsOpen && (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingHorizontal: 8, paddingTop: 6 }}>
          <Pressable onPress={() => setActionsOpen(false)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,252,245,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" }}>
            <Text style={{ fontSize: 12, color: paperColors.sub }}>编辑</Text>
          </Pressable>
          <Pressable onPress={() => { onDelete(); setActionsOpen(false); }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(243,216,199,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" }}>
            <Text style={{ fontSize: 12, color: paperColors.sub }}>删除</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** 「今天完成了 N 件」折叠区。 */
function CompletedTasksSection({ tasks }: { tasks: Task[] }) {
  const { C } = useMailboxSurface();
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
            <Check size={9} color={paperColors.ink} />
          </View>
          <Text style={{ fontSize: 13, flex: 1, color: C.muted, textDecorationLine: "line-through" }} numberOfLines={1}>{t.title}</Text>
        </View>
      ))}
    </View>
  );
}

/** 添加任务浮层：标题 + 可选时间 → 落到指定日期。 */
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
    <ResponsiveOverlay visible={visible} onClose={onClose} title="添加一件事">
      <View style={{ paddingHorizontal: 20, paddingBottom: 32, gap: 16, paddingTop: 4 }}>
        <TextInput
          value={title} onChangeText={setTitle}
          placeholder="要做什么…" placeholderTextColor={paperColors.dim}
          style={{
            paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, fontSize: 15,
            backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", color: paperColors.ink,
          }}
          onSubmitEditing={commit} autoFocus
        />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, flex: 1,
            backgroundColor: "rgba(246,231,168,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)",
          }}>
            <Text style={{ fontSize: 13 }}>📅</Text>
            <Text style={{ fontSize: 14, color: paperColors.ink }}>{label}</Text>
          </View>
          <TextInput
            value={time} onChangeText={setTime}
            placeholder="时间（可选）" placeholderTextColor={paperColors.dim}
            style={{
              flex: 1, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, fontSize: 14,
              backgroundColor: "rgba(255,252,245,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", color: paperColors.ink,
            }}
          />
        </View>
        <Button onPress={commit} fullWidth disabled={!title.trim()}>放到这一天</Button>
      </View>
    </ResponsiveOverlay>
  );
}

/** 当日任务列表：标题栏 + 空态 + 活动任务 + 已完成折叠。 */
export function DailyTaskList({ selectedDate, tasks, onToggle, onDelete, onAdd }: {
  selectedDate: string; tasks: Task[];
  onToggle: (id: string) => void; onDelete: (id: string) => void; onAdd: () => void;
}) {
  const { C } = useMailboxSurface();
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
          <Plus size={12} color={paperColors.goldInk} />
          <Text style={{ fontSize: 13, fontWeight: "500", color: paperColors.goldInk }}>添加</Text>
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
            <Text style={{ fontSize: 13, color: paperColors.goldInk }}>添加一件事</Text>
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

export { WeekNavigator, AddTaskSheet };
