/**
 * 版本更新检查：比较本地包版本（expo-constants）与后端 latest。
 *
 * 仅做「有没有更新」判断；拉取/展示/下载由 App.tsx + UpdateSheet 负责。任何失败都静默（不打扰用户）。
 */
import Constants from "expo-constants";

import { getAppVersion, type AppVersionInfo } from "./api";

/** 当前安装包版本（来自 app.json 的 expo.version，由 expo-constants 注入）。 */
export const CURRENT_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

/** 语义化比较：a>b 返回正、a<b 返回负、相等 0。非法段按 0 处理，长度不齐补 0。 */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * 检查是否有可提示的更新：latest > 当前版本。
 * 「以后再说」只关闭当前这次提示，不持久化忽略；下次进入 App 时仍会提示。
 * 有则返回版本信息，否则返回 null（无更新 / 请求失败）。
 */
export async function checkForUpdate(): Promise<AppVersionInfo | null> {
  try {
    const info = await getAppVersion();
    if (!info?.latest || compareVersions(info.latest, CURRENT_VERSION) <= 0) return null;
    return info;
  } catch {
    return null;
  }
}
