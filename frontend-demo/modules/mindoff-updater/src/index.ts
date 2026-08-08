/** Android 自有服务器 APK 更新的原生桥接；非 Android/未编入模块时安全降级。 */
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

export type ApkInstallStatus = "permission_required" | "installer_opened";

export type ApkInstallResult = {
  status: ApkInstallStatus;
  packageName: string;
  versionCode: number;
  versionName: string | null;
  sha256: string;
  sizeBytes: number;
};

type MindoffUpdaterModule = {
  canRequestPackageInstalls: () => Promise<boolean>;
  openInstallPermissionSettings: () => Promise<boolean>;
  inspectAndInstall: (
    fileUri: string,
    expectedSha256: string | null,
    expectedSizeBytes: number | null,
  ) => Promise<ApkInstallResult>;
};

const Native = requireOptionalNativeModule<MindoffUpdaterModule>("MindoffUpdater");

export const isApkUpdaterAvailable = Platform.OS === "android" && Native != null;

export async function canRequestPackageInstalls(): Promise<boolean> {
  return Native ? Native.canRequestPackageInstalls() : false;
}

export async function openInstallPermissionSettings(): Promise<boolean> {
  return Native ? Native.openInstallPermissionSettings() : false;
}

export async function inspectAndInstall(
  fileUri: string,
  expectedSha256?: string | null,
  expectedSizeBytes?: number | null,
): Promise<ApkInstallResult> {
  if (!Native) throw new Error("当前安装包不支持应用内更新");
  return Native.inspectAndInstall(
    fileUri,
    expectedSha256?.trim() || null,
    expectedSizeBytes && expectedSizeBytes > 0 ? expectedSizeBytes : null,
  );
}
