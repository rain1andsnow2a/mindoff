/**
 * MindOff 设计基础。
 *
 * Token 使用语义命名；素材色、图片蒙层和特殊场景色不放在这里。
 * 中文与拉丁文字均使用平台系统无衬线字体，因此不设置 fontFamily。
 */
import { Platform } from "react-native";

export const lightColors = {
  background: "#FCFAF7",
  backgroundSubtle: "#F4F1EC",
  surface: "#FFFDFA",
  surfaceElevated: "#FFFFFF",
  surfaceHover: "#F7F4EF",
  surfacePressed: "#F0ECE5",
  textPrimary: "#403A35",
  textSecondary: "#756C63",
  textMuted: "#9D9389",
  textOnAccent: "#4B463F",
  textOnDanger: "#FFF9F5",
  placeholder: "#9D9389",
  border: "#E8E2D8",
  divider: "#E8E2D8",
  accent: "#B8860B",
  accentSurface: "#F6E7A8",
  accentSoft: "rgba(246,225,143,0.48)",
  accentHover: "#E8D48B",
  accentPressed: "#DCC87A",
  support: "#718879",
  focus: "#C4953A",
  disabledSurface: "#EFEBE4",
  disabledText: "#AAA096",
  success: "#5E7D68",
  warning: "#A66A32",
  error: "#A8483D",
  overlay: "rgba(64,58,53,0.42)",
  scrim: "rgba(64,58,53,0.16)",
} as const;

/** 夜间模式在本轮只保证完整语义、可读性与可操作性。 */
export const darkColors: ColorTokens = {
  background: "#292630",
  backgroundSubtle: "#322E38",
  surface: "#3B3540",
  surfaceElevated: "#45404A",
  surfaceHover: "#46404B",
  surfacePressed: "#504955",
  textPrimary: "#F4EFEA",
  textSecondary: "#C5BBC1",
  textMuted: "#A399A0",
  textOnAccent: "#2F2020",
  textOnDanger: "#FFF9F5",
  placeholder: "#A399A0",
  border: "rgba(255,255,255,0.14)",
  divider: "rgba(255,255,255,0.09)",
  accent: "#D28E80",
  accentSurface: "#D28E80",
  accentSoft: "rgba(210,142,128,0.20)",
  accentHover: "#DEA092",
  accentPressed: "#BD796C",
  support: "#91A899",
  focus: "#E2C46F",
  disabledSurface: "#403A45",
  disabledText: "#7F767D",
  success: "#8EB19A",
  warning: "#D5A16B",
  error: "#E18A80",
  overlay: "rgba(12,10,14,0.68)",
  scrim: "rgba(12,10,14,0.34)",
};

export type ColorTokens = {
  [Key in keyof typeof lightColors]: string;
};

/**
 * 拟物「奶油纸面」文字色：信件/待办卡/珍藏卡等始终保持浅色纸面的表面上的文字，
 * 日夜模式同值（纸面不随主题变暗，故不属于主题 ColorTokens，与「素材色」同类）。
 * 内容强调色（音乐/场景类型色）与渐变属素材色，同样不放在主题 token 里。
 */
export const paperColors = {
  ink:     "#484145", // 纸面主文字
  ink2:    "#4D4249", // 信纸标题/主文字（偏暖）
  body:    "#62575D", // 信纸正文
  sub:     "#655D61", // 次级文字
  sub2:    "#847D72", // 次级文字（暖调）
  meta:    "#7E7479", // 日期/来源
  meta2:   "#8C8187", // 信纸元信息
  dim:     "#A39A9F", // 弱化/已完成/占位
  goldInk: "#463F3C", // 奶油胶囊按钮文字
} as const;

export const fontSizes = {
  label: 12,
  caption: 13,
  body: 15,
  bodyLarge: 16,
  sectionTitle: 19,
  pageTitle: 28,
  display: 36,
} as const;

export const fontWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
} as const;

export const lineHeights = {
  label: 16,
  caption: 19,
  body: 23,
  bodyLarge: 25,
  sectionTitle: 26,
  pageTitle: 36,
  display: 46,
} as const;

export const letterSpacings = {
  tight: -0.4,
  normal: 0,
  relaxed: 0.2,
  label: 0.4,
} as const;

export const textStyles = {
  display: {
    fontSize: fontSizes.display,
    lineHeight: lineHeights.display,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacings.tight,
  },
  pageTitle: {
    fontSize: fontSizes.pageTitle,
    lineHeight: lineHeights.pageTitle,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacings.tight,
  },
  sectionTitle: {
    fontSize: fontSizes.sectionTitle,
    lineHeight: lineHeights.sectionTitle,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacings.normal,
  },
  body: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacings.normal,
  },
  bodyStrong: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacings.normal,
  },
  caption: {
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacings.relaxed,
  },
  label: {
    fontSize: fontSizes.label,
    lineHeight: lineHeights.label,
    fontWeight: fontWeights.medium,
    letterSpacing: letterSpacings.label,
  },
} as const;

export const typography = {
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacings,
  textStyles,
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const controlHeights = {
  compact: 36,
  default: 44,
  large: 52,
} as const;

export const iconSizes = {
  small: 16,
  default: 20,
  large: 24,
} as const;

export const touchTarget = {
  minimum: 44,
} as const;

export const radii = {
  control: 12,
  card: 18,
  dialog: 20,
  pill: 999,
} as const;

const nativeShadows = {
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  soft: {
    shadowColor: "#403A35",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  floating: {
    shadowColor: "#403A35",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 8,
  },
} as const;

const webShadows = {
  none: {
    boxShadow: "none",
  },
  soft: {
    boxShadow: "0 4px 12px rgba(64,58,53,0.08)",
  },
  floating: {
    boxShadow: "0 12px 28px rgba(64,58,53,0.14)",
  },
} as const;

export const shadows =
  Platform.OS === "web" ? webShadows : nativeShadows;

export const zIndices = {
  background: -1,
  base: 0,
  navigation: 10,
  overlay: 20,
  dialog: 30,
  toast: 40,
} as const;

export const motion = {
  durations: {
    press: 150,
    state: 220,
    enter: 300,
    exit: 240,
    ambient: 3_600,
  },
  distances: {
    subtle: 4,
    standard: 12,
  },
  curves: {
    standard: [0.2, 0, 0, 1],
    emphasized: [0.2, 0.8, 0.2, 1],
    exit: [0.4, 0, 1, 1],
  },
} as const;
