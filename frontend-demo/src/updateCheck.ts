/**
 * 版本更新检查：本地包版本（expo-constants）与后端 latest 语义化比较，配合「以后再说」忽略记忆。
 *
 * 仅做「有没有更新」判断；拉取/展示/下载由 App.tsx + UpdateSheet 负责。任何失败都静默（不打扰用户）。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

import { getAppVersion, type AppVersionInfo } from "./api";

/** 当前安装包版本（来自 app.json 的 expo.version，由 expo-constants 注入）。 */
export const CURRENT_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

const IGNORED_KEY = "update_ignored_version";

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
 * 检查是否有可提示的更新：latest > 当前版本，且未被「以后再说」忽略过。
 * 有则返回版本信息，否则返回 null（无更新 / 已忽略 / 请求失败）。
 */
export async function checkForUpdate(): Promise<AppVersionInfo | null> {
  try {
    const info = await getAppVersion();
    if (!info?.latest || compareVersions(info.latest, CURRENT_VERSION) <= 0) return null;
    const ignored = await AsyncStorage.getItem(IGNORED_KEY);
    if (ignored === info.latest) return null;  // 同版本点过「以后再说」，不再打扰
    return info;
  } catch {
    return null;
  }
}

/** 记住「以后再说」的版本；同版本不再弹，出更新版才再提示。 */
export async function ignoreUpdate(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(IGNORED_KEY, version);
  } catch {
    /* 忽略写入失败：最坏情况下次启动再弹一次 */
  }
}
