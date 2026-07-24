/**
 * MindOff 主题的唯一实现入口。
 *
 * 新代码使用语义化 Theme；旧页面继续通过文件底部的兼容 API 迁移。
 */
import { createContext, useContext } from "react";
import {
  darkColors,
  lightColors,
  motion,
  radii,
  shadows,
  spacing,
  typography,
  zIndices,
  type ColorTokens,
} from "./tokens";

export type ThemeMode = "light" | "dark";

export type Theme = {
  mode: ThemeMode;
  isNight: boolean;
  colors: ColorTokens;
  typography: typeof typography;
  spacing: typeof spacing;
  radii: typeof radii;
  shadows: typeof shadows;
  motion: typeof motion;
  zIndices: typeof zIndices;
};

export const NightCtx = createContext(false);
export const useNight = () => useContext(NightCtx);

/** 夜间色板（迁移期兼容旧页面）。 */
export const NK = {
  bg: "#292630",
  bg2: "#322E38",
  bg3: "#3B3340",
  glass: "rgba(255,248,244,0.08)",
  glassBorder: "rgba(255,255,255,0.14)",
  text: "#F4EFEA",
  text2: "#C5BBC1",
  text3: "#A399A0",
  textDisabled: "#7F767D",
  iconPri: "#E8E0DC",
  iconSec: "#B9AFB6",
  placeholder: "#978E95",
  lsPri: "#484145",
  lsSec: "#655D61",
  lsTer: "#7E7479",
  selected: "#E2C46F",
  unselected: "#AFA5AC",
  accentLetter: "#D2A44F",
  accentInsight: "#C0A574",
  accentScene: "#D28E80",
  gold: "#D8BC76",
  cardBg: "rgba(59,51,64,0.65)",
  cardBg2: "rgba(50,46,56,0.72)",
  divider: "rgba(255,255,255,0.08)",
  rowDivider: "rgba(255,255,255,0.07)",
  chevron: "rgba(255,255,255,0.22)",
};

/** 日间色板（迁移期兼容旧页面）。 */
export const DAY = {
  bg: "#FFFBF3",
  frameBg: "#D8D2CA",
  text: "#4B463F",
  text2: "#847D72",
  text3: "#C0B5A8",
  textDisabled: "#B4A99C",
  placeholder: "#C0B5A8",
  glass: "rgba(255,252,245,0.65)",
  glassBorder: "rgba(255,255,255,0.45)",
  cardBg: "rgba(255,252,245,0.65)",
  divider: "rgba(91,79,62,0.08)",
  rowDivider: "rgba(91,79,62,0.07)",
  chevron: "#D0C8BE",
  textDisabledAlias: "#B4A99C",
};

/**
 * 旧页面使用的色板适配器。
 * 新代码必须使用 useTheme() 的语义字段。
 */
export function palette(night: boolean) {
  return night
    ? {
        bg: NK.bg,
        text: NK.text,
        text2: NK.text2,
        text3: NK.text3,
        muted: NK.text3,
        placeholder: NK.placeholder,
        glass: NK.glass,
        glassBorder: NK.glassBorder,
        cardBg: NK.cardBg,
        divider: NK.divider,
        rowDivider: NK.rowDivider,
        chevron: NK.chevron,
        lsPri: NK.lsPri,
        lsSec: NK.lsSec,
        lsTer: NK.lsTer,
        gold: NK.gold,
      }
    : {
        bg: DAY.bg,
        text: DAY.text,
        text2: DAY.text2,
        text3: DAY.text3,
        muted: DAY.text3,
        placeholder: DAY.placeholder,
        glass: DAY.glass,
        glassBorder: DAY.glassBorder,
        cardBg: DAY.cardBg,
        divider: DAY.divider,
        rowDivider: DAY.rowDivider,
        chevron: DAY.chevron,
        lsPri: "#484145",
        lsSec: "#655D61",
        lsTer: "#7E7479",
        gold: "#D8BC76",
      };
}

const sharedThemeTokens = {
  typography,
  spacing,
  radii,
  shadows,
  motion,
  zIndices,
} as const;

export const lightTheme: Theme = {
  mode: "light",
  isNight: false,
  colors: lightColors,
  ...sharedThemeTokens,
};

export const darkTheme: Theme = {
  mode: "dark",
  isNight: true,
  colors: darkColors,
  ...sharedThemeTokens,
};

/** 新代码使用的唯一主题 Hook。 */
export function useTheme(): Theme {
  return useNight() ? darkTheme : lightTheme;
}

/** 迁移期旧组件常量。 */
export const CREAM = "rgba(246,231,168,0.92)";
export const CREAM_SOFT = "rgba(246,231,168,0.55)";
export const PEACH_SOFT = "rgba(243,216,199,0.55)";
export const SAGE_SOFT = "rgba(221,237,227,0.55)";
export const GOLD_DEEP = "#C4953A";
