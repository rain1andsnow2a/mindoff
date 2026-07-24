/**
 * 后端对接：账号 Auth（/api/v1/auth）。见 backend/docs/api-design.md §A。
 * 仅用户名 + 密码。成功返回 { access_token, refresh_token, token_type }。
 *
 * ⚙️ API_BASE 按运行环境改：
 *   · Web / iOS 模拟器：http://localhost:8000
 *   · Android 模拟器：http://10.0.2.2:8000（本文件已自动切换）
 *   · 真机调试：改成运行后端那台电脑的局域网 IP，如 http://192.168.1.23:8000
 *   （后端默认 uvicorn 端口 8000；若用 --port 8010 启动，这里同步改端口）
 */
import { Platform } from "react-native";

// 局域网真机调试：改成运行后端那台电脑的 WLAN IPv4（电脑 `ipconfig` 里 WLAN 的地址）。
// 换网络 / IP 变了就改这一行，然后重新构建 APK。
const LAN_HOST = "10.80.13.7";

export const API_BASE =
  Platform.OS === "android" ? `http://${LAN_HOST}:8000` : "http://localhost:8000";

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

class ApiError extends Error {}

async function postJson(path: string, body: unknown): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError("连接不上服务器，检查下网络或后端地址");
  } finally {
    clearTimeout(timer);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* 空/非 JSON 响应 */
  }

  if (!res.ok) {
    throw new ApiError(extractDetail(data) || "出了点问题，待会儿再试试");
  }
  return data;
}

/** FastAPI 错误体：普通是 {detail: string}，校验失败是 {detail: [{msg,...}]} */
function extractDetail(data: any): string | null {
  if (!data) return null;
  const d = data.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
  return null;
}

export function register(username: string, password: string): Promise<Tokens> {
  return postJson("/api/v1/auth/register", { username, password });
}

export function login(username: string, password: string): Promise<Tokens> {
  return postJson("/api/v1/auth/login", { username, password });
}
