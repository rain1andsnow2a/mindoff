/**
 * 喵灵设计基础（HarmonyOS 版）。与 frontend-demo/src/design-system/tokens.ts 保持同值。
 *
 * Token 使用语义命名；素材色、图片蒙层和特殊场景色不放在这里。
 * 中文与拉丁文字均使用平台系统无衬线字体，因此不设置 fontFamily。
 */

export interface ColorTokens {
  background: string;
  backgroundSubtle: string;
  surface: string;
  surfaceElevated: string;
  surfaceHover: string;
  surfacePressed: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnAccent: string;
  textOnDanger: string;
  placeholder: string;
  border: string;
  divider: string;
  accent: string;
  accentSurface: string;
  accentSoft: string;
  accentHover: string;
  accentPressed: string;
  support: string;
  focus: string;
  disabledSurface: string;
  disabledText: string;
  success: string;
  warning: string;
  error: string;
  overlay: string;
  scrim: string;
}

export interface PaperColors {
  ink: string;
  ink2: string;
  body: string;
  sub: string;
  sub2: string;
  meta: string;
  meta2: string;
  dim: string;
  goldInk: string;
}

export interface FontSizes {
  label: number;
  caption: number;
  body: number;
  bodyLarge: number;
  sectionTitle: number;
  pageTitle: number;
  display: number;
}

export interface FontWeights {
  regular: FontWeight;
  medium: FontWeight;
  semibold: FontWeight;
}

export interface LineHeights {
  label: number;
  caption: number;
  body: number;
  bodyLarge: number;
  sectionTitle: number;
  pageTitle: number;
  display: number;
}

export interface LetterSpacings {
  tight: number;
  normal: number;
  relaxed: number;
  label: number;
}

export interface SpacingTokens {
  s0: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  s6: number;
  s8: number;
  s10: number;
  s12: number;
  s16: number;
}

export interface ControlHeights {
  compact: number;
  standard: number;
  large: number;
}

export interface IconSizes {
  small: number;
  standard: number;
  large: number;
}

export interface TouchTarget {
  minimum: number;
}

export interface Radii {
  control: number;
  card: number;
  dialog: number;
  pill: number;
}

export interface ZIndices {
  background: number;
  base: number;
  navigation: number;
  overlay: number;
  dialog: number;
  toast: number;
}

export interface MotionDurations {
  press: number;
  state: number;
  enter: number;
  exit: number;
  ambient: number;
}

export interface MotionDistances {
  subtle: number;
  standard: number;
}

export interface MotionTokens {
  durations: MotionDurations;
  distances: MotionDistances;
}

export const lightColors: ColorTokens = {
  background: '#FCFAF7',
  backgroundSubtle: '#F4F1EC',
  surface: '#FFFDFA',
  surfaceElevated: '#FFFFFF',
  surfaceHover: '#F7F4EF',
  surfacePressed: '#F0ECE5',
  textPrimary: '#403A35',
  textSecondary: '#756C63',
  textMuted: '#9D9389',
  textOnAccent: '#4B463F',
  textOnDanger: '#FFF9F5',
  placeholder: '#9D9389',
  border: '#E8E2D8',
  divider: '#E8E2D8',
  accent: '#B8860B',
  accentSurface: '#F6E7A8',
  accentSoft: 'rgba(246,225,143,0.48)',
  accentHover: '#E8D48B',
  accentPressed: '#DCC87A',
  support: '#718879',
  focus: '#C4953A',
  disabledSurface: '#EFEBE4',
  disabledText: '#AAA096',
  success: '#5E7D68',
  warning: '#A66A32',
  error: '#A8483D',
  overlay: 'rgba(64,58,53,0.42)',
  scrim: 'rgba(64,58,53,0.16)'
};

