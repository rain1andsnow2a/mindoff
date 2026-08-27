/**
 * 喵灵鸿蒙端接口层。契约与 frontend-demo/src/api.ts 一致，见 backend/docs/api-design.md。
 *
 * - token 持久化：AssetStoreKit 系统安全存储；Preferences 仅用于迁移旧版明文数据。
 * - 会话恢复：401 自动 refresh 重试一次，并发请求共享同一个 refresh 任务。
 * - 普通请求：request() 带 Bearer 头 + FastAPI 错误体解析 + 15s 超时。
 * - 流式（聊天/倾倒/片场 SSE）尚未移植，后续阶段补。
 *
 * 后端地址默认线上 Docker 实例；本地联调改 API_BASE 即可。
 */
import { http } from '@kit.NetworkKit';
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { DEBUG } from 'BuildProfile';
import { readSecureTokens, removeSecureTokens, writeSecureTokens } from './TokenStore';

/** debug 暂时连接现有服务器；release 必须配置 HTTPS 后才能发包。 */
const DEBUG_API_BASE = 'http://223.109.142.152:8000';
const RELEASE_API_BASE = '';

const TOKEN_KEY = 'mindoff.tokens';
const PREF_NAME = 'mindoff';

export const DEFAULT_TIMEOUT_MS = 15000;
/** 纯 LLM 文本（场景整理/角色整理）：一次调用几秒到几十秒。 */
export const LLM_TIMEOUT_MS = 90000;
/** LLM + 文生图：实测 60–90s，留足余量。 */
export const IMAGE_TIMEOUT_MS = 240000;

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface PetSummary {
  id: number;
  name: string;
  personality: string;
  preset_id: string | null;
}

