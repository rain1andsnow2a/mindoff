/**
 * MindOff RN 主题：白天/夜间双套色板（移植自 mindoff-proto App.tsx 的 NK/DAY_VARS）。
 * 用法：const night = useNight(); const C = night ? NK : DAY;
 */
import React, { createContext, useContext } from "react";

export const NightCtx = createContext(false);
export const useNight = () => useContext(NightCtx);

/** 夜间色板（proto NK） */
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

/** 白天色板（proto DAY_VARS） */
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
  // 与 NK 对齐的别名，组件里统一用 C.*
  textDisabledAlias: "#B4A99C",
};

/** 统一取色：组件里用 C(night).xxx */
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

/** 主按钮奶黄 */
export const CREAM = "rgba(246,231,168,0.92)";
export const CREAM_SOFT = "rgba(246,231,168,0.55)";
export const PEACH_SOFT = "rgba(243,216,199,0.55)";
export const SAGE_SOFT = "rgba(221,237,227,0.55)";
export const GOLD_DEEP = "#C4953A";
