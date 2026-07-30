/**
 * 信箱主屏 + 任务详情 + 寄存详情。
 * 四个分区（来信/待办/珍藏/寄存）在窄屏用横向 Chip、宽屏用左侧栏切换。
 */
import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Archive, Check, ChevronLeft, Star } from "lucide-react-native";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  PageContainer,
  PageHeader,
  useResponsive,
} from "../../design-system";
import {
  acceptSceneInvite, ackLetter, createTodo, createTreasure, deleteTodo, deleteTreasure,
  dropEphemeral, keepEphemeral, listEphemeral, listLetters, listTodos, listTreasures,
  markLetterRead, updateTodo,
} from "../../api";
import {
  ApiLetter, Keepsake, LetterState, Task, TODAY_DATE,
  dueFrom, mapTodo, mapTreasure, remainText, useMailboxSurface,
} from "./shared";
import { AddTaskSheet, DailyTaskList, WeekNavigator } from "./TasksTab";
import { KeepsakeAlbum, KeepsakeDetail } from "./Keepsakes";
import { DailyLetterView } from "./Letters";

/** 信箱主屏：聚合来信/今日待启/长久珍藏/三日寄存四个分区。 */
export function MailboxScreen({ onTaskDetail, onStorageDetail, onReplyLetter, onToast, onPlayScene, petName = "你的伙伴" }: {
  onTaskDetail: () => void;
  onStorageDetail: () => void;
  onReplyLetter: (letter: { title: string; body: string } | null) => void;
  onToast?: (msg: string) => void;
  /** 接受场景邀请后进入片场演绎（sceneId + 预设剧场 id，dynamic_image 时 theaterId 为 null） */
  onPlayScene?: (sceneId: number, theaterId: string | null) => void;
  petName?: string;
}) {
  const { theme, C } = useMailboxSurface();
  const { isExpanded } = useResponsive();
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
  const [ackingLetter, setAckingLetter] = useState(false);
  const [ackedLetterIds, setAckedLetterIds] = useState<Set<number>>(new Set());
  // 拆信动画计时器：卸载时清理，避免卸载后 setState
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (openTimer.current) clearTimeout(openTimer.current); }, []);

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
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setLetterState("opened"), 680);
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

  const handleAckLetter = async () => {
    if (!activeLetter || ackingLetter || ackedLetterIds.has(activeLetter.id)) return;
    setAckingLetter(true);
    try {
      const res = await ackLetter(activeLetter.id);
      setAckedLetterIds(s => new Set(s).add(activeLetter.id));
      onToast?.(res.message || "它知道你收到了");
    } catch {
      onToast?.("它知道你收到了");
    } finally {
      setAckingLetter(false);
    }
  };

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

  const unreadLetters = letters.filter(l => !l.is_read).length;
  const sectionContent = (
    <>
      {sec === 1 && (
        <>
          <WeekNavigator weekOffset={weekOffset} selectedDate={selectedDate}
            onWeekChange={d => setWeekOffset(o => o + d)} onSelectDate={setSelectedDate} tasks={tasks} />
          <DailyTaskList selectedDate={selectedDate} tasks={dayTasks}
            onToggle={toggleTask} onDelete={deleteTask} onAdd={() => setShowAddTask(true)} />
          <Button variant="ghost" onPress={onTaskDetail}>查看任务详情示例</Button>
        </>
      )}
        {sec === 0 && (
          <DailyLetterView letters={letters} petName={petName} letterState={letterState}
            onOpenLetter={handleOpenLetter} onSaveLetter={handleSaveLetter}
            onAckLetter={handleAckLetter} acking={ackingLetter} ackedIds={ackedLetterIds}
            onReply={() => onReplyLetter(activeLetter ? { title: activeLetter.title, body: activeLetter.body } : null)}
            onEnterScene={handleEnterScene} entering={enteringScene} />
      )}
      {sec === 2 && (
        <KeepsakeAlbum keepsakes={keepsakes} onSelectItem={setSelectedKeepsake} onRemove={removeKeepsake} />
      )}
      {sec === 3 && (
        <>
          {ephem.length === 0 && (
            <EmptyState
              icon={<Archive color={theme.colors.textMuted} size={24} />}
              title="暂时没有寄存"
              description="睡前说的情绪和碎片会先在这里待三天。"
            />
          )}
          {ephem.map((it) => (
            <Card key={it.id} style={{ marginBottom: theme.spacing[3] }}>
              <Text style={[theme.typography.textStyles.bodyStrong, { marginBottom: theme.spacing[2], color: C.text }]}>
                {it.surface_text || it.content}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2], marginBottom: theme.spacing[3] }}>
                <Chip>{it.kind}</Chip>
                <Text style={[theme.typography.textStyles.caption, { color: C.muted }]}>{remainText(it.expires_at)}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: theme.spacing[3] }}>
                <View style={{ flex: 1 }}><Button fullWidth onPress={() => keepEph(it.id)}>珍藏</Button></View>
                <View style={{ flex: 1 }}><Button fullWidth variant="secondary" onPress={() => dropEph(it.id)}>放下</Button></View>
              </View>
            </Card>
          ))}
          {ephem.length > 0 ? <Button variant="ghost" onPress={onStorageDetail}>查看寄存详情示例</Button> : null}
        </>
      )}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <PageContainer maxWidth={1180}>
          <PageHeader
            eyebrow="日常收纳"
            title="信箱"
            description="来信、待办和想留下的片段，都安静地收在这里。"
          />
          {!isExpanded ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing[2], paddingBottom: theme.spacing[5] }}>
              {sections.map((s, i) => (
                <Chip key={s} selected={sec === i} onPress={() => setSec(i)}>
                  {s}{i === 0 && unreadLetters > 0 ? ` · ${unreadLetters}` : ""}
                </Chip>
              ))}
            </ScrollView>
          ) : null}
          <View style={{ flexDirection: isExpanded ? "row" : "column", alignItems: "flex-start", gap: theme.spacing[6] }}>
            {isExpanded ? (
              <Card style={{ width: 260, padding: theme.spacing[2] }}>
                {sections.map((s, i) => (
                  <Pressable
                    key={s}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: sec === i }}
                    onPress={() => setSec(i)}
                    style={({ pressed }) => ({
                      minHeight: 52,
                      paddingHorizontal: theme.spacing[4],
                      borderRadius: theme.radii.control,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: sec === i ? theme.colors.accentSoft : pressed ? theme.colors.surfacePressed : "transparent",
                    })}
                  >
                    <Text style={[theme.typography.textStyles.bodyStrong, { color: sec === i ? theme.colors.accent : theme.colors.textSecondary }]}>
                      {s}
                    </Text>
                    {i === 0 && unreadLetters > 0 ? <Chip>{unreadLetters}</Chip> : null}
                  </Pressable>
                ))}
              </Card>
            ) : null}
            <Card style={{ flex: 1, width: "100%", minWidth: 0 }}>
              {sectionContent}
            </Card>
          </View>
        </PageContainer>
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

