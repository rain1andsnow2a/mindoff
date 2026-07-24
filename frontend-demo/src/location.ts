/**
 * 定位上报：登录后取一次模糊位置 + 反查城市，上报后端（供天气/环境上下文）。
 *
 * best-effort：无定位权限 / 定位失败一律静默，绝不阻断使用。仅真机有效
 * （web / 未授权时 expo-location 返回空或抛错，均被吞掉）。
 */
import * as Location from "expo-location";

import { reportLocation } from "./api";

export async function reportCurrentLocation(): Promise<void> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const { latitude, longitude } = pos.coords;
    let city: string | undefined;
    try {
      const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
      city = geo[0]?.city || geo[0]?.subregion || geo[0]?.region || undefined;
    } catch {
      /* 反查城市失败也照样上报坐标（后端能按经纬度查天气） */
    }
    await reportLocation(latitude, longitude, city);
  } catch {
    /* 定位失败静默，不影响其它功能 */
  }
}
