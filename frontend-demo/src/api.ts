/**
 * MindOff 前端接口层。见 backend/docs/api-design.md。
 *
 * - token 持久化：AsyncStorage 存 access/refresh，启动 loadTokens() 恢复登录态；401 自动 refresh 重试一次。
 * - 流式（聊天/倾倒/片场）：用 ./sse 的 streamSSE（expo/fetch 流式）。
 * - 普通请求：request() 带 Bearer 头 + FastAPI 错误体解析 + 15s 超时。
 *
 * ⚙️ 真机调试改 LAN_HOST 为运行后端那台电脑的 WLAN IPv4，然后重建 APK。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { streamSSE, type SSEEvent } from "./sse";

export { streamSSE };
export type { SSEEvent };

const LAN_HOST = "10.80.1.27";
// web（浏览器预览）连本机 localhost；android/iOS 真机与模拟器都连同网段的后端 LAN_HOST
export const API_BASE =
  Platform.OS === "web" ? "http://localhost:8000" : `http://${LAN_HOST}:8000`;

/** 由 API_BASE 推导 WebSocket 地址（http->ws / https->wss）。 */
export function wsUrl(path: string): string {
  return `${API_BASE.replace(/^http/, "ws")}${path}`;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export class ApiError extends Error {}

// ─── token 存储 ────────────────────────────────────────────────────────────
const TOKEN_KEY = "mindoff.tokens";
let _tokens: Tokens | null = null;

export function currentTokens(): Tokens | null {
  return _tokens;
}

/** 启动时调用：从存储恢复登录态。 */
export async function loadTokens(): Promise<Tokens | null> {
  if (_tokens) return _tokens;
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEY);
    if (raw) _tokens = JSON.parse(raw) as Tokens;
  } catch {
    /* ignore */
  }
  return _tokens;
}