export interface PetDetail extends PetSummary {
  tone: string;
  actions: string[];
  system_prompt: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanionInvitation {
  type: string;
  count: number;
  text: string;
}

export interface CompanionHomeResponse {
  pet: PetSummary | null;
  behavior: string;
  status_text: string;
  invitation: CompanionInvitation | null;
  server_time: string;
}

export interface ConversationSummary {
  id: number;
  mode: string;
  pet_id: number | null;
  fragment_id: number | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface EmptyResponse {
}

let _tokens: Tokens | null = null;
let _prefs: preferences.Preferences | null = null;
let _refreshTask: Promise<boolean> | null = null;

export function apiBase(): string {
  const base = DEBUG ? DEBUG_API_BASE : RELEASE_API_BASE;
  if (base.length === 0 || (!DEBUG && !base.startsWith('https://'))) {
    throw new ApiError('生产环境尚未配置安全的 HTTPS 服务地址');
  }
  return base;
}

/** 启动时调用：从系统安全存储恢复登录态，并迁移旧版 Preferences 明文 token。 */
export async function initApi(context: common.Context): Promise<void> {
  if (_prefs) {
    return;
  }
  try {
    _prefs = await preferences.getPreferences(context, { name: PREF_NAME });
    let raw = await readSecureTokens();
    const legacyRaw = _prefs.getSync(TOKEN_KEY, '') as string;
    if ((!raw || raw.length === 0) && legacyRaw.length > 0) {
      raw = legacyRaw;
      await writeSecureTokens(legacyRaw);
      _prefs.deleteSync(TOKEN_KEY);
      await _prefs.flush();
    }
    if (!raw) {
      return;
    }
    if (raw.length > 0) {
      _tokens = JSON.parse(raw) as Tokens;
    }
  } catch {
    /* 存储不可用时退化为内存态 */
  }
}

export function currentTokens(): Tokens | null {
  return _tokens;
}

export async function saveTokens(t: Tokens): Promise<void> {
  _tokens = t;
  try {
    await writeSecureTokens(JSON.stringify(t));
  } catch {
    // 安全存储失败时不回退到明文持久化，仅保留本次进程内会话。
  }
}

export async function clearTokens(): Promise<void> {
  _tokens = null;
  try {
    await removeSecureTokens();
    if (_prefs) {
      _prefs.deleteSync(TOKEN_KEY);
      await _prefs.flush();
    }
  } catch {
    /* ignore */
  }
}

/** 把后端下发的 /static 相对路径拼成可访问的绝对 URL；已是 http(s) 则原样返回。 */
export function absUrl(path: string | null): string | null {
  if (!path) {
    return null;
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${apiBase()}${path.startsWith('/') ? '' : '/'}${path}`;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (_tokens) {
    headers['Authorization'] = `Bearer ${_tokens.access_token}`;
  }
  return headers;
}

/** 解析 FastAPI 错误体里的 detail（字符串或 [{msg}] 数组两种形态）。 */
function extractDetail(data: Object | null): string | null {
  if (!data) {
    return null;
  }
  const record = data as Record<string, Object>;
  const d: Object | undefined = record['detail'];
  if (typeof d === 'string') {
    return d;
  }
  if (Array.isArray(d)) {
    const arr = d as Object[];
    if (arr.length > 0) {
      const first = arr[0] as Record<string, Object>;
      const msg: Object | undefined = first['msg'];
      if (typeof msg === 'string') {
        return msg;
      }
    }
  }
  return null;
}

interface RawResponse {
  code: number;
  text: string;
}

async function rawFetch(
  method: http.RequestMethod,
  path: string,
  body: Object | null,
  timeoutMs: number
): Promise<RawResponse> {
  const httpRequest = http.createHttp();
  const headers: Record<string, string> = authHeaders();
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    const response = await httpRequest.request(`${apiBase()}${path}`, {
      method: method,
      header: headers,
      extraData: body !== null ? JSON.stringify(body) : undefined,
      connectTimeout: Math.min(timeoutMs, 10000),
      readTimeout: timeoutMs,
      expectDataType: http.HttpDataType.STRING
    });
    const text = typeof response.result === 'string' ? response.result as string : '';
    return { code: response.responseCode, text: text };
  } catch (err) {
    // 超时与真正的网络错误要分开说，否则用户以为是断网
    const e = err as Error;
    if (e && e.message && e.message.indexOf('timed out') >= 0) {
      throw new ApiError(`等太久了（超过 ${Math.round(timeoutMs / 1000)} 秒），再试一次`);
    }
    throw new ApiError('连接不上服务器，检查下网络或后端地址');
  } finally {
    httpRequest.destroy();
  }
}

interface RefreshBody {
  refresh_token: string;
}

async function performRefresh(): Promise<boolean> {
  if (!_tokens || _tokens.refresh_token.length === 0) {
    return false;
  }
  try {
    const body: RefreshBody = { refresh_token: _tokens.refresh_token };
    const res = await rawFetch(http.RequestMethod.POST, '/api/v1/auth/refresh', body, DEFAULT_TIMEOUT_MS);
    if (res.code !== 200) {
      return false;
    }
    const t = JSON.parse(res.text) as Tokens;
    await saveTokens(t);
    return true;
  } catch {
    return false;
  }
}

async function expireSession(): Promise<void> {
  const hadSession = _tokens !== null;
  await clearTokens();
  if (hadSession) {
    const revision = AppStorage.get<number>('sessionRevision') ?? 0;
    AppStorage.setOrCreate<number>('sessionRevision', revision + 1);
  }
}

export function streamingAuthHeaders(): Record<string, string> {
  return authHeaders();
}

async function tryRefresh(): Promise<boolean> {
  if (_refreshTask) {
    return _refreshTask;
  }
  _refreshTask = performRefresh();
  try {
    return await _refreshTask;
  } finally {
    _refreshTask = null;
  }
}

/** 通用请求：Bearer 鉴权、401 自动 refresh 重试一次、FastAPI 错误体解析。 */
export async function request(
  method: http.RequestMethod,
  path: string,
  body: Object | null = null,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  retried: boolean = false
): Promise<Object> {
  let res = await rawFetch(method, path, body, timeoutMs);

  if (res.code === 401 && !retried && _tokens && _tokens.refresh_token.length > 0) {
    if (await tryRefresh()) {
      res = await rawFetch(method, path, body, timeoutMs);
    }
  }

  if (res.code === 401 && _tokens) {
    await expireSession();
  }

  let data: Object | null = null;
  if (res.text.length > 0) {
    try {
      data = JSON.parse(res.text) as Object;
    } catch {
      /* 空 / 非 JSON */
    }
  }
  if (res.code < 200 || res.code >= 300) {
    throw new ApiError(extractDetail(data) ?? '出了点问题，待会儿再试试');
  }
  if (data === null) {
    const empty: EmptyResponse = {};
    return empty;
  }
  return data;
}

const get = (p: string): Promise<Object> => request(http.RequestMethod.GET, p);
const post = (p: string, b: Object | null = null, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Object> =>
  request(http.RequestMethod.POST, p, b, timeoutMs);
const del = (p: string): Promise<Object> => request(http.RequestMethod.DELETE, p);

// ─── 账号 Auth ───────────────────────────────────────────────────────────
interface AuthBody {
  username: string;
  password: string;
}

export async function register(username: string, password: string): Promise<Tokens> {
  const body: AuthBody = { username: username, password: password };
  const t = await post('/api/v1/auth/register', body) as Tokens;
  await saveTokens(t);
  return t;
}

export async function login(username: string, password: string): Promise<Tokens> {
  const body: AuthBody = { username: username, password: password };
  const t = await post('/api/v1/auth/login', body) as Tokens;
  await saveTokens(t);
  return t;
}

export async function logout(): Promise<void> {
  try {
    await post('/api/v1/auth/logout');
  } catch {
    /* 无状态注销，本地清除即可 */
  }
  await clearTokens();
}

export const getMe = (): Promise<Object> => get('/api/v1/users/me');

// ─── 陪伴 / 对话 ─────────────────────────────────────────────────────────
export const getCompanionHome = async (): Promise<CompanionHomeResponse> =>
  await get('/api/v1/companion/home') as CompanionHomeResponse;
export const listConversations = async (): Promise<ConversationSummary[]> =>
  await get('/api/v1/conversations') as ConversationSummary[];

interface CreateConversationBody {
  pet_id: number | null;
  mode: string;
}

export const createConversation = async (petId: number | null, mode: string): Promise<ConversationSummary> => {
  const body: CreateConversationBody = { pet_id: petId, mode: mode };
  return await post('/api/v1/conversations', body) as ConversationSummary;
};

export interface ConversationMessage {
  id: number;
  role: string;
  content: string;
  created_at: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
}

export const getConversation = async (id: number): Promise<ConversationDetail> =>
  await get(`/api/v1/conversations/${id}`) as ConversationDetail;
export const deleteConversation = (id: number): Promise<Object> => del(`/api/v1/conversations/${id}`);

// ─── 信箱 ────────────────────────────────────────────────────────────────
export const getMailbox = (): Promise<Object> => get('/api/v1/mailbox');
export const listLetters = (q: string = ''): Promise<Object> => get(`/api/v1/letters${q}`);
export const listTreasures = (): Promise<Object> => get('/api/v1/treasures');

// ─── 五类存储（待办等）──────────────────────────────────────────────────
export const listTodos = (q: string = ''): Promise<Object> => get(`/api/v1/todos${q}`);

// ─── 片场 ────────────────────────────────────────────────────────────────
export const listScenes = (): Promise<Object> => get('/api/v1/scenes');

// ─── 桌宠 ────────────────────────────────────────────────────────────────
export const listPets = async (): Promise<PetDetail[]> => await get('/api/v1/pets') as PetDetail[];
export const getActivePet = async (): Promise<PetDetail> => await get('/api/v1/pets/active') as PetDetail;

/** 应用版本发布信息（公开接口，启动检查更新）。 */
export interface AppVersionInfo {
  latest: string;
  min_supported: string;
  version_code: number | null;
  apk_url: string;
  apk_sha256: string;
  size_bytes: number | null;
  size_mb: number | null;
  mandatory: boolean;
  changelog: string[];
}

export const getAppVersion = (): Promise<Object> => get('/api/v1/app/version');
