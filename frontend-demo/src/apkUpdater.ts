/** 自有服务器 APK 更新：应用内下载，原生校验后交给 Android 系统安装器。 */
import * as FileSystem from "expo-file-system";

import type { AppVersionInfo } from "./api";
import {
  canRequestPackageInstalls,
  inspectAndInstall,
  isApkUpdaterAvailable,
  openInstallPermissionSettings,
  type ApkInstallResult,
} from "mindoff-updater";

export { isApkUpdaterAvailable };

export type ApkUpdatePhase =
  | "idle"
  | "downloading"
  | "verifying"
  | "permission_required"
  | "installer_opened"
  | "error";

export type ApkUpdateState = {
  phase: ApkUpdatePhase;
  progress: number;
  downloadedUri: string | null;
  error: string | null;
};

export const INITIAL_APK_UPDATE_STATE: ApkUpdateState = {
  phase: "idle",
  progress: 0,
  downloadedUri: null,
  error: null,
};

function safeVersion(value: string): string {
  return value.replace(/[^0-9A-Za-z._-]/g, "_") || "latest";
}

export function updateErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.replace(/^Error:\s*/i, "").trim() || "更新失败了，请稍后重试";
}

export async function downloadApkUpdate(
  info: AppVersionInfo,
  onProgress: (progress: number) => void,
): Promise<string> {
  if (!FileSystem.cacheDirectory) throw new Error("无法访问应用缓存目录");
  if (!info.apk_url) throw new Error("服务端没有提供安装包地址");

  const directory = `${FileSystem.cacheDirectory}updates/`;
  const destination = `${directory}mindoff-${safeVersion(info.latest)}.apk`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  await FileSystem.deleteAsync(destination, { idempotent: true });

  const task = FileSystem.createDownloadResumable(
    info.apk_url,
    destination,
    {},
    ({ totalBytesExpectedToWrite, totalBytesWritten }) => {
      if (totalBytesExpectedToWrite <= 0) return;
      onProgress(Math.max(0, Math.min(1, totalBytesWritten / totalBytesExpectedToWrite)));
    },
  );
  const result = await task.downloadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(destination, { idempotent: true });
    throw new Error(`安装包下载失败${result ? `（${result.status}）` : ""}`);
  }
  onProgress(1);
  return result.uri;
}

export async function installDownloadedApk(
  uri: string,
  info: AppVersionInfo,
): Promise<ApkInstallResult> {
  return inspectAndInstall(uri, info.apk_sha256, info.size_bytes);
}

export async function requestApkInstallPermission(): Promise<boolean> {
  if (await canRequestPackageInstalls()) return true;
  await openInstallPermissionSettings();
  return false;
}