export async function saveTokens(t: Tokens): Promise<void> {
  _tokens = t;
  try {
    await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

export async function clearTokens(): Promise<void> {
  _tokens = null;
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function authHeaders(): Record<string, string> {
  return _tokens ? { Authorization: `Bearer ${_tokens.access_token}` } : {};
}

// ─── 通用请求 ──────────────────────────────────────────────────────────────
function extractDetail(data: any): string | null {
  if (!data) return null;
  const d = data.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
  return null;
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function rawFetch(method: Method, path: string, body?: unknown): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body != null ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(),
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError("连接不上服务器，检查下网络或后端地址");
  } finally {
    clearTimeout(timer);
  }
}

async function tryRefresh(): Promise<boolean> {
  if (!_tokens?.refresh_token) return false;
  try {
    const res = await rawFetch("POST", "/api/v1/auth/refresh", {
      refresh_token: _tokens.refresh_token,
    });
    if (!res.ok) return false;
    const t = (await res.json()) as Tokens;
    await saveTokens(t);
    return true;
  } catch {
    return false;
  }
}

async function request<T = any>(
  method: Method,
  path: string,
  body?: unknown,
  _retried = false
): Promise<T> {
  let res = await rawFetch(method, path, body);

  if (res.status === 401 && !_retried && _tokens?.refresh_token) {
    if (await tryRefresh()) {
      res = await rawFetch(method, path, body);
    } else {
      await clearTokens();
    }
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* 空 / 非 JSON */
  }
  if (!res.ok) {
    throw new ApiError(extractDetail(data) || "出了点问题，待会儿再试试");
  }
  return data as T;
}

const get = <T = any>(p: string) => request<T>("GET", p);
const post = <T = any>(p: string, b?: unknown) => request<T>("POST", p, b);
const patch = <T = any>(p: string, b?: unknown) => request<T>("PATCH", p, b);
const put = <T = any>(p: string, b?: unknown) => request<T>("PUT", p, b);
const del = <T = any>(p: string) => request<T>("DELETE", p);

function sseUrl(path: string): string {
  return `${API_BASE}${path}`;
}
function sseHeaders(): Record<string, string> {
  return authHeaders();
}

// ─── 账号 Auth ───────────────────────────────────────────────────────────
export async function register(username: string, password: string): Promise<Tokens> {
  const t = await post<Tokens>("/api/v1/auth/register", { username, password });
  await saveTokens(t);
  return t;
}
export async function login(username: string, password: string): Promise<Tokens> {
  const t = await post<Tokens>("/api/v1/auth/login", { username, password });
  await saveTokens(t);
  return t;
}
export async function logout(): Promise<void> {
  try {
    await post("/api/v1/auth/logout");
  } catch {
    /* 无状态注销，本地清除即可 */
  }
  await clearTokens();
}
export const getMe = () => get("/api/v1/users/me");

// ─── 陪伴 / 对话 ─────────────────────────────────────────────────────────
export const getCompanionHome = () => get("/api/v1/companion/home");
export const listConversations = () => get("/api/v1/conversations");
export const createConversation = (petId: number | null, mode: string) =>
  post("/api/v1/conversations", { pet_id: petId, mode });
export const getConversation = (id: number) => get(`/api/v1/conversations/${id}`);
/** 发消息并逐字流式接收桌宠回复。onToken 拿增量，返回完整回复。 */
export async function streamChatReply(
  convId: number,
  text: string,
  onToken: (delta: string) => void
): Promise<void> {
  await streamSSE(
    sseUrl(`/api/v1/conversations/${convId}/messages?stream=true`),
    { text },
    (e: SSEEvent) => {
      if (e.event === "token" && e.data?.delta) onToken(e.data.delta);
    },
    { headers: sseHeaders() }
  );
}

// ─── 睡前倾倒 ────────────────────────────────────────────────────────────
/** 提交倾倒，逐条 item.classified + 末尾 receipt 事件。 */
export async function streamBrainDump(
  text: string,
  onEvent: (e: SSEEvent) => void
): Promise<void> {
  await streamSSE(sseUrl("/api/v1/brain-dumps"), { text }, onEvent, {
    headers: sseHeaders(),
  });
}
export const getBrainDump = (id: number) => get(`/api/v1/brain-dumps/${id}`);

// ─── 五类存储（待办等）──────────────────────────────────────────────────
export const listTodos = (q = "") => get(`/api/v1/todos${q}`);
export const createTodo = (b: any) => post("/api/v1/todos", b);
export const updateTodo = (id: number, b: any) => patch(`/api/v1/todos/${id}`, b);
export const deleteTodo = (id: number) => del(`/api/v1/todos/${id}`);
export const listIdeas = () => get("/api/v1/ideas");
export const listSummaries = () => get("/api/v1/summaries");
export const listEmotions = () => get("/api/v1/emotions");

// ─── 信箱 ────────────────────────────────────────────────────────────────
export const getMailbox = () => get("/api/v1/mailbox");
export const listLetters = (q = "") => get(`/api/v1/letters${q}`);
export const getLetter = (id: number) => get(`/api/v1/letters/${id}`);
export const markLetterRead = (id: number) => patch(`/api/v1/letters/${id}`, { read: true });
export const listEphemeral = () => get("/api/v1/ephemeral");
export const keepEphemeral = (id: number) => post(`/api/v1/ephemeral/${id}/keep`);
export const dropEphemeral = (id: number) => del(`/api/v1/ephemeral/${id}`);
export const listTreasures = () => get("/api/v1/treasures");
export const createTreasure = (b: any) => post("/api/v1/treasures", b);
export const deleteTreasure = (id: number) => del(`/api/v1/treasures/${id}`);

// ─── 片场 ────────────────────────────────────────────────────────────────
export const listSceneTemplates = () => get("/api/v1/scenes/templates");
export const listScenes = () => get("/api/v1/scenes");
export const getScene = (id: number) => get(`/api/v1/scenes/${id}`);
export const updateScene = (id: number, b: any) => patch(`/api/v1/scenes/${id}`, b);
export const listCandidates = () => get("/api/v1/candidates");
export const dismissCandidate = (id: number) => del(`/api/v1/candidates/${id}`);
/** 创建场景并逐字生成开场（token/choices/done 事件）。 */
export async function streamCreateScene(fields: any, onEvent: (e: SSEEvent) => void): Promise<void> {
  await streamSSE(sseUrl("/api/v1/scenes?stream=true"), fields, onEvent, { headers: sseHeaders() });
}
/** 确认候选并逐字揭幕开场。 */
export async function streamConfirmCandidate(id: number, onEvent: (e: SSEEvent) => void): Promise<void> {
  await streamSSE(sseUrl(`/api/v1/candidates/${id}/confirm?stream=true`), null, onEvent, {
    headers: sseHeaders(),
  });
}
/** 提交选择并逐字推进剧情。 */
export async function streamSceneChoice(
  sceneId: number,
  choiceId: string,
  onEvent: (e: SSEEvent) => void
): Promise<void> {
  await streamSSE(
    sseUrl(`/api/v1/scenes/${sceneId}/choices?stream=true`),
    { choice_id: choiceId },
    onEvent,
    { headers: sseHeaders() }
  );
}
export const calibrateScene = (id: number, roleName: string, adjustment: string) =>
  post(`/api/v1/scenes/${id}/calibrate`, { role_name: roleName, adjustment });
export const settleScene = (id: number, b: any) => post(`/api/v1/scenes/${id}/settlement`, b);

// ─── 桌宠 / 交接信 ────────────────────────────────────────────────────────
export const listPets = () => get("/api/v1/pets");
export const listPetPresets = () => get("/api/v1/pets/presets");
export const getActivePet = () => get("/api/v1/pets/active");
export const setActivePet = (petId: number | string) => put("/api/v1/pets/active", { petId });
export const listHandoffs = () => get("/api/v1/handoffs");

// ─── 记忆 / 偏好 ─────────────────────────────────────────────────────────
export const listMemories = () => get("/api/v1/memories");
export const deleteMemory = (id: number) => del(`/api/v1/memories/${id}`);
export const clearMemories = () => del("/api/v1/memories");
export const getMemoryReview = (q = "") => get(`/api/v1/memory-review${q}`);
export const getPreferences = () => get("/api/v1/preferences");
export const updatePreferences = (b: any) => patch("/api/v1/preferences", b);

// ─── 语音 ────────────────────────────────────────────────────────────────
/** 上传录音文件到 AI 网关 /ai/stt，返回 { text, usage }。 */
export async function sttOnce(
  uri: string,
  type = "wav"
): Promise<{ text: string; usage?: any }> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    const blob = await res.blob();
    form.append("file", blob, `recording.${type}`);
  } else {
    form.append("file", { uri, name: `recording.${type}`, type: `audio/${type}` } as any);
  }
  form.append("type", type);

  const res = await fetch(`${API_BASE}/ai/stt`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: form,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new ApiError(extractDetail(data) || "语音转文字失败");
  }
  return data as { text: string; usage?: any };
}