/** 任务详情示例屏。 */
export function TaskDetail({ onBack }: { onBack: () => void }) {
  const { theme, C } = useMailboxSurface();
  const [done, setDone] = useState(false);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <PageContainer maxWidth={760}>
        <PageHeader
          action={<IconButton accessibilityLabel="返回信箱" icon={<ChevronLeft color={theme.colors.textSecondary} size={20} />} onPress={onBack} />}
          eyebrow="今日待启"
          title="与朋友的约定"
          description="下午 3:00 · 你昨晚提到担心会迟到"
        />
        <View style={{ gap: theme.spacing[4] }}>
        <Card>
          <Text style={{ fontSize: 28, marginBottom: 12 }}>📅</Text>
          <Text style={[theme.typography.textStyles.body, { color: C.text2 }]}>昨晚你说起这件事，有点担心来不及。我帮你留着了。</Text>
        </Card>
        <Pressable onPress={() => setDone(!done)}
          style={({ pressed }) => ({
            padding: theme.spacing[4], borderRadius: theme.radii.card, flexDirection: "row", alignItems: "center", gap: theme.spacing[3],
            backgroundColor: done ? theme.colors.accentSoft : pressed ? theme.colors.surfacePressed : theme.colors.surface,
            borderWidth: 1, borderColor: done ? theme.colors.accentSoft : theme.colors.border,
            transform: [{ scale: pressed ? 0.99 : 1 }],
          })}>
          <View style={{
            width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center",
            backgroundColor: done ? theme.colors.accentSurface : "transparent",
            borderWidth: 2, borderColor: done ? theme.colors.accent : theme.colors.border,
          }}>
            {done && <Check size={12} color={theme.colors.textOnAccent} />}
          </View>
          <Text style={[theme.typography.textStyles.bodyStrong, { color: C.text, textDecorationLine: done ? "line-through" : "none" }]}>
            {done ? "已完成，做到了" : "标记为完成"}
          </Text>
        </Pressable>
        {done && (
          <Card style={{ alignItems: "center", backgroundColor: theme.colors.accentSoft }}>
            <Text style={[theme.typography.textStyles.body, { color: C.text }]}>做完了，今天又少了一件事 🌿</Text>
          </Card>
        )}
        </View>
      </PageContainer>
    </ScrollView>
  );
}