/** 夜间模式在本轮只保证完整语义、可读性与可操作性。 */
export const darkColors: ColorTokens = {
  background: '#292630',
  backgroundSubtle: '#322E38',
  surface: '#3B3540',
  surfaceElevated: '#45404A',
  surfaceHover: '#46404B',
  surfacePressed: '#504955',
  textPrimary: '#F4EFEA',
  textSecondary: '#C5BBC1',
  textMuted: '#A399A0',
  textOnAccent: '#2F2020',
  textOnDanger: '#FFF9F5',
  placeholder: '#A399A0',
  border: 'rgba(255,255,255,0.14)',
  divider: 'rgba(255,255,255,0.09)',
  accent: '#D28E80',
  accentSurface: '#D28E80',
  accentSoft: 'rgba(210,142,128,0.20)',
  accentHover: '#DEA092',
  accentPressed: '#BD796C',
  support: '#91A899',
  focus: '#E2C46F',
  disabledSurface: '#403A45',
  disabledText: '#7F767D',
  success: '#8EB19A',
  warning: '#D5A16B',
  error: '#E18A80',
  overlay: 'rgba(12,10,14,0.68)',
  scrim: 'rgba(12,10,14,0.34)'
};

/**
 * 拟物「奶油纸面」文字色：信件/待办卡/珍藏卡等始终保持浅色纸面的表面上的文字，
 * 日夜模式同值（纸面不随主题变暗，故不属于主题 ColorTokens，与「素材色」同类）。
 */
export const paperColors: PaperColors = {
  ink: '#484145',
  ink2: '#4D4249',
  body: '#62575D',
  sub: '#655D61',
  sub2: '#847D72',
  meta: '#7E7479',
  meta2: '#8C8187',
  dim: '#A39A9F',
  goldInk: '#463F3C'
};

export const fontSizes: FontSizes = {
  label: 12,
  caption: 13,
  body: 15,
  bodyLarge: 16,
  sectionTitle: 19,
  pageTitle: 28,
  display: 36
};

/** RN 的字符串字重映射到 ArkUI 字重；semibold(600) 取最接近的 Medium。 */
export const fontWeights: FontWeights = {
  regular: FontWeight.Regular,
  medium: FontWeight.Medium,
  semibold: FontWeight.Medium
};

export const lineHeights: LineHeights = {
  label: 16,
  caption: 19,
  body: 23,
  bodyLarge: 25,
  sectionTitle: 26,
  pageTitle: 36,
  display: 46
};

export const letterSpacings: LetterSpacings = {
  tight: -0.4,
  normal: 0,
  relaxed: 0.2,
  label: 0.4
};

export const spacing: SpacingTokens = {
  s0: 0,
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  s16: 64
};

export const controlHeights: ControlHeights = {
  compact: 36,
  standard: 44,
  large: 52
};

export const iconSizes: IconSizes = {
  small: 16,
  standard: 20,
  large: 24
};

export const touchTarget: TouchTarget = {
  minimum: 44
};

export const radii: Radii = {
  control: 12,
  card: 18,
  dialog: 20,
  pill: 999
};

/** ArkUI 阴影参数，对应 RN 侧 shadows.soft / shadows.floating。 */
export interface ShadowToken {
  radius: number;
  color: string;
  offsetX: number;
  offsetY: number;
}

export interface Shadows {
  none: ShadowToken;
  soft: ShadowToken;
  floating: ShadowToken;
}

export const shadows: Shadows = {
  none: { radius: 0, color: '#00000000', offsetX: 0, offsetY: 0 },
  soft: { radius: 12, color: 'rgba(64,58,53,0.08)', offsetX: 0, offsetY: 4 },
  floating: { radius: 28, color: 'rgba(64,58,53,0.14)', offsetX: 0, offsetY: 12 }
};

export const zIndices: ZIndices = {
  background: -1,
  base: 0,
  navigation: 10,
  overlay: 20,
  dialog: 30,
  toast: 40
};

export const motion: MotionTokens = {
  durations: {
    press: 150,
    state: 220,
    enter: 300,
    exit: 240,
    ambient: 3600
  },
  distances: {
    subtle: 4,
    standard: 12
  }
};

/** 主题对象：颜色随日夜切换，其余 token 日夜同值。 */
export interface MindTheme {
  isNight: boolean;
  colors: ColorTokens;
}

export function themeOf(isNight: boolean): MindTheme {
  return isNight
    ? { isNight: true, colors: darkColors }
    : { isNight: false, colors: lightColors };
}
