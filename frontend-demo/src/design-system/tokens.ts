/**
 * MindOff 设计基础。
 *
 * Token 使用语义命名；素材色、图片蒙层和特殊场景色不放在这里。
 * 中文与拉丁文字均使用平台系统无衬线字体，因此不设置 fontFamily。
 */
import { Platform } from "react-native";

export const lightColors = {
  background: "#F7F2E8",
  backgroundSubtle: "#EFE7DA",
  surface: "#FFFCF6",
  surfaceElevated: "#FFFFFF",
  surfaceHover: "#FAF4EA",
  surfacePressed: "#F3EADF",
  textPrimary: "#403A35",
  textSecondary: "#756C63",
  textMuted: "#9D9389",
  textOnAccent: "#FFF9F5",
  placeholder: "#9D9389",
  border: "#E4DACE",
  divider: "#E4DACE",
  accent: "#B9654A",
  accentSoft: "#F3DED3",
  accentHover: "#A9573F",
  accentPressed: "#934A36",
  support: "#718879",
  focus: "#9B4E38",
  disabledSurface: "#E9E1D7",
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
  placeholder: "#A399A0",
  border: "rgba(255,255,255,0.14)",
  divider: "rgba(255,255,255,0.09)",
  accent: "#D28E80",
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