/** 三日寄存详情示例屏。 */
export function StorageDetail({ onBack }: { onBack: () => void }) {
  const { theme, C } = useMailboxSurface();
  const [action, setAction] = useState<"none" | "treasure" | "release">("none");
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <PageContainer maxWidth={760}>
        <PageHeader
          action={<IconButton accessibilityLabel="返回信箱" icon={<ChevronLeft color={theme.colors.textSecondary} size={20} />} onPress={onBack} />}
          eyebrow="三日寄存"
          title="那次和妈妈的通话"
          description="有些感受不必立刻决定去留。"
        />
        <View style={{ gap: theme.spacing[4] }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Chip>情绪</Chip>
            <Text style={[theme.typography.textStyles.caption, { color: C.muted }]}>1天后到期</Text>
          </View>
          <Text style={[theme.typography.textStyles.body, { color: C.text2 }]}>
            昨晚说到你们的对话，你有点担心她最近的状态。这个感受被我留在这里了，三天后如果你没有更多想说的，我会轻轻放下它。
          </Text>
        </Card>
        {action === "none" && (
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable onPress={() => setAction("treasure")}
              style={({ pressed }) => [{
                flex: 1, paddingVertical: 16, borderRadius: 20, alignItems: "center", gap: 8,
                backgroundColor: theme.colors.accentSoft, borderWidth: 1, borderColor: theme.colors.border,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              }]}>
              <Star size={20} color={theme.colors.accent} />
              <Text style={{ fontSize: 14, fontWeight: "500", color: C.text }}>珍藏</Text>
            </Pressable>
            <Pressable onPress={() => setAction("release")}
              style={({ pressed }) => [{
                flex: 1, paddingVertical: 16, borderRadius: 20, alignItems: "center", gap: 8,
                backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              }]}>
              <Archive size={20} color={theme.colors.support} />
              <Text style={{ fontSize: 14, fontWeight: "500", color: C.text }}>放下</Text>
            </Pressable>
          </View>
        )}
        {action !== "none" && (
          <Card style={{
            padding: 20, alignItems: "center",
            backgroundColor: action === "treasure" ? theme.colors.accentSoft : theme.colors.surface,
          }}>
            <Text style={{ fontSize: 22, marginBottom: 8 }}>{action === "treasure" ? "⭐" : "🌊"}</Text>
            <Text style={{ fontSize: 14, color: C.text }}>
              {action === "treasure" ? "已加入长久珍藏" : "已轻轻放下，谢谢你把它告诉我"}
            </Text>
          </Card>
        )}
        </View>
      </PageContainer>
    </ScrollView>
  );
}
