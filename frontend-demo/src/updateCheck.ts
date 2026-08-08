/**
 * 版本更新检查：比较本地包版本（expo-constants）与后端 latest。
 *
 * 仅做「有没有更新」判断；拉取/展示/下载由 App.tsx + UpdateSheet 负责。任何失败都静默（不打扰用户）。
 */
import Constants from "expo-constants";

import { getAppVersion, type AppVersionInfo } from "./api";
import { isRequiredUpdate, shouldOfferUpdate } from "./updatePolicy";

export type AvailableUpdateInfo = AppVersionInfo & { required: boolean };

/** 当前安装包版本（来自 app.json 的 expo.version，由 expo-constants 注入）。 */
export const CURRENT_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

/**
 * 检查是否有可提示的更新：latest > 当前版本。
 * 「以后再说」只关闭当前这次提示，不持久化忽略；下次进入 App 时仍会提示。
 * 有则返回版本信息，否则返回 null（无更新 / 请求失败）。
 */
export async function checkForUpdate(): Promise<AvailableUpdateInfo | null> {
  try {
    const info = await getAppVersion();
    if (!info?.latest || !shouldOfferUpdate(info.latest, CURRENT_VERSION)) return null;
    return {
      ...info,
      required: isRequiredUpdate(info, CURRENT_VERSION),
    };
  } catch {
    return null;
  }
}
