import { useState, useEffect, useRef, createContext, useContext } from "react";
import { motion, AnimatePresence } from "motion/react";

// ─── Night Mode Context & Palette ────────────────────────────────────────────

const NightCtx = createContext(false);
const useNight = () => useContext(NightCtx);

const NK = {
  // Backgrounds
  bg:   "#292630",
  bg2:  "#322E38",
  bg3:  "#3B3340",
  // Glass surfaces
  glass:        "rgba(255,248,244,0.08)",
  glassBorder:  "rgba(255,255,255,0.14)",
  glassShadow:  "0 12px 40px rgba(10,8,14,0.20)",
  // ── Night Text: dark background surfaces ──────────────────────────────────
  text:         "#F4EFEA",   // Primary   — page titles, important body
  text2:        "#C5BBC1",   // Secondary — captions, status, summaries
  text3:        "#A399A0",   // Tertiary  — dates, sources, aux info
  textDisabled: "#7F767D",   // Disabled  — truly inactive only
  iconPri:      "#E8E0DC",   // Icon / Primary
  iconSec:      "#B9AFB6",   // Icon / Secondary
  placeholder:  "#978E95",   // Input placeholder
  // ── Night Text: light glass / cream paper surfaces ────────────────────────
  lsPri:  "#484145",         // Light Surface / Primary  — card titles
  lsSec:  "#655D61",         // Light Surface / Secondary — body, excerpts
  lsTer:  "#7E7479",         // Light Surface / Tertiary  — dates, sources
  lsDis:  "#A39A9F",         // Light Surface / Disabled
  lsIcon: "#625A5F",         // Light Surface / Icon
  // ── Deep glass selected state ─────────────────────────────────────────────
  selected:    "#E2C46F",    // Selected tab / active icon
  unselected:  "#AFA5AC",    // Unselected icon in deep glass
  // ── Type accent — on dark backgrounds (brighter) ──────────────────────────
  accentLetter:  "#D2A44F",
  accentInsight: "#C0A574",
  accentScene:   "#D28E80",
  accentMusic:   "#AFA0D2",
  accentQuote:   "#BEB1B8",
  // Accent gold pill
  gold:    "#D8BC76",
  // Cards
  cardBg:  "rgba(59,51,64,0.65)",
  cardBg2: "rgba(50,46,56,0.72)",
  // Misc
  divider:  "rgba(255,255,255,0.08)",
  warmGlow: "rgba(221,199,143,0.12)",
  warmGlow2:"rgba(195,143,128,0.09)",
};

// CSS custom properties injected at root — all theme-switchable colors live here
const NIGHT_VARS: React.CSSProperties = {
  "--text-primary":      NK.text,
  "--text-secondary":    NK.text2,
  "--text-muted":        NK.text3,
  "--text-disabled":     NK.textDisabled,
  "--icon-primary":      NK.iconPri,
  "--icon-secondary":    NK.iconSec,
  "--placeholder-color": NK.placeholder,
  "--glass-surface":     NK.glass,
  "--glass-border":      NK.glassBorder,
  "--card-bg":           NK.cardBg,
  "--divider":           NK.divider,
  "--row-divider":       "rgba(255,255,255,0.07)",
  "--chevron":           "rgba(255,255,255,0.22)",
} as React.CSSProperties;

const DAY_VARS: React.CSSProperties = {
  "--text-primary":      "#4B463F",
  "--text-secondary":    "#847D72",
  "--text-muted":        "#C0B5A8",
  "--text-disabled":     "#B4A99C",
  "--icon-primary":      "#4B463F",
  "--icon-secondary":    "#847D72",
  "--placeholder-color": "#C0B5A8",
  "--glass-surface":     "rgba(255,252,245,0.65)",
  "--glass-border":      "rgba(255,255,255,0.45)",
  "--card-bg":           "rgba(255,252,245,0.65)",
  "--divider":           "rgba(91,79,62,0.08)",
  "--row-divider":       "rgba(91,79,62,0.07)",
  "--chevron":           "#D0C8BE",
} as React.CSSProperties;
import {
  MessageCircle, Mail, Film, User, Mic, Send, Plus, X,
  ChevronLeft, ChevronRight, Check, Moon, Sun, Clock,
  Archive, Bell, Shield, RotateCcw, Star, Type, Layers,
  Music, Play, Heart, SlidersHorizontal, MapPin,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "companion" | "mailbox" | "scene" | "profile";
type LetterState = "waiting" | "sealed" | "opening" | "opened" | "saved";

const LETTER_DATA = {
  date: "7月24日 · 星期五",
  greeting: "晚上好呀",
  from: "桐桐",
  fromEmoji: "🌿",
  deliveryTime: "7月24日 · 晚上 9:30 送达",
  preview: "今天也有一些话想告诉你",
  body: [
    "我记得你今天一直在推进那件很重要的事情，好像没有给自己留下多少喘气的时间。你已经做得比自己感觉到的更多了。",
    "如果今晚还是有点紧绷，也不用急着把所有事情想明白。先在这里坐一会儿，我会陪着你。",
    "我还给你夹了一首很慢的歌，希望它能替我抱抱你。",
  ],
  attachment: {
    label: "信里夹了一首歌",
    title: "Bloom",
    artist: "ODESZA",
    reason: "旋律很慢，适合把今天一点点放下来。",
  },
};

type Screen =
  | "onboard-1" | "onboard-2" | "onboard-3" | "onboard-4"
  | "companion" | "chat" | "sleep-dump" | "processing" | "receipt"
  | "mailbox" | "task-detail" | "storage-detail"
  | "scene" | "scene-create" | "scene-play" | "scene-end"
  | "profile" | "pet-change" | "pet-handoff";

// ─── Mist Background ─────────────────────────────────────────────────────────

function MistBackground({ night = false }: { night?: boolean }) {
  const dayOrbs = [
    { c: "#F6E7A8", x: 8,   y: -8,  s: 72 },
    { c: "#F3D8C7", x: 58,  y: 58,  s: 78 },
    { c: "#DDEDE3", x: -4,  y: 48,  s: 62 },
    { c: "#DFE7F5", x: 48,  y: 4,   s: 58 },
    { c: "#E9E4F3", x: 68,  y: 22,  s: 52 },
  ];
  const nightOrbs = [
    { c: "rgba(89,70,83,0.82)",  x: 8,   y: -8,  s: 72 },
    { c: "rgba(59,51,64,0.88)",  x: 58,  y: 58,  s: 78 },
    { c: "rgba(50,46,56,0.92)",  x: -4,  y: 48,  s: 62 },
    { c: "rgba(41,38,48,0.90)",  x: 48,  y: 4,   s: 58 },
    { c: "rgba(69,58,72,0.75)",  x: 68,  y: 22,  s: 52 },
    { c: "rgba(221,199,143,0.09)", x: 40, y: 30,  s: 60 },
  ];
  const orbs = night ? nightOrbs : dayOrbs;
  const names = ["mist1","mist2","mist3","mist4","mist5"];
  const durs  = ["18s","22s","16s","20s","24s"];
  const dels  = ["0s","-6s","-3s","-9s","-12s"];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes mist1{0%,100%{transform:translate(-50%,-50%) scale(1)}40%{transform:translate(calc(-50% + 9px),calc(-50% + 13px)) scale(1.04)}70%{transform:translate(calc(-50% - 11px),calc(-50% + 5px)) scale(0.96)}}
        @keyframes mist2{0%,100%{transform:translate(-50%,-50%) scale(1)}25%{transform:translate(calc(-50% - 13px),calc(-50% + 9px)) scale(1.03)}75%{transform:translate(calc(-50% + 9px),calc(-50% - 7px)) scale(0.97)}}
        @keyframes mist3{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(calc(-50% + 11px),calc(-50% - 13px)) scale(1.05)}}
        @keyframes mist4{0%,100%{transform:translate(-50%,-50%) scale(1)}40%{transform:translate(calc(-50% - 7px),calc(-50% + 15px)) scale(0.98)}80%{transform:translate(calc(-50% + 5px),calc(-50% - 7px)) scale(1.02)}}
        @keyframes mist5{0%,100%{transform:translate(-50%,-50%) scale(1)}60%{transform:translate(calc(-50% + 15px),calc(-50% + 7px)) scale(1.03)}}
        @keyframes typingDot{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
        @keyframes fragmentIn{from{opacity:0;transform:translate(var(--fx),var(--fy)) scale(0.75)}to{opacity:0.75;transform:translate(0,0) scale(1)}}
        @keyframes fragmentOut{from{opacity:0.75}to{opacity:0;transform:translateY(20px) scale(0.85)}}
      `}</style>
      {orbs.map((o, i) => (
        <div key={i} style={{
          position: "absolute", left: `${o.x}%`, top: `${o.y}%`,
          width: `${o.s}%`, height: `${o.s}%`,
          background: o.c, borderRadius: "50%", filter: "blur(88px)",
          opacity: 0.62,
          animation: `${names[i]} ${durs[i]} ${dels[i]} infinite ease-in-out`,
        }}/>
      ))}
    </div>
  );
}

// ─── Pet Placeholder ─────────────────────────────────────────────────────────

function PetPlaceholder({ size = 200 }: { size?: number }) {
  const night = useNight();
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="absolute rounded-full" style={{
        width: size * 1.55, height: size * 1.55,
        background: night
          ? "radial-gradient(circle, rgba(221,199,143,0.22) 0%, transparent 65%)"
          : "radial-gradient(circle, rgba(246,231,168,0.32) 0%, transparent 65%)",
        top: "50%", left: "50%", transform: "translate(-50%,-50%)",
      }}/>
      <div className="rounded-full flex flex-col items-center justify-center" style={{
        width: size, height: size,
        background: night ? "rgba(59,51,64,0.45)" : "rgba(255,252,245,0.7)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: night ? "1.5px solid rgba(255,255,255,0.10)" : "1.5px solid rgba(255,255,255,0.55)",
        boxShadow: night ? "0 16px 48px rgba(10,8,14,0.20)" : "0 16px 48px rgba(121,100,72,0.08)",
      }}>
        <div style={{ fontSize: size * 0.3 }}>🌿</div>
        <div style={{ fontSize: size * 0.072, color: night ? NK.text3 : "#C0B5A8", marginTop: size * 0.04, letterSpacing: "0.03em" }}>
          Pet Artwork
        </div>
      </div>
    </div>
  );
}

// ─── Glass Card ──────────────────────────────────────────────────────────────

function GlassCard({ children, className = "", style = {}, onClick }: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const night = useNight();
  return (
    <div
      className={`rounded-[24px] ${onClick ? "cursor-pointer active:scale-[0.97] transition-transform duration-100" : ""} ${className}`}
      style={{
        background: night ? NK.cardBg : "rgba(255,252,245,0.65)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        border: night ? `1px solid ${NK.glassBorder}` : "1px solid rgba(255,255,255,0.45)",
        boxShadow: night ? "0 8px 32px rgba(10,8,14,0.16)" : "0 8px 32px rgba(121,100,72,0.07)",
        ...style,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ─── Cream Ripple (3 ritual moments only) ────────────────────────────────────

function CreamRipple({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 20 }}>
          {[{ scale: 3.2, opacity: 0.55, dur: 0.54 }, { scale: 4.8, opacity: 0.28, dur: 0.65 }].map((r, i) => (
            <motion.div key={i}
              initial={{ scale: 0, opacity: r.opacity }}
              animate={{ scale: r.scale, opacity: 0 }}
              transition={{ duration: r.dur, ease: "easeOut", delay: i * 0.07 }}
              style={{
                position: "absolute",
                width: 80, height: 80, borderRadius: "50%",
                top: "50%", left: "50%",
                marginTop: -40, marginLeft: -40,
                background: "radial-gradient(circle, rgba(246,231,168,0.72) 0%, rgba(243,216,199,0.4) 40%, transparent 70%)",
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Edge Highlight Sweep ─────────────────────────────────────────────────────

function EdgeHighlight({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ x: "-100%", opacity: 0 }}
          animate={{ x: "120%", opacity: [0, 0.55, 0] }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(90deg, transparent 0%, rgba(255,248,220,0.42) 50%, transparent 100%)",
            zIndex: 5, borderRadius: "inherit",
          }}
        />
      )}
    </AnimatePresence>
  );
}

// ─── Liquid Glass Input wrapper ───────────────────────────────────────────────

function LiquidGlassShell({ children, onClick, className = "", style = {} }: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const night = useNight();
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <motion.div
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      animate={{ scale: pressed ? 0.97 : 1 }}
      transition={pressed
        ? { duration: 0.14, ease: "easeOut" }
        : { duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
      className={`relative overflow-hidden ${className}`}
      style={{
        background: night ? NK.glass : "rgba(255,252,245,0.65)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        border: night
          ? `1px solid ${focused ? "rgba(255,255,255,0.22)" : NK.glassBorder}`
          : `1px solid ${focused ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.45)"}`,
        boxShadow: night
          ? (focused ? "0 4px 20px rgba(10,8,14,0.20), inset 0 0 0 0.5px rgba(255,255,255,0.18)" : "0 4px 16px rgba(10,8,14,0.14)")
          : (focused ? "0 4px 20px rgba(121,100,72,0.09), inset 0 0 0 0.5px rgba(255,255,255,0.55)" : "0 4px 16px rgba(121,100,72,0.07)"),
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        ...style,
      }}>
      <EdgeHighlight active={pressed}/>
      {children}
    </motion.div>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

function PrimaryBtn({ children, onClick, full = false, disabled = false }: {
  children: React.ReactNode; onClick?: () => void; full?: boolean; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${full ? "w-full" : ""} px-7 py-[14px] rounded-full text-[15px] font-medium transition-all duration-100 active:scale-[0.97]`}
      style={{
        background: "rgba(246,231,168,0.92)", color: "#4B463F",
        border: "1px solid rgba(255,255,255,0.5)",
        boxShadow: "0 4px 18px rgba(121,100,72,0.1)",
        opacity: disabled ? 0.5 : 1,
      }}>
      {children}
    </button>
  );
}

function SecondaryBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full px-7 py-[13px] rounded-full text-[15px] font-medium transition-all duration-100 active:scale-[0.97]"
      style={{
        background: "rgba(243,216,199,0.55)", color: "#4B463F",
        border: "1px solid rgba(255,255,255,0.4)",
      }}>
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="px-5 py-3 rounded-full text-[14px] transition-all duration-100 active:opacity-60"
      style={{ color: "var(--text-secondary)" }}>
      {children}
    </button>
  );
}

// ─── Warm Dot ────────────────────────────────────────────────────────────────

function WarmDot() {
  return (
    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
      style={{ background: "rgba(196,149,58,0.8)", boxShadow: "0 0 6px rgba(196,149,58,0.45)" }}/>
  );
}

// ─── Chat Bubbles ─────────────────────────────────────────────────────────────

function AgentBubble({ text }: { text: string }) {
  return (
    <div className="flex items-end gap-2 mb-4 pr-12">
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-sm"
        style={{ background: "rgba(255,252,245,0.8)", border: "1px solid rgba(255,255,255,0.5)" }}>
        🌿
      </div>
      <div className="px-4 py-3 rounded-[18px] rounded-bl-[6px] text-[15px] leading-relaxed"
        style={{
          background: "rgba(255,252,245,0.75)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.45)",
          color: "var(--text-primary)",
          boxShadow: "0 4px 16px rgba(121,100,72,0.06)",
        }}>
        {text}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end mb-4 pl-12">
      <div className="px-4 py-3 rounded-[18px] rounded-br-[6px] text-[15px] leading-relaxed"
        style={{
          background: "rgba(246,231,168,0.75)",
          border: "1px solid rgba(255,255,255,0.45)",
          color: "var(--text-primary)",
        }}>
        {text}
      </div>
    </div>
  );
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────

function BottomSheet({ children, onClose, title }: {
  children: React.ReactNode; onClose?: () => void; title?: string;
}) {
  const night = useNight();
  return (
    <motion.div className="absolute inset-0 z-50"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}>
      <div className="absolute inset-0 bg-black/8" onClick={onClose}/>
      <motion.div className="absolute bottom-0 left-0 right-0 rounded-t-[32px] overflow-hidden"
        style={{
          background: night ? "rgba(50,46,56,0.96)" : "rgba(255,252,245,0.94)",
          backdropFilter: "blur(44px)",
          WebkitBackdropFilter: "blur(44px)",
          border: night ? "1px solid rgba(255,255,255,0.09)" : "1px solid rgba(255,255,255,0.5)",
          borderBottom: "none",
        }}
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "tween", duration: 0.26, ease: [0.32, 0.72, 0, 1] }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full" style={{ background: night ? "rgba(255,255,255,0.12)" : "rgba(91,79,62,0.14)" }}/>
        </div>
        {title && (
          <div className="flex items-center justify-between px-6 py-3">
            <span className="text-[17px] font-medium" style={{ color: night ? NK.text : "#4B463F" }}>{title}</span>
            {onClose && (
              <button onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center active:opacity-60"
                style={{ background: night ? "rgba(255,255,255,0.08)" : "rgba(91,79,62,0.07)" }}>
                <X size={14} style={{ color: night ? NK.text2 : "#847D72" }}/>
              </button>
            )}
          </div>
        )}
        {children}
      </motion.div>
    </motion.div>
  );
}

// ─── Safe Header ─────────────────────────────────────────────────────────────

function SafeHeader({ title, onBack, rightEl }: {
  title?: string; onBack?: () => void; rightEl?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pt-[52px] pb-3 px-5">
      <div className="w-8">
        {onBack && (
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center active:opacity-60">
            <ChevronLeft size={22} style={{ color: "var(--text-primary)" }}/>
          </button>
        )}
      </div>
      {title && <span className="text-[17px] font-medium" style={{ color: "var(--text-primary)" }}>{title}</span>}
      <div className="w-8 flex justify-end">{rightEl}</div>
    </div>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const night = useNight();
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "companion", label: "陪伴",   icon: <MessageCircle size={21}/> },
    { id: "mailbox",   label: "信箱",   icon: <Mail size={21}/> },
    { id: "scene",     label: "片场",   icon: <Film size={21}/> },
    { id: "profile",   label: "我的",   icon: <User size={21}/> },
  ];
  return (
    <div className="absolute bottom-0 left-0 right-0 pb-6">
      <div className="mx-4 rounded-[28px] px-2 py-1.5 flex items-center relative"
        style={{
          background: night ? "rgba(50,46,56,0.88)" : "rgba(255,252,245,0.82)",
          backdropFilter: "blur(32px)",
          WebkitBackdropFilter: "blur(32px)",
          border: night ? "1px solid rgba(255,255,255,0.09)" : "1px solid rgba(255,255,255,0.48)",
          boxShadow: night ? "0 8px 32px rgba(10,8,14,0.22)" : "0 8px 32px rgba(121,100,72,0.10)",
        }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => onChange(t.id)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-[20px] relative z-10"
            style={{ color: active === t.id ? (night ? NK.text : "#4B463F") : (night ? NK.text3 : "#C0B5A8") }}>
            {/* Sliding pill indicator */}
            {active === t.id && (
              <motion.div
                layoutId="tab-active-pill"
                className="absolute inset-0 rounded-[20px]"
                style={{ background: night ? "rgba(216,188,118,0.45)" : "rgba(246,231,168,0.72)" }}
                transition={{ type: "tween", duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              />
            )}
            <span className="relative z-10">{t.icon}</span>
            <span className="text-[10px] font-medium relative z-10">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Onboarding 1: Welcome ───────────────────────────────────────────────────

function OnboardWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center justify-between h-full px-8 pb-12 pt-20">
      <div/>
      <div className="flex flex-col items-center gap-8">
        <PetPlaceholder size={168}/>
        <div className="text-center">
          <h1 className="text-[30px] font-medium mb-3 leading-tight tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>
            思绪纷乱时，<br/>有个地方接住你
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            MindOff 是你的情感陪伴伙伴
          </p>
        </div>
      </div>
      <div className="w-full flex flex-col items-center gap-3">
        <PrimaryBtn onClick={onNext} full>认识一下</PrimaryBtn>
        <GhostBtn onClick={onNext}>已经了解，直接开始</GhostBtn>
      </div>
    </div>
  );
}

// ─── Onboarding 2: How ───────────────────────────────────────────────────────

function OnboardHow({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const items = [
    { icon: "💬", title: "自然聊天",  desc: "随时找它说说话，它会静静地听，不催、不评判" },
    { icon: "🌙", title: "睡前清空",  desc: "把今天所有的念头一股脑倒出来，整理是它的事" },
    { icon: "📬", title: "内容托管",  desc: "它会在合适的时候送来值得的东西" },
  ];
  return (
    <div className="flex flex-col h-full">
      <SafeHeader onBack={onBack}/>
      <div className="flex-1 px-6 pt-2 flex flex-col justify-between pb-12">
        <div>
          <h2 className="text-[26px] font-medium mb-1.5 leading-tight tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>
            陪伴的三种方式
          </h2>
          <p className="text-[15px] mb-7" style={{ color: "var(--text-secondary)" }}>不是工具，更像一个会等你回来的朋友</p>
          <div className="flex flex-col gap-3">
            {items.map((item, i) => (
              <GlassCard key={i} className="p-5 flex items-center gap-4">
                <div className="text-3xl">{item.icon}</div>
                <div>
                  <div className="text-[15px] font-medium mb-0.5" style={{ color: "var(--text-primary)" }}>{item.title}</div>
                  <div className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>{item.desc}</div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
        <PrimaryBtn onClick={onNext} full>选择你的伙伴</PrimaryBtn>
      </div>
    </div>
  );
}

// ─── Onboarding 3: Choose Pet ────────────────────────────────────────────────

function OnboardPet({ onNext, onBack, selected, onSelect }: {
  onNext: () => void; onBack: () => void; selected: number; onSelect: (i: number) => void;
}) {
  const pets = [
    { name: "小栖", trait: "温柔，善于倾听", desc: "喜欢在安静的傍晚陪你说话", emoji: "🌿" },
    { name: "晴晴", trait: "活泼，偶尔调皮", desc: "会在你沮丧时想办法让你笑一下", emoji: "☀️" },
    { name: "暮云", trait: "沉稳，有时神秘", desc: "话不多，但每句都刚好", emoji: "🌙" },
  ];
  return (
    <div className="flex flex-col h-full">
      <SafeHeader onBack={onBack}/>
      <div className="flex-1 px-6 pt-2 flex flex-col justify-between pb-12 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div>
          <h2 className="text-[26px] font-medium mb-1.5 leading-tight tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>
            选择你的伙伴
          </h2>
          <p className="text-[15px] mb-6" style={{ color: "var(--text-secondary)" }}>之后随时可以更换，记忆会妥善交接</p>
          <div className="flex flex-col gap-3">
            {pets.map((pet, i) => (
              <GlassCard key={i} onClick={() => onSelect(i)} className="p-5 flex items-center gap-4"
                style={{
                  border: selected === i ? "1.5px solid rgba(196,149,58,0.5)" : "1px solid rgba(255,255,255,0.45)",
                  background: selected === i ? "rgba(246,231,168,0.42)" : "rgba(255,252,245,0.65)",
                }}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ background: "rgba(255,252,245,0.85)", border: "1px solid rgba(255,255,255,0.5)" }}>
                  {pet.emoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[16px] font-medium" style={{ color: "var(--text-primary)" }}>{pet.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(243,216,199,0.6)", color: "#655D61" }}>{pet.trait}</span>
                  </div>
                  <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{pet.desc}</div>
                </div>
                {selected === i && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(196,149,58,0.8)" }}>
                    <Check size={11} style={{ color: "#fff" }}/>
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        </div>
        <PrimaryBtn onClick={onNext} full disabled={selected === -1}>就选它了</PrimaryBtn>
      </div>
    </div>
  );
}

// ─── Onboarding 4: Permission ─────────────────────────────────────────────────

function OnboardPermission({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const items = [
    { icon: "🧠", title: "主动陪伴",    desc: "它会在合适的时刻主动出现，随时可以关闭" },
    { icon: "🔐", title: "记忆授权",    desc: "对话内容存在你的设备，可以随时查看和删除" },
    { icon: "🔕", title: "不会打扰你",  desc: "不依赖通知、连续签到或任何情感绑架" },
  ];
  return (
    <div className="flex flex-col h-full">
      <SafeHeader onBack={onBack}/>
      <div className="flex-1 px-6 pt-2 flex flex-col justify-between pb-12">
        <div>
          <h2 className="text-[26px] font-medium mb-1.5 leading-tight tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>
            在开始之前
          </h2>
          <p className="text-[15px] mb-7" style={{ color: "var(--text-secondary)" }}>你一直掌握主动权</p>
          <div className="flex flex-col gap-3">
            {items.map((item, i) => (
              <GlassCard key={i} className="p-5 flex items-start gap-4">
                <div className="text-2xl mt-0.5">{item.icon}</div>
                <div>
                  <div className="text-[15px] font-medium mb-0.5" style={{ color: "var(--text-primary)" }}>{item.title}</div>
                  <div className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>{item.desc}</div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <PrimaryBtn onClick={onNext} full>开始了</PrimaryBtn>
          <p className="text-[12px] text-center" style={{ color: "var(--text-muted)" }}>
            可以在「我的」里随时修改这些设置
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Companion: Idle ─────────────────────────────────────────────────────────

function CompanionIdle({ onChat, onModeSheet, onNightToggle, night, petName, petEmoji }: {
  onChat: () => void; onModeSheet: () => void; onNightToggle: () => void;
  night: boolean; petName: string; petEmoji: string;
}) {
  const [bubbleVisible, setBubbleVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setBubbleVisible(false), 4200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 pt-[52px] pb-2">
        <div>
          <div className="text-[17px] font-medium" style={{ color: "var(--text-primary)" }}>{petName}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <WarmDot/>
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>在等你</span>
          </div>
        </div>
        <button onClick={onNightToggle}
          className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-60 transition-opacity"
          style={{ background: "rgba(255,252,245,0.65)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.45)" }}>
          {night
            ? <Sun  size={15} style={{ color: "var(--text-primary)" }}/>
            : <Moon size={15} style={{ color: "var(--text-primary)" }}/>}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative" onClick={onChat}>
        <AnimatePresence>
          {bubbleVisible && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="absolute px-5 py-3 rounded-[20px] rounded-bl-[6px] text-[15px]"
              style={{
                top: "8%", left: "50%", transform: "translateX(-50%)",
                background: "rgba(255,252,245,0.85)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.5)",
                color: "#484145",
                boxShadow: "0 8px 24px rgba(121,100,72,0.08)",
                whiteSpace: "nowrap",
              }}>
              今天怎么样？✨
            </motion.div>
          )}
        </AnimatePresence>

        <PetPlaceholder size={215}/>
        <p className="mt-5 text-[13px]" style={{ color: "var(--text-muted)" }}>轻触打招呼</p>
      </div>

      <div className="px-5 pb-[110px]">
        <div className="flex items-center gap-3">
          <LiquidGlassShell
            onClick={onChat}
            className="flex-1 flex items-center gap-3 px-5 py-4 rounded-full cursor-text">
            <span className="text-[15px] flex-1" style={{ color: "var(--text-muted)" }}>说点什么…</span>
            <Mic size={17} style={{ color: "var(--text-muted)" }}/>
          </LiquidGlassShell>
          <motion.button onClick={onModeSheet}
            whileTap={{ scale: 0.95, transition: { duration: 0.14, ease: "easeOut" } }}
            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 relative overflow-hidden"
            style={{
              background: "rgba(246,231,168,0.82)",
              border: "1px solid rgba(255,255,255,0.5)",
              boxShadow: "0 4px 16px rgba(121,100,72,0.1)",
            }}>
            <Plus size={20} style={{ color: "var(--text-primary)" }}/>
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ─── Companion: Chat ─────────────────────────────────────────────────────────

function CompanionChat({ onBack, petName, petEmoji }: {
  onBack: () => void; petName: string; petEmoji: string;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "agent", text: "嗯，我在。今天有什么想聊的吗？" },
  ]);
  const [thinking, setThinking] = useState(false);

  const send = () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    setMessages(m => [...m, { role: "user", text }]);
    setThinking(true);
    setTimeout(() => {
      setMessages(m => [...m, { role: "agent", text: "我听到了。能多说一点吗？" }]);
      setThinking(false);
    }, 1300);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 pt-[52px] pb-3 flex-shrink-0">
        <button onClick={onBack} className="active:opacity-60 transition-opacity">
          <ChevronLeft size={22} style={{ color: "var(--text-primary)" }}/>
        </button>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
          style={{ background: "rgba(255,252,245,0.82)", border: "1px solid rgba(255,255,255,0.5)" }}>
          {petEmoji}
        </div>
        <div>
          <div className="text-[16px] font-medium" style={{ color: "var(--text-primary)" }}>{petName}</div>
          <div className="flex items-center gap-1.5">
            <WarmDot/>
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>在听</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-2" style={{ scrollbarWidth: "none" }}>
        {messages.map((m, i) => (
          m.role === "agent"
            ? <AgentBubble key={i} text={m.text}/>
            : <UserBubble   key={i} text={m.text}/>
        ))}
        {thinking && (
          <div className="flex items-end gap-2 mb-4">
            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-sm"
              style={{ background: "rgba(255,252,245,0.82)", border: "1px solid rgba(255,255,255,0.5)" }}>
              {petEmoji}
            </div>
            <div className="px-4 py-3 rounded-[18px] rounded-bl-[6px]"
              style={{ background: "rgba(255,252,245,0.75)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.45)" }}>
              <div className="flex gap-1 items-center h-5">
                {[0, 1, 2].map(j => (
                  <div key={j} className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "#C0B5A8", animation: `typingDot 0.9s ${j * 0.16}s infinite` }}/>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-[110px] pt-2 flex-shrink-0">
        <LiquidGlassShell className="flex items-end gap-2 px-4 py-3 rounded-[24px]">
          <textarea value={input} onChange={e => setInput(e.target.value)}
            placeholder="说点什么…" rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-[15px] leading-relaxed"
            style={{ color: "var(--text-primary)", maxHeight: 80 }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <motion.button onClick={send}
            whileTap={{ scale: 0.9, transition: { duration: 0.12 } }}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: input.trim() ? "rgba(246,231,168,0.92)" : "var(--row-divider)" }}>
            <Send size={13} style={{ color: input.trim() ? "#4B463F" : "var(--text-muted)" }}/>
          </motion.button>
        </LiquidGlassShell>
      </div>
    </div>
  );
}

// ─── Mode Sheet ───────────────────────────────────────────────────────────────

function ModeSheet({ onClose, onSleepDump, onChat }: {
  onClose: () => void; onSleepDump: () => void; onChat: () => void;
}) {
  const modes = [
    { icon: "☁️",  label: "自由聊聊",      desc: "随便聊点什么，没有主题",         act: onChat },
    { icon: "🌊",  label: "一股脑倒出来",  desc: "把今天的念头一次全说出来",       act: onSleepDump },
    { icon: "🪨",  label: "说件放不下的事", desc: "有什么在心里反复出现",           act: onChat },
    { icon: "📽️", label: "回看一个片段",   desc: "回到某段记忆里看看",             act: onChat },
  ];
  return (
    <BottomSheet onClose={onClose} title="想怎么聊？">
      <div className="px-5 pb-8 pt-2 flex flex-col gap-2">
        {modes.map((m, i) => (
          <button key={i} onClick={m.act}
            className="flex items-center gap-4 p-4 rounded-[20px] text-left w-full active:scale-[0.97] transition-transform duration-100"
            style={{ background: "rgba(255,252,245,0.5)", border: "1px solid rgba(255,255,255,0.4)" }}>
            <span className="text-2xl">{m.icon}</span>
            <div>
              <div className="text-[15px] font-medium mb-0.5" style={{ color: "var(--text-primary)" }}>{m.label}</div>
              <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{m.desc}</div>
            </div>
            <ChevronRight size={15} style={{ color: "var(--text-muted)", marginLeft: "auto" }}/>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

// ─── Sleep Dump ───────────────────────────────────────────────────────────────

function SleepDump({ onBack, onProcess }: { onBack: () => void; onProcess: () => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col h-full">
      <SafeHeader onBack={onBack} title="今晚的念头"/>
      <div className="flex-1 px-5 flex flex-col gap-4 pb-[110px] pt-2">
        <p className="text-[14px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          计划、担忧、灵感、情绪——什么都可以，混在一起说也没关系
        </p>
        <div className="flex-1 rounded-[24px] p-5"
          style={{
            background: "rgba(255,252,245,0.65)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            border: "1px solid rgba(255,255,255,0.45)",
          }}>
          <textarea value={text} onChange={e => setText(e.target.value)}
            placeholder={"今天想说的都在这里…\n\n整理是我的事，你只管说。"}
            className="w-full h-full bg-transparent outline-none resize-none text-[15px] leading-[1.65]"
            style={{ color: "#484145", minHeight: 220 }}
          />
        </div>
        <div className="flex items-center gap-3">
          <button className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70"
            style={{ background: "rgba(255,252,245,0.65)", border: "1px solid rgba(255,255,255,0.45)" }}>
            <Mic size={19} style={{ color: "var(--text-secondary)" }}/>
          </button>
          <PrimaryBtn onClick={onProcess} full>说完了，帮我整理</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Processing ───────────────────────────────────────────────────────────────

function ProcessingScreen({ onDone }: { onDone: () => void }) {
  const [showRipple, setShowRipple] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setShowRipple(true);
      setTimeout(() => { setShowRipple(false); onDone(); }, 600);
    }, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  const fragments = [
    "明天的会议", "担心妈妈", "那本书", "睡前运动",
    "和朋友的事", "灵感：旅行", "今天好累", "想喝奶茶",
    "下周计划", "一直没做的事",
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 relative">
      <CreamRipple active={showRipple}/>
      <div className="relative w-72 h-72 flex items-center justify-center">
        {fragments.map((f, i) => {
          const angle = (i / fragments.length) * Math.PI * 2;
          const r = 85 + (i % 3) * 12;
          const fx = Math.cos(angle) * r;
          const fy = Math.sin(angle) * r;
          return (
            <div key={i}
              className="absolute text-[12px] font-medium px-2.5 py-1 rounded-full"
              style={{
                background: "rgba(255,252,245,0.78)",
                color: "#655D61",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.45)",
                ["--fx" as string]: `${fx}px`,
                ["--fy" as string]: `${fy}px`,
                animation: `fragmentIn 0.5s ${i * 0.11}s both, fragmentOut 0.7s ${1.9 + i * 0.04}s both`,
              }}>
              {f}
            </div>
          );
        })}
        <div className="w-20 h-20 rounded-full flex flex-col items-center justify-center"
          style={{
            background: "rgba(255,252,245,0.82)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.5)",
            boxShadow: "0 8px 32px rgba(121,100,72,0.08)",
          }}>
          <div className="text-2xl">🌿</div>
        </div>
      </div>
      <p className="text-[15px]" style={{ color: "var(--text-secondary)" }}>正在接住你的念头…</p>
    </div>
  );
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

function ReceiptScreen({ onDone, onView }: { onDone: () => void; onView: () => void }) {
  const items = [
    { icon: "📅", label: "明天要接住", value: "3 件事" },
    { icon: "💡", label: "值得留下的想法", value: "2 条" },
    { icon: "🫂", label: "被听见的感受", value: "1 个" },
    { icon: "🌊", label: "今晚无需处理", value: "3 个" },
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="pt-[52px] px-6 pb-4 flex-shrink-0">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <p className="text-[14px] mb-1" style={{ color: "var(--text-secondary)" }}>今晚</p>
          <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>
            已替你接住<br/>
            <span style={{ color: "#C4953A" }}>9 个念头</span>
          </h1>
        </motion.div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-4" style={{ scrollbarWidth: "none" }}>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {items.map((item, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.09 }}>
              <GlassCard className="p-4">
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="text-[22px] font-medium mb-0.5" style={{ color: "var(--text-primary)" }}>{item.value}</div>
                <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{item.label}</div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <GlassCard className="p-5" style={{ background: "rgba(246,231,168,0.42)" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <Clock size={13} style={{ color: "#C4953A" }}/>
              <span className="text-[12px] font-medium" style={{ color: "#C4953A" }}>明天最值得关注</span>
            </div>
            <p className="text-[15px] font-medium" style={{ color: "var(--text-primary)" }}>与朋友的约定 · 下午 3 点</p>
            <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>你担心会迟到，我帮你留着了</p>
          </GlassCard>
        </motion.div>
      </div>
      <div className="px-5 pb-[100px] flex flex-col gap-3 pt-3 flex-shrink-0">
        <PrimaryBtn onClick={onDone} full>今晚到这里</PrimaryBtn>
        <SecondaryBtn onClick={onView}>看看我替你放在哪里</SecondaryBtn>
      </div>
    </div>
  );
}

// ─── Tasks & Keepsake Types / Mock Data ──────────────────────────────────────

interface Task {
  id: string; title: string; date: string; time: string;
  source: string; completed: boolean;
}

interface Keepsake {
  id: string;
  type: "letter" | "insight" | "scene" | "music" | "quote" | "moment";
  title: string; excerpt: string; savedAt: string;
  petName: string; source: string;
}

const TODAY_DATE = "2026-07-23";

const INITIAL_TASKS: Task[] = [
  { id:"t1", title:"回复那封邮件",  date:"2026-07-23", time:"今天内", source:"来自昨晚的整理", completed:false },
  { id:"t2", title:"和朋友见面",    date:"2026-07-23", time:"15:00",  source:"手动添加",       completed:false },
  { id:"t3", title:"记得喝水",      date:"2026-07-23", time:"持续",   source:"桌宠提醒",       completed:true  },
  { id:"t4", title:"与朋友的约定",  date:"2026-07-24", time:"15:00",  source:"来自昨晚的整理", completed:false },
  { id:"t5", title:"整理书桌",      date:"2026-07-22", time:"",       source:"手动添加",       completed:true  },
];

const INITIAL_KEEPSAKES: Keepsake[] = [
  { id:"k1", type:"letter",  title:"桐桐写给我的信",                excerpt:"你已经做得比自己感觉到的更多了。", savedAt:"7月24日", petName:"桐桐", source:"桌宠来信"  },
  { id:"k2", type:"insight", title:"我不是害怕失败，而是害怕拖累队友。", excerpt:"",                              savedAt:"7月18日", petName:"小栖", source:"今日洞察" },
  { id:"k3", type:"scene",   title:"我终于把那句话说了出来",          excerpt:"场景：和妈妈的对话",              savedAt:"6月12日", petName:"小栖", source:"场景结算" },
  { id:"k4", type:"music",   title:"Bloom",                        excerpt:"桐桐夹在信里的歌",                savedAt:"6月8日",  petName:"桐桐", source:"信中附件" },
  { id:"k5", type:"quote",   title:"朋友说：你不用每次都表现得没事。", excerpt:"",                              savedAt:"5月28日", petName:"小栖", source:"一句话"   },
];

// ─── Week Helpers ─────────────────────────────────────────────────────────────

const WEEKDAYS_CN = ["周一","周二","周三","周四","周五","周六","周日"];
const DAY_CN = ["日","一","二","三","四","五","六"];

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  d.setHours(0, 0, 0, 0);
  return d;
}
function shiftDays(date: Date, n: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function parseISO(s: string): Date {
  const [y,m,dd] = s.split("-").map(Number);
  return new Date(y, m - 1, dd);
}

// ─── WeekNavigator ────────────────────────────────────────────────────────────

function WeekNavigator({ weekOffset, selectedDate, onWeekChange, onSelectDate, tasks }: {
  weekOffset: number; selectedDate: string;
  onWeekChange: (d: number) => void; onSelectDate: (s: string) => void;
  tasks: Task[];
}) {
  const night = useNight();
  const baseMonday = getMondayOf(parseISO(TODAY_DATE));
  const monday = shiftDays(baseMonday, weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => shiftDays(monday, i));
  const rangeLabel = `${days[0].getMonth()+1}月${days[0].getDate()}日—${days[6].getMonth()+1}月${days[6].getDate()}日`;

  const dots = (ds: string) => Math.min(tasks.filter(t => t.date === ds && !t.completed).length, 3);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{rangeLabel}</span>
        <div className="flex gap-1">
          {([-1,1] as const).map(d => (
            <button key={d} onClick={() => onWeekChange(d)}
              className="w-7 h-7 flex items-center justify-center rounded-full active:opacity-60"
              style={{ background: night ? NK.glass : "rgba(255,252,245,0.72)", border: night ? `1px solid ${NK.glassBorder}` : "1px solid rgba(255,255,255,0.45)" }}>
              {d < 0
                ? <ChevronLeft size={13} style={{ color: "var(--text-secondary)" }}/>
                : <ChevronRight size={13} style={{ color: "var(--text-secondary)" }}/>}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-1">
        {days.map((day, i) => {
          const ds = toISO(day);
          const sel = ds === selectedDate;
          const tod = ds === TODAY_DATE;
          const dotCount = dots(ds);
          return (
            <button key={i} onClick={() => onSelectDate(ds)}
              className="flex-1 flex flex-col items-center py-2 rounded-[14px] transition-all duration-150"
              style={{
                background: sel ? "rgba(246,231,168,0.8)" : tod ? "rgba(249,240,200,0.45)" : "transparent",
                border: sel ? "1.5px solid rgba(255,255,255,0.62)" : "1.5px solid transparent",
              }}>
              <span className="text-[10px] mb-0.5"
                style={{ color: sel
                  ? (night ? NK.lsTer : "#847D72")
                  : (night ? NK.text3 : "#C0B5A8") }}>
                {WEEKDAYS_CN[i]}
              </span>
              <span className="text-[14px] font-medium"
                style={{ color: sel
                  ? (night ? NK.lsPri : "#4B463F")
                  : (tod ? (night ? NK.text2 : "#847D72") : (night ? NK.text : "#4B463F")) }}>
                {day.getDate()}
              </span>
              <div className="flex gap-0.5 mt-1 h-1.5 items-center">
                {Array.from({ length: dotCount }, (_, j) => (
                  <div key={j} className="w-1 h-1 rounded-full"
                    style={{ background: sel ? "rgba(196,149,58,0.7)" : "rgba(196,149,58,0.5)" }}/>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────

function TaskRow({ task, onToggle, onDelete }: {
  task: Task; onToggle: () => void; onDelete: () => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  return (
    <div className="mb-2">
      <div
        className="flex items-center gap-3 px-4 py-3.5 rounded-[16px]"
        style={{
          background: task.completed ? "rgba(255,252,245,0.42)" : "rgba(255,252,245,0.72)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.45)",
        }}>
        {/* Completion ring */}
        <button
          onClick={onToggle}
          className="flex-shrink-0 active:scale-[0.94] transition-transform duration-150">
          <motion.div
            animate={task.completed ? { scale: [1, 0.9, 1.05, 1] } : { scale: 1 }}
            transition={{ duration: 0.22 }}
            style={{
              width: 22, height: 22, borderRadius: "50%",
              background: task.completed ? "rgba(246,231,168,0.9)" : "transparent",
              border: `2px solid ${task.completed ? "rgba(196,149,58,0.7)" : "rgba(91,79,62,0.2)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            {task.completed && <Check size={11} style={{ color: "var(--text-primary)" }}/>}
          </motion.div>
        </button>

        <div className="flex-1 min-w-0">
          <div className={`text-[14px] font-medium leading-snug ${task.completed ? "line-through" : ""}`}
            style={{ color: task.completed ? "#A39A9F" : "#484145" }}>
            {task.title}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "#7E7479" }}>{task.source}</div>
        </div>

        {task.time && !actionsOpen && (
          <span className="text-[12px] flex-shrink-0" style={{ color: "var(--text-muted)" }}>{task.time}</span>
        )}

        <button
          onClick={() => setActionsOpen(v => !v)}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full active:opacity-60"
          style={{ color: "#7E7479", fontSize: 14, letterSpacing: "0.04em" }}>
          ···
        </button>
      </div>

      <AnimatePresence>
        {actionsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex justify-end gap-2 px-2 pt-1.5 pb-0.5">
            <button
              onClick={() => setActionsOpen(false)}
              className="px-3 py-1.5 rounded-full text-[12px] active:opacity-60"
              style={{ background: "rgba(255,252,245,0.7)", color: "#655D61", border: "1px solid rgba(255,255,255,0.4)" }}>
              编辑
            </button>
            <button
              onClick={() => { onDelete(); setActionsOpen(false); }}
              className="px-3 py-1.5 rounded-full text-[12px] active:opacity-60"
              style={{ background: "rgba(243,216,199,0.5)", color: "#655D61", border: "1px solid rgba(255,255,255,0.4)" }}>
              删除
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── CompletedTasksSection ────────────────────────────────────────────────────

function CompletedTasksSection({ tasks }: { tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  if (!tasks.length) return null;
  return (
    <div className="mt-1">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 py-2 active:opacity-60 transition-opacity">
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight size={12} style={{ color: "var(--text-muted)" }}/>
        </motion.div>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          今天完成了 {tasks.length} 件
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            {tasks.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 rounded-[14px] mb-1.5"
                style={{ background: "rgba(255,252,245,0.4)", border: "1px solid rgba(255,255,255,0.35)" }}>
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(196,149,58,0.5)" }}>
                  <Check size={9} style={{ color: "var(--text-primary)" }}/>
                </div>
                <span className="text-[13px] line-through flex-1 truncate" style={{ color: "var(--text-muted)" }}>
                  {t.title}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── AddTaskSheet ─────────────────────────────────────────────────────────────

function AddTaskSheet({ defaultDate, onClose, onAdd }: {
  defaultDate: string; onClose: () => void; onAdd: (t: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [time, setTime]   = useState("");
  const d = parseISO(defaultDate);
  const label = `${d.getMonth()+1}月${d.getDate()}日`;

  const commit = () => {
    if (!title.trim()) return;
    onAdd({ id:`t${Date.now()}`, title:title.trim(), date:defaultDate, time, source:"手动添加", completed:false });
    onClose();
  };

  return (
    <BottomSheet onClose={onClose} title="添加一件事">
      <div className="px-5 pb-8 flex flex-col gap-4 pt-1">
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="要做什么…"
          className="w-full px-4 py-3.5 rounded-[16px] outline-none text-[15px]"
          style={{ background:"rgba(255,252,245,0.65)", border:"1px solid rgba(255,255,255,0.45)", color:"#484145" }}
          onKeyDown={e => { if (e.key==="Enter") commit(); }}
          autoFocus
        />
        <div className="flex gap-3">
          <div className="flex items-center gap-2 px-4 py-3 rounded-[14px] flex-1"
            style={{ background:"rgba(246,231,168,0.45)", border:"1px solid rgba(255,255,255,0.4)" }}>
            <span className="text-[13px]">📅</span>
            <span className="text-[14px]" style={{ color:"#484145" }}>{label}</span>
          </div>
          <input
            value={time} onChange={e => setTime(e.target.value)}
            placeholder="时间（可选）"
            className="flex-1 px-4 py-3 rounded-[14px] outline-none text-[14px]"
            style={{ background:"rgba(255,252,245,0.65)", border:"1px solid rgba(255,255,255,0.4)", color:"#484145" }}
          />
        </div>
        <PrimaryBtn onClick={commit} full disabled={!title.trim()}>放到这一天</PrimaryBtn>
      </div>
    </BottomSheet>
  );
}

// ─── DailyTaskList ────────────────────────────────────────────────────────────

function DailyTaskList({ selectedDate, tasks, onToggle, onDelete, onAdd }: {
  selectedDate: string; tasks: Task[];
  onToggle: (id: string) => void; onDelete: (id: string) => void; onAdd: () => void;
}) {
  const d = parseISO(selectedDate);
  const dayName = `星期${DAY_CN[d.getDay()]}`;
  const label = `${d.getMonth()+1}月${d.getDate()}日，${dayName}`;
  const isTd = selectedDate === TODAY_DATE;
  const active = tasks.filter(t => !t.completed);
  const done   = tasks.filter(t =>  t.completed);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[16px] font-medium" style={{ color:"var(--text-primary)" }}>{label}</div>
          <div className="text-[12px] mt-0.5" style={{ color:"var(--text-secondary)" }}>
            {active.length > 0
              ? `${isTd ? "今天" : "这天"}有 ${active.length} 件事等你接住`
              : `${isTd ? "今天" : "这天"}还没有待办`}
          </div>
        </div>
        <button onClick={onAdd}
          className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform"
          style={{ background:"rgba(246,231,168,0.78)", color:"#463F3C", border:"1px solid rgba(255,255,255,0.5)" }}>
          <Plus size={12}/>添加
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-4">
          <div style={{
            width:64, height:64, borderRadius:16,
            background:"rgba(255,252,245,0.65)",
            backdropFilter:"blur(16px)",
            border:"1px solid rgba(255,255,255,0.45)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:24,
          }}>✦</div>
          <div className="text-center">
            <p className="text-[15px] font-medium mb-1" style={{ color:"var(--text-primary)" }}>这一天还是空的</p>
            <p className="text-[13px]" style={{ color:"var(--text-muted)" }}>可以先留一点位置给自己。</p>
          </div>
          <button onClick={onAdd}
            className="px-4 py-2 rounded-full text-[13px] active:opacity-60"
            style={{ background:"rgba(246,231,168,0.65)", color:"#463F3C" }}>
            添加一件事
          </button>
        </div>
      ) : (
        <>
          {active.map(t => (
            <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)}/>
          ))}
          <CompletedTasksSection tasks={done}/>
        </>
      )}
    </div>
  );
}

// ─── Keepsake Artifact ────────────────────────────────────────────────────────

// Unified glass material for all keepsake cards
const GLASS_CARD: React.CSSProperties = {
  background: "rgba(255,252,245,0.62)",
  backdropFilter: "blur(28px)",
  WebkitBackdropFilter: "blur(28px)",
  border: "1px solid rgba(255,255,255,0.52)",
  boxShadow: "0 8px 28px rgba(121,100,72,0.07)",
  borderRadius: 24,
  overflow: "hidden",
  position: "relative",
};

// Per-type accent glow color (corner hint only, no big fills)
const TYPE_META: Record<Keepsake["type"], {
  label: string; glow: string; accentText: string;
}> = {
  letter:  { label:"桌宠来信", glow:"rgba(246,231,168,0.45)", accentText:"#9C691D" },
  insight: { label:"今日洞察", glow:"rgba(246,231,168,0.35)", accentText:"#826E50" },
  scene:   { label:"片场记录", glow:"rgba(243,216,199,0.45)", accentText:"#A26458" },
  music:   { label:"音乐",     glow:"rgba(233,228,244,0.45)", accentText:"#75679D" },
  quote:   { label:"一句话",   glow:"rgba(243,216,199,0.35)", accentText:"#70656B" },
  moment:  { label:"时刻",     glow:"rgba(223,231,245,0.45)", accentText:"#70656B" },
};

// Which template each type uses
type CardTemplate = "text" | "media" | "experience";
const CARD_TEMPLATE: Record<Keepsake["type"], CardTemplate> = {
  insight: "text", quote: "text", moment: "text",
  music: "media",
  letter: "experience", scene: "experience",
};

const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='150' height='150' filter='url(%23n)' opacity='0.026'/%3E%3C/svg%3E\")";

function KeepsakeArtifact({ item, onOpen }: { item: Keepsake; onOpen: () => void }) {
  const meta = TYPE_META[item.type];
  const template = CARD_TEMPLATE[item.type];

  const TypeIcon = () => {
    if (item.type === "letter")  return <Mail   size={11} strokeWidth={1.5}/>;
    if (item.type === "scene")   return <Film   size={11} strokeWidth={1.5}/>;
    if (item.type === "music")   return <Music  size={11} strokeWidth={1.5}/>;
    if (item.type === "moment")  return <MapPin size={11} strokeWidth={1.5}/>;
    return null;
  };

  return (
    <motion.div
      onClick={onOpen}
      whileTap={{ scale: 0.98, transition: { duration: 0.14, ease: "easeOut" } }}
      className="cursor-pointer mb-3">
      <div style={GLASS_CARD}>
        {/* Grain texture */}
        <div style={{ position:"absolute", inset:0, backgroundImage:GRAIN, opacity:0.5,
          pointerEvents:"none", zIndex:0 }}/>
        {/* Corner glow — type hint */}
        <div style={{
          position:"absolute", top:-18, right:-18, width:64, height:64, borderRadius:"50%",
          background:`radial-gradient(circle,${meta.glow} 0%,transparent 70%)`,
          pointerEvents:"none", zIndex:0,
        }}/>

        {/* ── Template A: Text card (insight / quote / moment) ── */}
        {template === "text" && (
          <div style={{ position:"relative", zIndex:1, padding:"14px 15px 14px" }}>
            {/* Type label row */}
            <div className="flex items-center gap-1.5 mb-3">
              <div style={{ color: meta.accentText }}>
                <TypeIcon/>
              </div>
              <span className="text-[11px] tracking-wide uppercase"
                style={{ color: meta.accentText, letterSpacing:"0.04em", fontWeight:500 }}>
                {meta.label}
              </span>
            </div>
            {/* Core sentence */}
            <p className="text-[14px] font-medium leading-snug mb-3"
              style={{ color:"#484145" }}>
              {item.title}
            </p>
            {/* Excerpt */}
            {item.excerpt && (
              <p className="text-[12px] leading-snug mb-3" style={{ color:"#655D61" }}>
                {item.excerpt}
              </p>
            )}
            {/* Source + date */}
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color:"#7E7479" }}>{item.source}</span>
              <span className="text-[11px]" style={{ color:"#7E7479" }}>{item.savedAt}</span>
            </div>
          </div>
        )}

        {/* ── Template B: Media card (music) ── */}
        {template === "media" && (
          <div style={{ position:"relative", zIndex:1, padding:"13px 13px 12px" }}>
            {/* Soft gradient cover */}
            <div style={{
              width:"100%", aspectRatio:"1",
              borderRadius:14, marginBottom:10, overflow:"hidden",
              background:"linear-gradient(140deg,rgba(233,228,244,0.72) 0%,rgba(246,231,168,0.38) 100%)",
              display:"flex", alignItems:"center", justifyContent:"center",
              border:"1px solid rgba(255,255,255,0.45)",
            }}>
              <Music size={22} strokeWidth={1.5} style={{ color:"#75679D" }}/>
            </div>
            {/* Type label */}
            <div className="flex items-center gap-1 mb-1.5">
              <span className="text-[11px] uppercase tracking-wide"
                style={{ color: meta.accentText, fontWeight:500, letterSpacing:"0.04em" }}>
                {meta.label}
              </span>
            </div>
            {/* Title */}
            <p className="text-[14px] font-medium leading-tight mb-1 truncate"
              style={{ color:"#484145" }}>{item.title}</p>
            {/* Excerpt */}
            {item.excerpt && (
              <p className="text-[12px] leading-snug mb-2 truncate" style={{ color:"#655D61" }}>
                {item.excerpt}
              </p>
            )}
            {/* Bottom row */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px]" style={{ color:"#7E7479" }}>{item.savedAt}</span>
              {/* Play button */}
              <div className="flex items-center justify-center rounded-full"
                style={{
                  width:26, height:26,
                  background:"rgba(255,255,255,0.55)",
                  border:"1px solid rgba(255,255,255,0.5)",
                }}>
                <Play size={9} strokeWidth={2} style={{ color:"#75679D", marginLeft:1 }}/>
              </div>
            </div>
          </div>
        )}

        {/* ── Template C: Experience card (letter / scene) ── */}
        {template === "experience" && (
          <div style={{ position:"relative", zIndex:1, padding:"14px 15px 14px" }}>
            {/* Type label row */}
            <div className="flex items-center gap-1.5 mb-3">
              <div style={{ color: meta.accentText }}>
                <TypeIcon/>
              </div>
              <span className="text-[11px] uppercase tracking-wide"
                style={{ color: meta.accentText, fontWeight:500, letterSpacing:"0.04em" }}>
                {meta.label}
              </span>
            </div>
            {/* Title */}
            <p className="text-[14px] font-medium leading-snug mb-2"
              style={{ color:"#484145" }}>{item.title}</p>
            {/* Excerpt */}
            {item.excerpt && (
              <p className="text-[12px] leading-snug mb-3"
                style={{ color:"#655D61", fontStyle:"italic" }}>
                {item.excerpt}
              </p>
            )}
            {/* Source + date */}
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color:"#7E7479" }}>{item.source}</span>
              <span className="text-[11px]" style={{ color:"#7E7479" }}>{item.savedAt}</span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Keepsake Detail ──────────────────────────────────────────────────────────

function KeepsakeDetail({ item, onClose, onRemove }: {
  item: Keepsake; onClose: () => void; onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const meta = TYPE_META[item.type];
  return (
    <motion.div className="absolute inset-0 z-40"
      initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      transition={{ duration:0.18 }}>
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose}
        style={{ background:"rgba(255,251,243,0.72)", backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)" }}/>
      {/* Card */}
      <motion.div className="absolute left-5 right-5 overflow-hidden" style={{ top:70, bottom:96 }}
        initial={{ scale:0.88, opacity:0, y:24 }}
        animate={{ scale:1, opacity:1, y:0 }}
        exit={{ scale:0.9, opacity:0, y:12 }}
        transition={{ type:"spring", damping:24, stiffness:220 }}>
        <div className="h-full overflow-y-auto rounded-[24px]"
          style={{ background:"rgba(255,252,245,0.92)", backdropFilter:"blur(32px)",
            WebkitBackdropFilter:"blur(32px)", borderRadius:24, scrollbarWidth:"none",
            boxShadow:"0 24px 64px rgba(121,100,72,0.14)" }}>
          {/* Grain */}
          <div style={{ position:"absolute", inset:0, backgroundImage:GRAIN, opacity:0.5, pointerEvents:"none",
            zIndex:0, borderRadius:24 }}/>
          <div style={{ position:"relative", zIndex:1, padding:"20px 20px 24px" }}>
            <div className="flex justify-end mb-3">
              <button onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center active:opacity-60"
                style={{ background:"var(--row-divider)" }}>
                <X size={14} style={{ color:"var(--text-secondary)" }}/>
              </button>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                style={{ background:"rgba(255,255,255,0.65)", color:meta.accentText }}>{item.source}</span>
              <span className="text-[11px]" style={{ color:"#7E7479" }}>{item.savedAt}</span>
            </div>
            <h2 className="text-[19px] font-medium leading-snug mb-3" style={{ color:"#484145" }}>
              {item.title}
            </h2>
            {item.excerpt && (
              <p className="text-[14px] leading-relaxed mb-4" style={{ color:"#655D61" }}>{item.excerpt}</p>
            )}
            <div className="flex flex-col gap-1.5 mb-5 pb-5"
              style={{ borderBottom:"1px solid rgba(98,87,93,0.12)" }}>
              <div className="flex items-center gap-2">
                <span className="text-[12px]" style={{ color:"#7E7479" }}>来自</span>
                <span className="text-[12px]" style={{ color:"#655D61" }}>{item.source}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px]" style={{ color:"#7E7479" }}>陪伴</span>
                <span className="text-[12px]" style={{ color:"#655D61" }}>{item.petName} 🌿</span>
              </div>
            </div>
            {/* Type-specific actions */}
            <div className="flex flex-col gap-2">
              {item.type === "letter" && (
                <button className="w-full py-3 rounded-full text-[14px] active:scale-[0.97] transition-transform"
                  style={{ background:"rgba(246,231,168,0.72)", color:"#4D4249" }}>
                  回到对话
                </button>
              )}
              {item.type === "scene" && (
                <button className="w-full py-3 rounded-full text-[14px] active:scale-[0.97] transition-transform"
                  style={{ background:"rgba(243,218,202,0.65)", color:"var(--text-primary)" }}>
                  再次体验场景
                </button>
              )}
              {item.type === "music" && (
                <button className="w-full py-3 rounded-full text-[14px] active:scale-[0.97] transition-transform"
                  style={{ background:"rgba(233,228,244,0.72)", color:"var(--text-primary)" }}>
                  播放歌曲
                </button>
              )}
              {!confirmRemove ? (
                <button onClick={() => setConfirmRemove(true)}
                  className="w-full py-2.5 text-[13px] active:opacity-60"
                  style={{ color:"var(--text-muted)" }}>
                  移出珍藏
                </button>
              ) : (
                <motion.div initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }}
                  className="rounded-[16px] p-4"
                  style={{ background:"rgba(255,252,245,0.7)", border:"1px solid rgba(255,255,255,0.45)" }}>
                  <p className="text-[13px] text-center mb-3" style={{ color:"var(--text-secondary)" }}>
                    移出后不能恢复，确定吗？
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmRemove(false)}
                      className="flex-1 py-2.5 rounded-full text-[13px] active:opacity-60"
                      style={{ background:"rgba(255,252,245,0.8)", color:"#655D61" }}>再想想</button>
                    <button onClick={onRemove}
                      className="flex-1 py-2.5 rounded-full text-[13px] font-medium active:opacity-60"
                      style={{ background:"rgba(243,218,202,0.65)", color:"var(--text-primary)" }}>确认移出</button>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Keepsake Filter Sheet ────────────────────────────────────────────────────

function KeepsakeFilterSheet({ active, onSelect, onClose }: {
  active: string; onSelect: (f: string) => void; onClose: () => void;
}) {
  const filters = ["全部","来信","洞察","灵感","场景","音乐与书籍"];
  return (
    <BottomSheet onClose={onClose} title="筛选珍藏">
      <div className="px-5 pb-8 pt-2 flex flex-wrap gap-2">
        {filters.map(f => (
          <button key={f} onClick={() => { onSelect(f); onClose(); }}
            className="px-4 py-2.5 rounded-full text-[14px] transition-all active:scale-[0.97]"
            style={{
              background: active===f ? "rgba(246,231,168,0.88)" : "rgba(255,252,245,0.65)",
              color: active===f ? "#4B4346" : "#6E6764",
              border: active===f ? "1.5px solid rgba(156,105,29,0.35)" : "1px solid rgba(255,255,255,0.45)",
            }}>
            {f}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

// ─── Keepsake Album ───────────────────────────────────────────────────────────

function KeepsakeAlbum({ keepsakes, onSelectItem, onRemove }: {
  keepsakes: Keepsake[];
  onSelectItem: (k: Keepsake) => void;
  onRemove: (id: string) => void;
}) {
  const [showFilter, setShowFilter] = useState(false);
  const [activeFilter, setActiveFilter] = useState("全部");

  const filterMap: Record<string, Keepsake["type"][]> = {
    "全部":      ["letter","insight","scene","music","quote","moment"],
    "来信":      ["letter"],
    "洞察":      ["insight"],
    "灵感":      ["quote"],
    "场景":      ["scene"],
    "音乐与书籍":["music"],
  };
  const visible = activeFilter === "全部"
    ? keepsakes
    : keepsakes.filter(k => (filterMap[activeFilter]||[]).includes(k.type));
  const leftCol  = visible.filter((_,i) => i % 2 === 0);
  const rightCol = visible.filter((_,i) => i % 2 !== 0);

  return (
    <div>
      {/* Filter row */}
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowFilter(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] active:opacity-60"
          style={{ background:"rgba(255,252,245,0.65)", border:"1px solid rgba(255,255,255,0.45)", color:"#7E7479" }}>
          <SlidersHorizontal size={12}/>
          {activeFilter !== "全部" ? activeFilter : "筛选"}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-4">
          <div style={{
            width:66, height:84, borderRadius:14,
            background:"rgba(255,252,245,0.65)", backdropFilter:"blur(16px)",
            border:"1px solid rgba(255,255,255,0.45)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:24,
          }}>✉</div>
          <div className="text-center">
            <p className="text-[15px] font-medium mb-1.5" style={{ color:"#484145" }}>这里还空着</p>
            <p className="text-[13px] leading-snug" style={{ color:"#7E7479" }}>
              只有你决定留下的东西，<br/>才会来到这里。
            </p>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="flex-1 flex flex-col">
            {leftCol.map(k => (
              <KeepsakeArtifact key={k.id} item={k} onOpen={() => onSelectItem(k)}/>
            ))}
          </div>
          <div className="flex-1 flex flex-col" style={{ marginTop: 20 }}>
            {rightCol.map(k => (
              <KeepsakeArtifact key={k.id} item={k} onOpen={() => onSelectItem(k)}/>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showFilter && (
          <KeepsakeFilterSheet active={activeFilter} onSelect={setActiveFilter} onClose={() => setShowFilter(false)}/>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Letter: Sealed Envelope ─────────────────────────────────────────────────

function SealedEnvelope({ onOpen, isOpening }: { onOpen: () => void; isOpening: boolean }) {
  const [showRipple, setShowRipple] = useState(false);

  const handleTap = () => {
    setShowRipple(true);
    setTimeout(() => setShowRipple(false), 700);
    onOpen();
  };

  return (
    <motion.div
      onClick={handleTap}
      className="cursor-pointer relative flex flex-col items-center"
      whileTap={{ scale: 0.98, transition: { duration: 0.14, ease: "easeOut" } }}
      style={{ touchAction: "manipulation" }}
    >
      <CreamRipple active={showRipple}/>
      {/* Ambient glow */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 380, height: 260,
        background: "radial-gradient(ellipse, rgba(246,231,168,0.28) 0%, transparent 68%)",
        pointerEvents: "none", zIndex: 0,
      }}/>

      <div style={{ width: 320, height: 205, position: "relative", zIndex: 1 }}>
        {/* Envelope body */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(158deg, rgba(255,253,247,0.96) 0%, rgba(249,241,204,0.90) 100%)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.58)",
          boxShadow: "0 18px 50px rgba(121,100,72,0.10), 0 2px 10px rgba(121,100,72,0.05)",
          overflow: "hidden",
        }}>
          {/* X fold lines */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(135deg, transparent 49.2%, rgba(160,140,100,0.055) 49.7%, transparent 50.2%)",
          }}/>
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(-135deg, transparent 49.2%, rgba(160,140,100,0.055) 49.7%, transparent 50.2%)",
          }}/>
          {/* Bottom V fold */}
          <div style={{
            position: "absolute", bottom: -1, left: -1, right: -1, height: 74,
            background: "rgba(243,216,199,0.18)",
            clipPath: "polygon(0 100%, 50% 0%, 100% 100%)",
          }}/>
          {/* Paper grain overlay */}
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E\")",
            opacity: 0.5,
          }}/>
          {/* Content */}
          <div style={{ position: "relative", zIndex: 2, padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: "rgba(246,231,168,0.72)",
                border: "1px solid rgba(255,255,255,0.55)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 17, boxShadow: "0 2px 8px rgba(121,100,72,0.08)",
              }}>🌿</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6, letterSpacing: "-0.01em" }}>
              桐桐今天写给你
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 5 }}>
              {LETTER_DATA.deliveryTime}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {LETTER_DATA.preview}
            </div>
          </div>
        </div>

        {/* Animatable top flap */}
        <div style={{
          position: "absolute", top: 0, left: 0, width: 320, height: 102,
          perspective: "600px", perspectiveOrigin: "50% 0%",
          overflow: "visible", pointerEvents: "none", zIndex: 3,
        }}>
          <motion.div
            style={{
              width: 320, height: 102,
              background: "linear-gradient(178deg, rgba(249,242,210,0.92) 0%, rgba(255,252,245,0.80) 100%)",
              clipPath: "polygon(0 0, 100% 0, 50% 100%)",
              transformOrigin: "50% 0%",
              borderRadius: "22px 22px 0 0",
            }}
            animate={isOpening ? { rotateX: -164, opacity: 0.55 } : { rotateX: 0, opacity: 1 }}
            transition={{ duration: 0.26, ease: [0.45, 0, 0.55, 1] }}
          />
        </div>
      </div>

      <motion.p
        className="mt-5 text-[13px]"
        style={{ color: "var(--text-muted)", letterSpacing: "0.01em" }}
        animate={isOpening ? { opacity: 0 } : { opacity: 1 }}
        transition={{ duration: 0.15 }}
      >
        轻点拆开
      </motion.p>
    </motion.div>
  );
}

// ─── Letter: Attachment Card ──────────────────────────────────────────────────

function LetterAttachment({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  return (
    <div className="my-5 rounded-[18px] overflow-hidden"
      style={{
        background: "rgba(249,241,204,0.55)",
        border: "1px solid rgba(255,255,255,0.55)",
        boxShadow: "0 4px 14px rgba(121,100,72,0.07)",
      }}>
      <div className="px-4 py-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Music size={12} style={{ color: "#B98232" }}/>
          <span className="text-[12px] font-medium" style={{ color: "#B98232" }}>
            {LETTER_DATA.attachment.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Album art placeholder */}
          <div className="w-12 h-12 rounded-[10px] flex-shrink-0 flex items-center justify-center text-xl"
            style={{
              background: "rgba(246,231,168,0.65)",
              border: "1px solid rgba(255,255,255,0.5)",
            }}>
            🎵
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-medium truncate" style={{ color: "#4D4249" }}>
              {LETTER_DATA.attachment.title}
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: "#8C8187" }}>
              {LETTER_DATA.attachment.artist}
            </div>
          </div>
        </div>
        <p className="text-[13px] mt-3 leading-snug" style={{ color: "#62575D" }}>
          {LETTER_DATA.attachment.reason}
        </p>
        <div className="flex gap-2 mt-3">
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium active:scale-[0.97] transition-transform"
            style={{ background: "rgba(246,231,168,0.72)", color: "#4D4249", border: "1px solid rgba(255,255,255,0.5)" }}>
            <Play size={11} fill="currentColor"/>
            试听一下
          </button>
          <button onClick={onSave}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] active:scale-[0.97] transition-transform"
            style={{
              background: saved ? "rgba(221,237,227,0.55)" : "rgba(255,255,255,0.5)",
              color: saved ? "#5A8A6A" : "#8C8187",
              border: "1px solid rgba(255,255,255,0.45)",
            }}>
            <Heart size={11} fill={saved ? "currentColor" : "none"}/>
            {saved ? "已留着" : "替我留着"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Letter: Actions ──────────────────────────────────────────────────────────

function LetterActions({ saved, onAck, onReply, onSave }: {
  saved: boolean; onAck: () => void; onReply: () => void; onSave: () => void;
}) {
  return (
    <div className="mt-6">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button onClick={onAck}
            className="flex-1 py-3 rounded-full text-[14px] font-medium active:scale-[0.97] transition-transform"
            style={{ background: "rgba(246,231,168,0.75)", color: "#4D4249", border: "1px solid rgba(255,255,255,0.5)" }}>
            收到啦
          </button>
          <button onClick={onReply}
            className="flex-1 py-3 rounded-full text-[14px] active:scale-[0.97] transition-transform"
            style={{ background: "rgba(255,252,245,0.7)", color: "#62575D", border: "1px solid rgba(255,255,255,0.45)" }}>
            回它一句
          </button>
        </div>
        <button onClick={onSave}
          className="w-full py-3 rounded-full text-[14px] active:scale-[0.97] transition-transform"
          style={{
            background: saved ? "rgba(221,237,227,0.55)" : "rgba(255,252,245,0.6)",
            color: saved ? "#5A8A6A" : "#8C8187",
            border: "1px solid rgba(255,255,255,0.4)",
          }}>
          {saved ? "✓ 已经替你收好" : "把这封信留下"}
        </button>
      </div>
      {!saved && (
        <p className="text-center text-[11px] mt-3 leading-snug" style={{ color: "#8C8187" }}>
          如果不留下，它会在明天的新信到达时离开。
        </p>
      )}
      {saved && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="text-center mt-3">
          <button className="text-[12px] active:opacity-60" style={{ color: "var(--text-muted)" }}>
            去长久珍藏看看
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ─── Letter: Paper ────────────────────────────────────────────────────────────

function LetterPaper({ saved, onAck, onReply, onSave }: {
  saved: boolean; onAck: () => void; onReply: () => void; onSave: () => void;
}) {
  const [attachSaved, setAttachSaved] = useState(false);
  return (
    <div style={{ width: "100%" }}>
      {/* Paper */}
      <div style={{
        background: "rgba(255,253,247,0.96)",
        borderRadius: 24,
        border: "1px solid rgba(255,255,255,0.6)",
        boxShadow: "0 12px 40px rgba(121,100,72,0.09), 0 2px 8px rgba(121,100,72,0.05)",
        overflow: "hidden",
        position: "relative",
      }}>
        {/* Subtle paper grain */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.022'/%3E%3C/svg%3E\")",
          opacity: 0.6, zIndex: 0,
        }}/>
        {/* Subtle left margin line */}
        <div style={{
          position: "absolute", left: 44, top: 0, bottom: 0, width: 1,
          background: "rgba(243,216,199,0.3)", zIndex: 0,
        }}/>

        <div style={{ position: "relative", zIndex: 1, padding: "24px 22px 22px 24px" }}>
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="text-[12px] mb-1" style={{ color: "#8C8187" }}>{LETTER_DATA.date}</div>
              <div className="text-[20px] font-medium leading-tight tracking-[-0.01em]"
                style={{ color: "#4D4249" }}>
                {LETTER_DATA.greeting}
              </div>
            </div>
            {/* Stamp placeholder */}
            <div style={{
              width: 38, height: 38, borderRadius: 8, flexShrink: 0,
              background: "rgba(246,231,168,0.6)",
              border: "1.5px dashed rgba(196,149,58,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>🌿</div>
          </div>

          {/* Body paragraphs */}
          <div className="flex flex-col gap-4">
            {LETTER_DATA.body.map((para, i) => (
              <p key={i} className="text-[15px] leading-[1.65]" style={{ color: "#62575D" }}>
                {para}
              </p>
            ))}
          </div>

          {/* Attachment card */}
          <LetterAttachment saved={attachSaved} onSave={() => setAttachSaved(s => !s)}/>

          {/* Signature */}
          <div className="flex items-center gap-3 mt-1 mb-1">
            <div>
              <div className="text-[15px]" style={{
                color: "#8C8187",
                fontStyle: "italic",
                letterSpacing: "0.02em",
              }}>
                {LETTER_DATA.from}
              </div>
            </div>
            {/* Doodle placeholder */}
            <div style={{
              width: 28, height: 28,
              background: "rgba(243,216,199,0.45)",
              borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14,
            }}>✦</div>
          </div>

          {/* Actions */}
          <LetterActions saved={saved} onAck={onAck} onReply={onReply} onSave={onSave}/>
        </div>
      </div>
    </div>
  );
}

// ─── Letter: Waiting State ────────────────────────────────────────────────────

function WaitingLetterState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-5">
      <div style={{
        width: 120, height: 80, borderRadius: 14,
        background: "rgba(255,252,245,0.65)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.45)",
        boxShadow: "0 8px 24px rgba(121,100,72,0.07)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28,
      }}>✉️</div>
      <div className="text-center">
        <p className="text-[15px] font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>今天的信还在路上</p>
        <p className="text-[13px] leading-snug" style={{ color: "var(--text-muted)" }}>
          有想告诉你的时候，它会送来。
        </p>
      </div>
    </div>
  );
}

// ─── Letter: Daily Letter View ────────────────────────────────────────────────

function DailyLetterView({ onReply, letterState, onOpenLetter, onSaveLetter, onAckLetter }: {
  onReply: () => void;
  letterState: LetterState;
  onOpenLetter: () => void;
  onSaveLetter: () => void;
  onAckLetter: () => void;
}) {
  const saved = letterState === "saved";
  const isOpening = letterState === "opening";
  const showEnvelope = letterState === "sealed" || letterState === "opening";
  const showLetter = letterState === "opened" || letterState === "saved";

  return (
    <div className="flex flex-col">
      <AnimatePresence mode="wait">
        {letterState === "waiting" && (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <WaitingLetterState/>
          </motion.div>
        )}

        {showEnvelope && (
          <motion.div key="envelope"
            className="flex flex-col items-center py-8"
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ duration: 0.25 }}>
            <SealedEnvelope onOpen={onOpenLetter} isOpening={isOpening}/>
          </motion.div>
        )}

        {showLetter && (
          <motion.div key="letter"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 190, mass: 0.9 }}>
            <LetterPaper
              saved={saved}
              onAck={onAckLetter}
              onReply={onReply}
              onSave={onSaveLetter}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Mailbox ─────────────────────────────────────────────────────────────────

function MailboxScreen({ onTaskDetail, onStorageDetail, letterState, onOpenLetter, onSaveLetter, onAckLetter, onReplyLetter }: {
  onTaskDetail: () => void;
  onStorageDetail: () => void;
  letterState: LetterState;
  onOpenLetter: () => void;
  onSaveLetter: () => void;
  onAckLetter: () => void;
  onReplyLetter: () => void;
}) {
  const night = useNight();
  const [sec, setSec] = useState(0);
  const sections = ["桌宠来信", "今日待启", "长久珍藏", "三日寄存"];

  // Tasks state
  const [tasks, setTasks]               = useState<Task[]>(INITIAL_TASKS);
  const [selectedDate, setSelectedDate] = useState(TODAY_DATE);
  const [weekOffset, setWeekOffset]     = useState(0);
  const [showAddTask, setShowAddTask]   = useState(false);

  // Keepsake state
  const [keepsakes, setKeepsakes]           = useState<Keepsake[]>(INITIAL_KEEPSAKES);
  const [selectedKeepsake, setSelectedKeepsake] = useState<Keepsake | null>(null);

  const dayTasks = tasks.filter(t => t.date === selectedDate);

  const toggleTask = (id: string) =>
    setTasks(ts => ts.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  const deleteTask = (id: string) =>
    setTasks(ts => ts.filter(t => t.id !== id));
  const addTask = (t: Task) =>
    setTasks(ts => [...ts, t]);
  const removeKeepsake = (id: string) => {
    setKeepsakes(ks => ks.filter(k => k.id !== id));
    setSelectedKeepsake(null);
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="px-5 pt-[52px] pb-3 flex-shrink-0">
        <h1 className="text-[26px] font-medium tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>信箱</h1>
      </div>
      <div className="px-5 mb-4 flex-shrink-0">
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {sections.map((s, i) => (
            <button key={i} onClick={() => setSec(i)}
              className="flex-shrink-0 px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-150"
              style={{
                background: sec === i
                  ? (night ? "rgba(216,188,118,0.32)" : "rgba(246,231,168,0.88)")
                  : (night ? "rgba(59,51,64,0.55)" : "rgba(255,252,245,0.65)"),
                color: sec === i
                  ? (night ? "#F4EFEA" : "#494145")
                  : (night ? "#B7ADB4" : "#6E6764"),
                border: night ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.4)",
                backdropFilter: "blur(16px)",
              }}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-[100px]" style={{ scrollbarWidth: "none" }}>
        <AnimatePresence mode="wait">
          <motion.div key={sec} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}>
            {sec === 1 && (
              <>
                <WeekNavigator
                  weekOffset={weekOffset}
                  selectedDate={selectedDate}
                  onWeekChange={d => setWeekOffset(o => o + d)}
                  onSelectDate={setSelectedDate}
                  tasks={tasks}
                />
                <AnimatePresence mode="wait">
                  <motion.div key={selectedDate}
                    initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.2 }}>
                    <DailyTaskList
                      selectedDate={selectedDate}
                      tasks={dayTasks}
                      onToggle={toggleTask}
                      onDelete={deleteTask}
                      onAdd={() => setShowAddTask(true)}
                    />
                  </motion.div>
                </AnimatePresence>
              </>
            )}
            {sec === 0 && (
              <DailyLetterView
                letterState={letterState}
                onOpenLetter={onOpenLetter}
                onSaveLetter={onSaveLetter}
                onAckLetter={onAckLetter}
                onReply={onReplyLetter}
              />
            )}
            {sec === 2 && (
              <KeepsakeAlbum
                keepsakes={keepsakes}
                onSelectItem={setSelectedKeepsake}
                onRemove={removeKeepsake}
              />
            )}
            {sec === 3 && (
              <>
                {[
                  { title: "那次和妈妈的通话",    time: "2天后到期", tag: "温暖" },
                  { title: "昨晚想到的一个主意",  time: "1天后到期", tag: "灵感" },
                  { title: "有点烦那件事",         time: "今天到期",  tag: "情绪" },
                ].map((s, i) => (
                  <GlassCard key={i} className="p-4 flex items-center gap-4 mb-3" onClick={onStorageDetail}>
                    <div className="flex-1">
                      <div className="text-[15px] font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>{s.title}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(246,231,168,0.65)", color: "#655D61" }}>{s.tag}</span>
                        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{s.time}</span>
                      </div>
                    </div>
                    <ChevronRight size={15} style={{ color: "var(--text-muted)" }}/>
                  </GlassCard>
                ))}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* AddTask bottom sheet */}
      <AnimatePresence>
        {showAddTask && (
          <AddTaskSheet
            defaultDate={selectedDate}
            onClose={() => setShowAddTask(false)}
            onAdd={addTask}
          />
        )}
      </AnimatePresence>

      {/* Keepsake detail overlay */}
      <AnimatePresence>
        {selectedKeepsake && (
          <KeepsakeDetail
            item={selectedKeepsake}
            onClose={() => setSelectedKeepsake(null)}
            onRemove={() => removeKeepsake(selectedKeepsake.id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Task Detail ─────────────────────────────────────────────────────────────

function TaskDetail({ onBack }: { onBack: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col h-full">
      <SafeHeader onBack={onBack} title="今日待启"/>
      <div className="flex-1 px-5 pt-4 pb-[100px] flex flex-col gap-4">
        <GlassCard className="p-6">
          <div className="text-3xl mb-3">📅</div>
          <h2 className="text-[20px] font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>与朋友的约定</h2>
          <p className="text-[14px] mb-3" style={{ color: "var(--text-secondary)" }}>下午 3:00 · 你昨晚提到担心会迟到</p>
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            昨晚你说起这件事，有点担心来不及。我帮你留着了。
          </p>
        </GlassCard>
        <button onClick={() => setDone(!done)}
          className="w-full p-4 rounded-[20px] flex items-center gap-3 transition-all duration-200 active:scale-[0.97]"
          style={{
            background: done ? "rgba(246,231,168,0.6)" : "rgba(255,252,245,0.65)",
            border: "1px solid rgba(255,255,255,0.45)",
            backdropFilter: "blur(20px)",
          }}>
          <div className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{
              background: done ? "rgba(196,149,58,0.8)" : "transparent",
              border: `2px solid ${done ? "rgba(196,149,58,0.8)" : "rgba(91,79,62,0.22)"}`,
            }}>
            {done && <Check size={12} style={{ color: "#fff" }}/>}
          </div>
          <span className={`text-[15px] font-medium ${done ? "line-through" : ""}`} style={{ color: "var(--text-primary)" }}>
            {done ? "已完成，做到了" : "标记为完成"}
          </span>
        </button>
        {done && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <GlassCard className="p-4 text-center" style={{ background: "rgba(221,237,227,0.45)" }}>
              <p className="text-[14px]" style={{ color: "var(--text-primary)" }}>做完了，今天又少了一件事 🌿</p>
            </GlassCard>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ─── Storage Detail ───────────────────────────────────────────────────────────

function StorageDetail({ onBack }: { onBack: () => void }) {
  const [action, setAction] = useState<"none" | "treasure" | "release">("none");
  return (
    <div className="flex flex-col h-full">
      <SafeHeader onBack={onBack} title="三日寄存"/>
      <div className="flex-1 px-5 pt-4 pb-[100px] flex flex-col gap-4">
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] px-2.5 py-1 rounded-full font-medium"
              style={{ background: "rgba(246,231,168,0.7)", color: "#655D61" }}>情绪</span>
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>1天后到期</span>
          </div>
          <h2 className="text-[18px] font-medium mb-3" style={{ color: "var(--text-primary)" }}>那次和妈妈的通话</h2>
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            昨晚说到你们的对话，你有点担心她最近的状态。这个感受被我留在这里了，三天后如果你没有更多想说的，我会轻轻放下它。
          </p>
        </GlassCard>
        {action === "none" && (
          <div className="flex gap-3">
            <button onClick={() => setAction("treasure")}
              className="flex-1 py-4 rounded-[20px] flex flex-col items-center gap-2 active:scale-[0.97] transition-transform"
              style={{ background: "rgba(246,231,168,0.55)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <Star size={20} style={{ color: "#C4953A" }}/>
              <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>珍藏</span>
            </button>
            <button onClick={() => setAction("release")}
              className="flex-1 py-4 rounded-[20px] flex flex-col items-center gap-2 active:scale-[0.97] transition-transform"
              style={{ background: "rgba(221,237,227,0.55)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <Archive size={20} style={{ color: "#5A8A6A" }}/>
              <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>放下</span>
            </button>
          </div>
        )}
        {action !== "none" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <GlassCard className="p-5 text-center"
              style={{ background: action === "treasure" ? "rgba(246,231,168,0.42)" : "rgba(221,237,227,0.42)" }}>
              <div className="text-2xl mb-2">{action === "treasure" ? "⭐" : "🌊"}</div>
              <p className="text-[14px]" style={{ color: "var(--text-primary)" }}>
                {action === "treasure" ? "已加入长久珍藏" : "已轻轻放下，谢谢你把它告诉我"}
              </p>
            </GlassCard>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ─── Scene ────────────────────────────────────────────────────────────────────

// ─── Scene Data ───────────────────────────────────────────────────────────────

interface BuiltInScene {
  id: string; title: string; desc: string;
  relationships: string[]; bgGradient: string;
  ambientColor: string; ambientColor2: string;
}

const BUILT_IN_SCENES: BuiltInScene[] = [
  {
    id: "night-call",
    title: "深夜通话",
    desc: "有些话，隔着一通电话才说得出口。",
    relationships: ["恋人","朋友","异地家人"],
    bgGradient: "linear-gradient(185deg,#261A10 0%,#3A2618 45%,#4D3828 75%,#5C4838 100%)",
    ambientColor: "rgba(255,148,48,0.18)",
    ambientColor2: "rgba(255,200,100,0.10)",
  },
  {
    id: "dinner-table",
    title: "家中餐桌",
    desc: "最难说出口的话，常常发生在最熟悉的地方。",
    relationships: ["父母","家庭","伴侣"],
    bgGradient: "linear-gradient(180deg,#F5ECD8 0%,#EDD9BE 45%,#E2C9A0 100%)",
    ambientColor: "rgba(255,195,60,0.38)",
    ambientColor2: "rgba(255,230,140,0.22)",
  },
  {
    id: "leaving-road",
    title: "离开的路上",
    desc: "有些告别，也许还来得及换一种说法。",
    relationships: ["恋人","朋友","同学","同事"],
    bgGradient: "linear-gradient(180deg,#E8D5C0 0%,#D9C09E 42%,#C8A882 72%,#B89878 100%)",
    ambientColor: "rgba(255,175,70,0.32)",
    ambientColor2: "rgba(240,200,130,0.18)",
  },
];

interface TempCharacter {
  displayName: string; relationship: string; role: string;
  personalitySummary: string; speakingStyle: string;
  conflictResponse: string; currentAdjustment: string;
  traits: string[];
}

type SceneSubState =
  | "browsing" | "capturing" | "reviewing"
  | "setup-who" | "setup-describe" | "setup-confirm";

// ─── Scene Portal (one carousel card) ────────────────────────────────────────

function ScenePortal({ scene, isActive, onEnter }: {
  scene: BuiltInScene; isActive: boolean; onEnter: () => void;
}) {
  return (
    <motion.div
      animate={{ scale: isActive ? 1 : 0.93, opacity: isActive ? 1 : 0.72 }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
      className="flex-shrink-0 rounded-[30px] overflow-hidden relative cursor-pointer"
      style={{ width: 310, height: 390 }}
      onClick={isActive ? onEnter : undefined}>
      {/* Background */}
      <div className="absolute inset-0" style={{ background: scene.bgGradient }}/>
      {/* Ambient glow */}
      <div className="absolute inset-0" style={{
        background: `radial-gradient(ellipse at 45% 38%,${scene.ambientColor} 0%,transparent 58%)`
      }}/>
      <div className="absolute inset-0" style={{
        background: `radial-gradient(ellipse at 72% 72%,${scene.ambientColor2} 0%,transparent 52%)`
      }}/>
      {/* Grain */}
      <div className="absolute inset-0" style={{ backgroundImage: GRAIN, opacity: 0.7 }}/>
      {/* Top label */}
      <div className="absolute top-5 left-5">
        <span className="text-[10px] px-2.5 py-1 rounded-full font-medium"
          style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(12px)",
            color: "rgba(255,255,255,0.72)", border: "1px solid rgba(255,255,255,0.2)" }}>
          内置场景
        </span>
      </div>
      {/* Bottom gradient + content */}
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 pt-20"
        style={{ background: "linear-gradient(to top, rgba(30,20,12,0.72) 0%, transparent 100%)" }}>
        <div className="text-[11px] mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>
          {scene.relationships.join(" · ")}
        </div>
        <h3 className="text-[22px] font-medium mb-1 leading-tight"
          style={{ color: "rgba(255,255,255,0.95)" }}>{scene.title}</h3>
        <p className="text-[13px] leading-snug mb-4"
          style={{ color: "rgba(255,255,255,0.65)" }}>{scene.desc}</p>
        {isActive && (
          <button onClick={e => { e.stopPropagation(); onEnter(); }}
            className="px-5 py-2.5 rounded-full text-[13px] font-medium active:scale-[0.96] transition-transform"
            style={{ background: "rgba(255,252,245,0.2)", backdropFilter: "blur(16px)",
              color: "rgba(255,255,255,0.92)", border: "1.5px solid rgba(255,255,255,0.32)" }}>
            进入场景
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Voice Create Entry ───────────────────────────────────────────────────────

function CreateSceneEntry({ onStart }: { onStart: () => void }) {
  const [pulsing, setPulsing] = useState(false);
  return (
    <div className="mx-0 mt-8 mb-4">
      <div className="text-center mb-6">
        <h3 className="text-[16px] font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
          描述一个你想进入的场景
        </h3>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          你来说发生了什么，我们替你搭好片场。
        </p>
      </div>
      {/* Voice button with glow rings */}
      <div className="flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
          <div className="absolute rounded-full" style={{
            width: 88, height: 88,
            background: "rgba(246,231,168,0.18)",
            animation: "scenePulse 2.8s ease-in-out infinite",
          }}/>
          <div className="absolute rounded-full" style={{
            width: 72, height: 72,
            background: "rgba(243,216,199,0.22)",
            animation: "scenePulse 2.8s ease-in-out infinite 0.6s",
          }}/>
          <motion.button
            onClick={() => { setPulsing(true); onStart(); }}
            whileTap={{ scale: 0.93 }}
            className="relative z-10 flex items-center justify-center rounded-full"
            style={{
              width: 56, height: 56,
              background: "rgba(255,252,245,0.82)",
              backdropFilter: "blur(20px)",
              border: "1.5px solid rgba(255,255,255,0.6)",
              boxShadow: "0 8px 32px rgba(196,149,58,0.18)",
            }}>
            <Mic size={20} style={{ color: "#C4953A" }}/>
          </motion.button>
        </div>
        <button onClick={onStart}
          className="text-[12px] active:opacity-60" style={{ color: "var(--text-muted)" }}>
          用文字描述
        </button>
      </div>
      <style>{`
        @keyframes scenePulse {
          0%,100%{transform:scale(1);opacity:0.7}
          50%{transform:scale(1.12);opacity:0.35}
        }
      `}</style>
    </div>
  );
}

// ─── Scene Narration Capture ──────────────────────────────────────────────────

function SceneNarrationCapture({ onBack, onConfirm }: {
  onBack: () => void;
  onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const placeholder = "我想回到上周和朋友吵架之后。地点在学校门口，她准备打车离开。她平时比较敏感，生气后会假装不在意，但其实很希望我先道歉。我想试着把她叫住。";
  return (
    <div className="flex flex-col h-full">
      <SafeHeader onBack={onBack} title="描述你的场景"/>
      <div className="flex-1 px-5 pb-6 flex flex-col gap-5 overflow-y-auto" style={{ scrollbarWidth:"none" }}>
        <div>
          <p className="text-[16px] font-medium mb-1.5" style={{ color:"var(--text-primary)" }}>
            说说你在哪里、谁在你面前，以及发生了什么。
          </p>
          <p className="text-[13px]" style={{ color:"var(--text-muted)" }}>
            不用分段，像说话一样讲就好。
          </p>
        </div>
        <div className="flex-1 relative">
          <textarea
            value={text} onChange={e => setText(e.target.value)}
            placeholder={placeholder} rows={8}
            className="w-full h-full px-5 py-4 rounded-[20px] outline-none text-[14px] leading-relaxed resize-none"
            style={{
              background:"rgba(255,252,245,0.65)", backdropFilter:"blur(20px)",
              border:"1px solid rgba(255,255,255,0.45)", color:"#484145",
              minHeight: 200,
            }}
          />
        </div>
        {/* Voice button */}
        <div className="flex flex-col items-center gap-3">
          <motion.button
            onTouchStart={() => setIsRecording(true)} onTouchEnd={() => setIsRecording(false)}
            onClick={() => setIsRecording(v => !v)}
            animate={isRecording ? { scale: [1,1.06,1], transition:{ repeat:Infinity, duration:1.1 }} : { scale:1 }}
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              background: isRecording ? "rgba(243,216,199,0.88)" : "rgba(246,231,168,0.72)",
              border: `2px solid ${isRecording ? "rgba(196,149,58,0.55)" : "rgba(255,255,255,0.55)"}`,
              boxShadow: isRecording ? "0 0 0 8px rgba(246,231,168,0.2)" : "none",
            }}>
            <Mic size={22} style={{ color: "#C4953A" }}/>
          </motion.button>
          <span className="text-[12px]" style={{ color:"var(--text-muted)" }}>
            {isRecording ? "松开结束录音" : "按住说话"}
          </span>
        </div>
        <PrimaryBtn onClick={() => onConfirm(text || placeholder)} full disabled={!text.trim() && false}>
          我说完了
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ─── Scene Summary Preview ────────────────────────────────────────────────────

function SceneSummaryPreview({ onBack, onConfirm }: {
  onBack: () => void; onConfirm: () => void;
}) {
  const items = [
    { label:"地点", value:"学校门口" },
    { label:"人物", value:"朋友" },
    { label:"对方当前行动", value:"准备打车离开" },
    { label:"对方性格", value:"敏感、表面冷淡、希望对方先行动" },
    { label:"你想尝试", value:"叫住她并道歉" },
  ];
  return (
    <div className="flex flex-col h-full">
      <SafeHeader onBack={onBack} title="场景整理"/>
      <div className="flex-1 px-5 pb-6 flex flex-col gap-5 overflow-y-auto" style={{ scrollbarWidth:"none" }}>
        <div>
          <p className="text-[17px] font-medium mb-1" style={{ color:"var(--text-primary)" }}>我整理了一下</p>
          <p className="text-[13px]" style={{ color:"var(--text-muted)" }}>有不准确的地方可以告诉我。</p>
        </div>
        <div className="rounded-[20px] overflow-hidden"
          style={{ background:"rgba(255,252,245,0.72)", backdropFilter:"blur(20px)",
            border:"1px solid rgba(255,255,255,0.45)" }}>
          {items.map((item, i) => (
            <div key={i} className={`flex gap-3 px-5 py-3.5 ${i < items.length-1 ? "border-b" : ""}`}
              style={{ borderColor:"rgba(91,79,62,0.06)" }}>
              <span className="text-[12px] flex-shrink-0 pt-0.5 w-24" style={{ color:"var(--text-muted)" }}>{item.label}</span>
              <span className="text-[14px] flex-1 leading-snug" style={{ color:"var(--text-primary)" }}>{item.value}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 mt-auto">
          <PrimaryBtn onClick={onConfirm} full>就是这样，继续</PrimaryBtn>
          <button onClick={onBack}
            className="w-full py-3 text-[13px] active:opacity-60" style={{ color:"var(--text-muted)" }}>
            有些地方不对，我重新说
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Character Setup Sheet ────────────────────────────────────────────────────

function CharacterSetupSheet({ scene, onBack, onReady }: {
  scene: BuiltInScene | null; onBack: () => void;
  onReady: (char: TempCharacter) => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [rel, setRel] = useState(scene?.relationships[0] ?? "");
  const [desc, setDesc] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [adjusted, setAdjusted] = useState("");
  const [entryRipple, setEntryRipple] = useState(false);

  const mockTraits = [
    `说话${scene?.id === "dinner-table" ? "直接，语气偏强势" : "温柔，但习惯绕弯"}`,
    "关心你，但不擅长直接表达",
    "遇到冲突时容易先防御",
    "很少主动承认自己说重了",
    "担心常常表现为批评",
  ];

  const finalChar: TempCharacter = {
    displayName: name || "她", relationship: rel, role: rel,
    personalitySummary: desc, speakingStyle: "温和，偶尔强势",
    conflictResponse: "先防御，再沉默",
    currentAdjustment: adjusted, traits: mockTraits,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Blurred scene background */}
      <div className="absolute inset-0" style={{
        background: scene?.bgGradient ?? "linear-gradient(180deg,#F2E8D5,#E8D9C0)",
        filter: "blur(8px) brightness(1.08)", transform: "scale(1.05)",
      }}/>
      <div className="absolute inset-0" style={{ background:"rgba(255,251,243,0.55)", backdropFilter:"blur(8px)" }}/>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center px-5 pt-[52px] pb-4">
          <button onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full active:opacity-60"
            style={{ background:"rgba(255,252,245,0.65)", border:"1px solid rgba(255,255,255,0.45)" }}>
            <ChevronLeft size={16} style={{ color:"var(--text-secondary)" }}/>
          </button>
          <div className="flex-1 flex justify-center gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="h-1 w-8 rounded-full transition-all duration-200"
                style={{ background: i <= step ? "rgba(196,149,58,0.65)" : "rgba(91,79,62,0.12)" }}/>
            ))}
          </div>
          <div className="w-8"/>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6" style={{ scrollbarWidth:"none" }}>
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-8 }} transition={{ duration:0.2 }} className="flex flex-col gap-5">

              {step === 0 && (
                <>
                  <div>
                    <h2 className="text-[20px] font-medium mb-1.5" style={{ color:"var(--text-primary)" }}>
                      这个场景里，谁在你面前？
                    </h2>
                    <p className="text-[13px]" style={{ color:"var(--text-muted)" }}>不需要真实姓名，用你习惯的称呼。</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <input value={name} onChange={e => setName(e.target.value)}
                      placeholder="比如：妈妈、她、老朋友…"
                      className="w-full px-5 py-4 rounded-[20px] outline-none text-[15px]"
                      style={{ background:"rgba(255,252,245,0.72)", backdropFilter:"blur(20px)",
                        border:"1px solid rgba(255,255,255,0.5)", color:"#484145" }}
                    />
                    <div>
                      <p className="text-[12px] mb-2 px-1" style={{ color:"var(--text-muted)" }}>关系</p>
                      <div className="flex flex-wrap gap-2">
                        {(scene?.relationships ?? ["朋友","家人","恋人","同事"]).map(r => (
                          <button key={r} onClick={() => setRel(r)}
                            className="px-4 py-2 rounded-full text-[13px] transition-all active:scale-[0.96]"
                            style={{
                              background: rel===r ? "rgba(246,231,168,0.88)" : "rgba(255,252,245,0.65)",
                              color:"var(--text-primary)",
                              border: rel===r ? "1.5px solid rgba(196,149,58,0.45)" : "1px solid rgba(255,255,255,0.45)",
                            }}>
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <PrimaryBtn onClick={() => setStep(1)} full disabled={!rel}>继续</PrimaryBtn>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div>
                    <h2 className="text-[20px] font-medium mb-1.5" style={{ color:"var(--text-primary)" }}>
                      像向一个没见过 TA 的朋友那样，介绍一下 TA。
                    </h2>
                    <p className="text-[13px]" style={{ color:"var(--text-muted)" }}>
                      TA 平时怎么说话？遇到冲突时会怎样？有什么话总是不愿意直接说？
                    </p>
                  </div>
                  <textarea value={desc} onChange={e => setDesc(e.target.value)}
                    placeholder={`比如：${name||"她"}平时说话比较直，不太表达关心，但其实很在意我…`}
                    rows={5}
                    className="w-full px-5 py-4 rounded-[20px] outline-none text-[14px] leading-relaxed resize-none"
                    style={{ background:"rgba(255,252,245,0.72)", backdropFilter:"blur(20px)",
                      border:"1px solid rgba(255,255,255,0.5)", color:"#484145" }}
                  />
                  <div className="flex flex-col items-center gap-2">
                    <motion.button
                      onClick={() => setIsRecording(v => !v)}
                      animate={isRecording ? { scale:[1,1.05,1], transition:{ repeat:Infinity, duration:1.2 }} : { scale:1 }}
                      className="w-14 h-14 rounded-full flex items-center justify-center"
                      style={{
                        background: isRecording ? "rgba(243,216,199,0.88)" : "rgba(246,231,168,0.72)",
                        border:`2px solid ${isRecording ? "rgba(196,149,58,0.55)" : "rgba(255,255,255,0.55)"}`,
                      }}>
                      <Mic size={18} style={{ color:"#C4953A" }}/>
                    </motion.button>
                    <span className="text-[11px]" style={{ color:"var(--text-muted)" }}>
                      {isRecording ? "松开结束" : "也可以说"}
                    </span>
                  </div>
                  <PrimaryBtn onClick={() => setStep(2)} full>整理一下</PrimaryBtn>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <p className="text-[13px] mb-0.5" style={{ color:"var(--text-muted)" }}>根据你说的，</p>
                    <h2 className="text-[20px] font-medium" style={{ color:"var(--text-primary)" }}>
                      {name || "TA"}，在这场对话中：
                    </h2>
                  </div>
                  <div className="rounded-[20px] overflow-hidden"
                    style={{ background:"rgba(255,252,245,0.78)", backdropFilter:"blur(20px)",
                      border:"1px solid rgba(255,255,255,0.5)" }}>
                    {mockTraits.map((trait, i) => (
                      <div key={i} className={`flex items-start gap-3 px-5 py-3 ${i < mockTraits.length-1 ? "border-b" : ""}`}
                        style={{ borderColor:"rgba(91,79,62,0.06)" }}>
                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                          style={{ background:"rgba(196,149,58,0.55)" }}/>
                        <span className="text-[14px] leading-snug" style={{ color:"var(--text-primary)" }}>{trait}</span>
                      </div>
                    ))}
                  </div>
                  {/* Adjust input */}
                  <div>
                    <input value={adjusted} onChange={e => setAdjusted(e.target.value)}
                      placeholder="有一点不像？补充一句…"
                      className="w-full px-5 py-3.5 rounded-[16px] outline-none text-[14px]"
                      style={{ background:"rgba(255,252,245,0.65)", backdropFilter:"blur(16px)",
                        border:"1px solid rgba(255,255,255,0.45)", color:"#484145" }}
                    />
                    <p className="text-[11px] mt-3 text-center" style={{ color:"var(--text-muted)" }}>
                      人物设定仅用于本次场景，离开后会清除。
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="relative overflow-hidden rounded-full">
                      <CreamRipple active={entryRipple}/>
                      <PrimaryBtn onClick={() => {
                        setEntryRipple(true);
                        setTimeout(() => { setEntryRipple(false); onReady(finalChar); }, 380);
                      }} full>就是这样的，进入场景</PrimaryBtn>
                    </div>
                    <button onClick={() => setStep(1)}
                      className="w-full py-3 text-[13px] active:opacity-60" style={{ color:"var(--text-muted)" }}>
                      有一点不像，重新描述
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Scene Screen (Home) ──────────────────────────────────────────────────────

function SceneScreen({ onCreate, onPlay }: { onCreate: () => void; onPlay: () => void }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [subState, setSubState] = useState<SceneSubState>("browsing");
  const [selectedScene, setSelectedScene] = useState<BuiltInScene | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSelectScene = (scene: BuiltInScene) => {
    setSelectedScene(scene);
    setSubState("setup-who");
  };
  const handleVoiceStart = () => setSubState("capturing");
  const handleNarrationConfirm = () => setSubState("reviewing");
  const handleSummaryConfirm = () => setSubState("setup-who");
  const handleCharReady = () => onPlay();
  const handleBack = () => {
    if (subState === "capturing") setSubState("browsing");
    else if (subState === "reviewing") setSubState("capturing");
    else if (subState === "setup-who") setSubState(selectedScene ? "browsing" : "reviewing");
    else setSubState("browsing");
  };

  if (subState === "capturing") {
    return <SceneNarrationCapture onBack={handleBack} onConfirm={handleNarrationConfirm}/>;
  }
  if (subState === "reviewing") {
    return <SceneSummaryPreview onBack={handleBack} onConfirm={handleSummaryConfirm}/>;
  }
  if (subState === "setup-who" || subState === "setup-describe" || subState === "setup-confirm") {
    return <CharacterSetupSheet scene={selectedScene} onBack={handleBack} onReady={handleCharReady}/>;
  }

  // ── Browsing ──
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[52px] pb-4 flex-shrink-0">
        <h1 className="text-[26px] font-medium tracking-[-0.02em]" style={{ color:"var(--text-primary)" }}>片场</h1>
        <p className="text-[13px] mt-1" style={{ color:"var(--text-muted)" }}>
          进入一个场景，试着说出不同的话。
        </p>
      </div>

      {/* Carousel */}
      <div className="flex-shrink-0 relative" style={{ height: 420 }}>
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto h-full items-center"
          style={{ scrollbarWidth:"none", scrollSnapType:"x mandatory",
            paddingLeft: 24, paddingRight: 24 }}
          onScroll={e => {
            const el = e.currentTarget;
            const idx = Math.round(el.scrollLeft / 326);
            setActiveIdx(Math.max(0, Math.min(idx, BUILT_IN_SCENES.length-1)));
          }}>
          {BUILT_IN_SCENES.map((scene, i) => (
            <div key={scene.id} style={{ scrollSnapAlign:"center", flexShrink:0 }}>
              <ScenePortal
                scene={scene}
                isActive={activeIdx === i}
                onEnter={() => handleSelectScene(scene)}
              />
            </div>
          ))}
        </div>
        {/* Dot indicators */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {BUILT_IN_SCENES.map((_, i) => (
            <div key={i} className="rounded-full transition-all duration-200"
              style={{
                width: activeIdx===i ? 16 : 6, height: 6,
                background: activeIdx===i ? "rgba(196,149,58,0.7)" : "rgba(196,149,58,0.25)",
              }}/>
          ))}
        </div>
      </div>

      {/* Voice create entry + scroll */}
      <div className="flex-1 overflow-y-auto px-5 pb-[100px]" style={{ scrollbarWidth:"none" }}>
        <div className="h-px my-6" style={{ background:"rgba(91,79,62,0.08)" }}/>
        <CreateSceneEntry onStart={handleVoiceStart}/>
      </div>
    </div>
  );
}

// ─── Scene Create (unused shell kept for navigation type compat) ──────────────

function SceneCreate({ onBack, onReady }: { onBack: () => void; onReady: () => void }) {
  const [step, setStep] = useState(0);
  const [who, setWho]   = useState("");
  const [where, setWhere] = useState("");
  const [what, setWhat] = useState("");
  const [intent, setIntent] = useState("");

  const stepLabels = ["人物", "地点", "经过", "想尝试"];
  const choices = [
    "说出当时没说的话",
    "尝试另一种回应方式",
    "只是重新经历一次",
  ];

  return (
    <div className="flex flex-col h-full">
      <SafeHeader onBack={onBack}/>
      <div className="flex-1 px-5 pb-[100px] flex flex-col">
        <div className="flex gap-2 mb-6">
          {stepLabels.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="h-1 w-full rounded-full"
                style={{ background: i <= step ? "rgba(196,149,58,0.65)" : "rgba(91,79,62,0.1)" }}/>
              <span className="text-[11px]" style={{ color: i === step ? "#847D72" : "#C0B5A8" }}>{s}</span>
            </div>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col gap-4">
            {step === 0 && (
              <>
                <h2 className="text-[22px] font-medium" style={{ color: "var(--text-primary)" }}>涉及到谁？</h2>
                <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>不需要真实姓名，用你习惯的称呼</p>
                <input value={who} onChange={e => setWho(e.target.value)}
                  placeholder="比如：妈妈、老朋友、前同事…"
                  className="w-full px-5 py-4 rounded-[20px] outline-none text-[15px]"
                  style={{ background: "rgba(255,252,245,0.65)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.45)", color: "#484145" }}
                />
              </>
            )}
            {step === 1 && (
              <>
                <h2 className="text-[22px] font-medium" style={{ color: "var(--text-primary)" }}>在哪里？</h2>
                <input value={where} onChange={e => setWhere(e.target.value)}
                  placeholder="咖啡厅、家里、电话里…"
                  className="w-full px-5 py-4 rounded-[20px] outline-none text-[15px]"
                  style={{ background: "rgba(255,252,245,0.65)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.45)", color: "#484145" }}
                />
              </>
            )}
            {step === 2 && (
              <>
                <h2 className="text-[22px] font-medium" style={{ color: "var(--text-primary)" }}>简单说说经过</h2>
                <textarea value={what} onChange={e => setWhat(e.target.value)}
                  placeholder="发生了什么，或者你当时是什么感受…" rows={5}
                  className="w-full px-5 py-4 rounded-[20px] outline-none text-[15px] resize-none leading-relaxed"
                  style={{ background: "rgba(255,252,245,0.65)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.45)", color: "#484145" }}
                />
              </>
            )}
            {step === 3 && (
              <>
                <h2 className="text-[22px] font-medium" style={{ color: "var(--text-primary)" }}>你想尝试什么？</h2>
                <div className="flex flex-col gap-2">
                  {choices.map((c, i) => (
                    <button key={i} onClick={() => setIntent(c)}
                      className="w-full p-4 rounded-[20px] text-left text-[15px] leading-snug transition-all duration-100 active:scale-[0.97]"
                      style={{
                        background: intent === c ? "rgba(246,231,168,0.55)" : "rgba(255,252,245,0.65)",
                        border: intent === c ? "1.5px solid rgba(196,149,58,0.45)" : "1px solid rgba(255,255,255,0.45)",
                        color: "var(--text-primary)",
                        backdropFilter: "blur(20px)",
                      }}>
                      {c}
                    </button>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="pt-4">
          {step < 3
            ? <PrimaryBtn onClick={() => setStep(s => s + 1)} full>继续</PrimaryBtn>
            : <PrimaryBtn onClick={onReady} full disabled={!intent}>准备好了</PrimaryBtn>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Character Artwork Placeholder ───────────────────────────────────────────

function CharacterArtwork({ name, isSpeaking, isListening }: {
  name: string; isSpeaking: boolean; isListening: boolean;
}) {
  return (
    <motion.div
      animate={isSpeaking
        ? { y: [0, -4, 0], transition: { repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        : isListening
          ? { y: [0, -2, 0], transition: { repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
          : { y: 0 }}
      className="relative flex flex-col items-center">
      {/* Soft glow behind figure */}
      <div className="absolute" style={{
        width: 140, height: 200, top: -20, left: "50%", transform: "translateX(-50%)",
        background: "radial-gradient(ellipse,rgba(255,240,200,0.32) 0%,transparent 70%)",
        pointerEvents: "none",
      }}/>
      {/* Abstract figure */}
      <div className="relative" style={{ width: 110, height: 155 }}>
        {/* Head */}
        <div className="absolute rounded-full" style={{
          width: 58, height: 58, top: 0, left: "50%", transform: "translateX(-50%)",
          background: "linear-gradient(145deg,rgba(255,245,225,0.85),rgba(240,225,200,0.75))",
          backdropFilter: "blur(8px)",
          border: "1.5px solid rgba(255,255,255,0.45)",
          boxShadow: "0 6px 20px rgba(121,100,72,0.14)",
        }}>
          {/* Minimal face dots */}
          <div className="absolute" style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(91,79,62,0.28)", top: 20, left: 15 }}/>
          <div className="absolute" style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(91,79,62,0.28)", top: 20, right: 15 }}/>
          {/* Mouth — subtle */}
          <div className="absolute" style={{
            width: 16, height: 4, bottom: 13, left: "50%", transform: "translateX(-50%)",
            borderBottom: `2px solid rgba(91,79,62,${isSpeaking ? "0.42" : "0.22"})`,
            borderRadius: "0 0 8px 8px",
          }}/>
        </div>
        {/* Body */}
        <div className="absolute rounded-[28px]" style={{
          width: 80, height: 85, top: 62, left: "50%", transform: "translateX(-50%)",
          background: "linear-gradient(160deg,rgba(255,245,230,0.72),rgba(240,225,205,0.62))",
          backdropFilter: "blur(8px)",
          border: "1.5px solid rgba(255,255,255,0.4)",
          boxShadow: "0 8px 24px rgba(121,100,72,0.10)",
        }}>
          {/* Breathing animation */}
          <motion.div
            animate={{ scaleY: [1, 1.02, 1] }}
            transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
            className="absolute inset-0 rounded-[28px]"
            style={{ background: "rgba(255,255,255,0.08)" }}
          />
        </div>
      </div>
      {/* Name tag */}
      <div className="mt-3 px-4 py-1.5 rounded-full text-[13px] font-medium"
        style={{
          background: "rgba(255,252,245,0.55)", backdropFilter: "blur(12px)",
          color: "rgba(255,255,255,0.88)", border: "1px solid rgba(255,255,255,0.28)",
          textShadow: "0 1px 4px rgba(0,0,0,0.18)",
        }}>
        {name}
        {isSpeaking && <span className="ml-1.5 text-[10px]" style={{ color:"rgba(255,200,100,0.9)" }}>●</span>}
      </div>
    </motion.div>
  );
}

// ─── Scene Play ───────────────────────────────────────────────────────────────

function ScenePlay({ onEnd }: { onEnd: () => void }) {
  const [phase, setPhase]         = useState<"intro"|"playing"|"paused">("intro");
  const [dlgIdx, setDlgIdx]       = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [adjustInput, setAdjustInput] = useState("");
  const [showAdjust, setShowAdjust] = useState(false);

  const charName = "妈妈";
  const sceneName = "家中餐桌";

  const dialogs = [
    { from:"char", text:"你最近怎么了？感觉你一直很忙，也不怎么联系家里…" },
    { from:"user-prompt", text:"你想说什么？" },
    { from:"char", text:"我就是担心你。你一个人在外面，遇到事情了也不跟我说。" },
  ];

  const curr = dlgIdx < dialogs.length ? dialogs[dlgIdx] : dialogs[dialogs.length-1];

  const handleUserSpeak = () => {
    setIsListening(v => !v);
    if (isListening) {
      setTimeout(() => {
        setIsListening(false);
        setIsSpeaking(true);
        setDlgIdx(i => Math.min(i+1, dialogs.length-1));
        setTimeout(() => setIsSpeaking(false), 2800);
      }, 800);
    }
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Scene background */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(180deg,#EDD9BE 0%,#E2C9A0 50%,#D8BA8A 100%)",
      }}>
        {/* Warm lamp glow */}
        <div className="absolute" style={{
          width: 280, height: 280, top: 60, left: "50%", transform: "translateX(-50%)",
          background: "radial-gradient(ellipse,rgba(255,195,60,0.38) 0%,transparent 65%)",
          animation: "lampFlicker 4s ease-in-out infinite",
        }}/>
        {/* Steam particles */}
        <div className="absolute" style={{ bottom: 220, left: "42%", opacity:0.4,
          animation: "steamRise 3.5s ease-in-out infinite" }}>
          <div style={{ width:3, height:18, borderRadius:2,
            background:"rgba(255,255,255,0.5)", filter:"blur(2px)" }}/>
        </div>
        <div className="absolute" style={{ bottom: 210, left: "52%", opacity:0.3,
          animation: "steamRise 3.5s ease-in-out infinite 1.2s" }}>
          <div style={{ width:2, height:14, borderRadius:2,
            background:"rgba(255,255,255,0.45)", filter:"blur(2px)" }}/>
        </div>
        <div className="absolute inset-0" style={{ backgroundImage: GRAIN, opacity:0.55 }}/>
      </div>

      <style>{`
        @keyframes lampFlicker{0%,100%{opacity:1}50%{opacity:0.82}}
        @keyframes steamRise{0%{transform:translateY(0) scaleX(1);opacity:0.4}
          50%{transform:translateY(-24px) scaleX(1.4);opacity:0.2}
          100%{transform:translateY(-42px) scaleX(0.7);opacity:0}}
      `}</style>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-[52px] pb-4">
        <button onClick={() => setPhase(phase === "paused" ? "playing" : "paused")}
          className="px-3.5 py-2 rounded-full text-[13px] active:opacity-70 flex items-center gap-1.5"
          style={{ background:"rgba(255,252,245,0.28)", backdropFilter:"blur(16px)",
            border:"1px solid rgba(255,255,255,0.38)", color:"rgba(255,255,255,0.82)" }}>
          {phase==="paused" ? <Play size={12}/> : <span style={{fontSize:10}}>⏸</span>}
          {phase==="paused" ? "继续" : "暂停"}
        </button>
        <div className="text-center">
          <div className="text-[13px] font-medium" style={{ color:"rgba(255,255,255,0.9)" }}>{sceneName}</div>
          <div className="text-[11px]" style={{ color:"rgba(255,255,255,0.55)" }}>{charName}</div>
        </div>
        <button onClick={onEnd}
          className="px-3.5 py-2 rounded-full text-[13px] active:opacity-70"
          style={{ background:"rgba(255,252,245,0.22)", backdropFilter:"blur(16px)",
            border:"1px solid rgba(255,255,255,0.35)", color:"rgba(255,255,255,0.72)" }}>
          离开
        </button>
      </div>

      {/* Character in center */}
      <div className="relative z-10 flex-1 flex items-center justify-center pb-4">
        <CharacterArtwork name={charName} isSpeaking={isSpeaking} isListening={isListening}/>
      </div>

      {/* Subtitle + controls panel */}
      <div className="relative z-10 mx-3 mb-4 rounded-[28px] overflow-hidden"
        style={{ background:"rgba(255,252,245,0.88)", backdropFilter:"blur(36px)",
          WebkitBackdropFilter:"blur(36px)", border:"1px solid rgba(255,255,255,0.55)",
          boxShadow:"0 -8px 32px rgba(121,100,72,0.08)" }}>

        {/* Intro phase */}
        <AnimatePresence>
          {phase === "intro" && (
            <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }}
              className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <span style={{ fontSize:14 }}>🌿</span>
                <span className="text-[12px]" style={{ color:"var(--text-muted)" }}>小栖</span>
              </div>
              <p className="text-[14px] leading-relaxed mb-4" style={{ color:"var(--text-primary)" }}>
                场景准备好了。你可以随时离开，这里没有对错。
              </p>
              <button onClick={() => { setPhase("playing"); setIsSpeaking(true); setTimeout(()=>setIsSpeaking(false),2400); }}
                className="w-full py-3 rounded-full text-[14px] font-medium active:scale-[0.97] transition-transform"
                style={{ background:"rgba(246,231,168,0.82)", color:"#4D4249" }}>
                好的，开始
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Playing phase */}
        {phase === "playing" && (
          <div>
            {/* Subtitle */}
            <AnimatePresence mode="wait">
              <motion.div key={dlgIdx} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                exit={{ opacity:0 }} transition={{ duration:0.18 }}
                className="px-5 pt-4 pb-2">
                {curr.from === "char" && (
                  <>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[12px] font-medium" style={{ color:"#C4953A" }}>{charName}</span>
                      {isSpeaking && (
                        <div className="flex gap-0.5 items-end h-3">
                          {[1,2,3].map(j => (
                            <motion.div key={j}
                              animate={{ height:[4,10,4], transition:{repeat:Infinity, duration:0.6, delay:j*0.15}}}
                              style={{ width:2, background:"rgba(196,149,58,0.6)", borderRadius:1 }}/>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-[15px] leading-relaxed" style={{ color:"var(--text-primary)" }}>{curr.text}</p>
                  </>
                )}
                {curr.from === "user-prompt" && (
                  <p className="text-[13px] text-center py-1" style={{ color:"var(--text-muted)" }}>
                    轻点麦克风，说出你想说的话
                  </p>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Voice control row */}
            <div className="flex items-center justify-between px-5 pb-4 pt-2 gap-4">
              <button
                className="flex-1 py-2.5 rounded-full text-[12px] active:scale-[0.97] transition-transform"
                style={{ background:"rgba(246,231,168,0.55)", color:"#4D4249", border:"1px solid rgba(255,255,255,0.45)" }}
                onClick={() => setDlgIdx(i => Math.min(i+1, dialogs.length-1))}>
                换一种说法
              </button>

              {/* Main mic button */}
              <motion.button
                onTouchStart={() => setIsListening(true)} onTouchEnd={handleUserSpeak}
                onClick={handleUserSpeak}
                animate={isListening ? { scale:[1,1.08,1.04], transition:{repeat:Infinity, duration:0.9}} : { scale:1 }}
                className="flex-shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 58, height: 58,
                  background: isListening ? "rgba(243,216,199,0.95)" : "rgba(246,231,168,0.88)",
                  border:`2px solid ${isListening ? "rgba(196,149,58,0.65)" : "rgba(255,255,255,0.55)"}`,
                  boxShadow: isListening ? "0 0 0 8px rgba(246,231,168,0.22)" : "0 4px 16px rgba(196,149,58,0.18)",
                }}>
                <Mic size={22} style={{ color:"#C4953A" }}/>
              </motion.button>

              <button onClick={onEnd}
                className="flex-1 py-2.5 rounded-full text-[12px] active:scale-[0.97] transition-transform"
                style={{ background:"rgba(255,252,245,0.65)", color:"#655D61", border:"1px solid rgba(255,255,255,0.45)" }}>
                离开场景
              </button>
            </div>
          </div>
        )}

        {/* Paused phase */}
        {phase === "paused" && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} className="p-5">
            <p className="text-[14px] font-medium mb-4" style={{ color:"var(--text-primary)" }}>已暂停</p>
            {!showAdjust ? (
              <div className="flex flex-col gap-2">
                <button onClick={() => setPhase("playing")}
                  className="w-full py-3 rounded-full text-[14px] font-medium active:scale-[0.97] transition-transform"
                  style={{ background:"rgba(246,231,168,0.82)", color:"#4D4249" }}>
                  继续场景
                </button>
                <button onClick={() => setShowAdjust(true)}
                  className="w-full py-3 rounded-full text-[14px] active:scale-[0.97] transition-transform"
                  style={{ background:"rgba(255,252,245,0.65)", color:"#655D61",
                    border:"1px solid rgba(255,255,255,0.45)" }}>
                  TA 不太像
                </button>
                <button onClick={onEnd}
                  className="w-full py-2.5 text-[13px] active:opacity-60" style={{ color:"var(--text-muted)" }}>
                  离开场景
                </button>
              </div>
            ) : (
              <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} className="flex flex-col gap-3">
                <p className="text-[13px]" style={{ color:"var(--text-secondary)" }}>
                  补充一句，比如"她不会这么快原谅我。"
                </p>
                <input value={adjustInput} onChange={e => setAdjustInput(e.target.value)}
                  placeholder="她其实更固执一点…"
                  className="w-full px-4 py-3 rounded-[16px] outline-none text-[14px]"
                  style={{ background:"rgba(255,252,245,0.72)", border:"1px solid rgba(255,255,255,0.45)",
                    color:"#484145" }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowAdjust(false)}
                    className="flex-1 py-3 rounded-full text-[13px] active:opacity-60"
                    style={{ background:"rgba(255,252,245,0.65)", color:"#655D61" }}>取消</button>
                  <button onClick={() => { setShowAdjust(false); setAdjustInput(""); setPhase("playing"); }}
                    className="flex-1 py-3 rounded-full text-[13px] font-medium active:opacity-60"
                    style={{ background:"rgba(246,231,168,0.82)", color:"#4D4249" }}>
                    调整后继续
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ─── Scene End ────────────────────────────────────────────────────────────────

function SceneEnd({ onBack, onReplay }: { onBack: () => void; onReplay: () => void }) {
  const [saved, setSaved] = useState(false);
  const keyQuote = "我其实一直很在意。";

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <div className="absolute inset-0" style={{
        background: "linear-gradient(180deg,#FFFBF3 0%,#F9EDD8 100%)",
      }}/>
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse at 50% 28%,rgba(246,231,168,0.38) 0%,transparent 60%)",
      }}/>

      <div className="relative z-10 flex flex-col h-full px-5">
        <div className="pt-[52px] pb-6">
          <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>
            <p className="text-[13px] mb-1.5" style={{ color:"var(--text-muted)" }}>这一次，你说出了</p>
            <h2 className="text-[22px] font-medium leading-snug" style={{ color:"var(--text-primary)" }}>
              "{keyQuote}"
            </h2>
          </motion.div>
        </div>

        <div className="flex-1 flex flex-col gap-4 pb-10 overflow-y-auto" style={{ scrollbarWidth:"none" }}>
          <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.22 }}>
            <div className="rounded-[22px] p-5 relative overflow-hidden"
              style={{ background:"rgba(255,252,245,0.88)", backdropFilter:"blur(24px)",
                border:"1px solid rgba(255,255,255,0.55)", boxShadow:"0 8px 32px rgba(121,100,72,0.07)" }}>
              <div style={{ position:"absolute", inset:0, backgroundImage:GRAIN, opacity:0.45, pointerEvents:"none" }}/>
              <div className="relative z-10">
                <div className="text-[22px] leading-none mb-2"
                  style={{ color:"rgba(196,149,58,0.35)", fontFamily:"serif" }}>"</div>
                <p className="text-[17px] leading-relaxed font-medium" style={{ color:"var(--text-primary)" }}>{keyQuote}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.36 }}>
            <div className="rounded-[18px] px-5 py-4"
              style={{ background:"rgba(246,231,168,0.32)", border:"1px solid rgba(255,255,255,0.45)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span style={{ fontSize:13 }}>🌿</span>
                <span className="text-[12px]" style={{ color:"var(--text-muted)" }}>小栖</span>
              </div>
              <p className="text-[14px] leading-relaxed" style={{ color:"var(--text-secondary)" }}>
                这里没有答案，也没有正确的说法。你表达了，这就够了。
              </p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.5 }}
            className="mt-auto flex flex-col gap-2 pt-4">
            {!saved ? (
              <button onClick={() => setSaved(true)}
                className="w-full py-3.5 rounded-full text-[14px] font-medium active:scale-[0.97] transition-transform"
                style={{ background:"rgba(246,231,168,0.88)", color:"#4D4249" }}>
                把这句话留下
              </button>
            ) : (
              <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }}
                className="w-full py-3.5 rounded-full text-[14px] text-center font-medium"
                style={{ background:"rgba(221,237,227,0.72)", color:"var(--text-primary)" }}>
                已放入长久珍藏 ✦
              </motion.div>
            )}
            <button onClick={onReplay}
              className="w-full py-3.5 rounded-full text-[14px] font-medium active:scale-[0.97] transition-transform"
              style={{ background:"rgba(255,252,245,0.72)", color:"#484145",
                border:"1px solid rgba(255,255,255,0.5)" }}>
              再试一次
            </button>
            <button onClick={onBack}
              className="w-full py-3 text-[13px] active:opacity-60" style={{ color:"var(--text-muted)" }}>
              直接离开
            </button>
            <p className="text-[11px] text-center mt-1" style={{ color:"#D0C8BF" }}>
              离开后，场景中的人物设定和对话将被清除。
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ─── Profile ─────────────────────────────────────────────────────────────────

function ProfileScreen({ onChangePet, night, onNightToggle, petName, petEmoji }: {
  onChangePet: () => void; night: boolean; onNightToggle: () => void;
  petName: string; petEmoji: string;
}) {
  const sections = [
    { title: "陪伴设置", rows: [
      { icon: <Bell  size={16}/>, label: "主动陪伴频率", val: "温和" },
      { icon: <Clock size={16}/>, label: "睡前提醒",     val: "22:30" },
    ]},
    { title: "记忆与隐私", rows: [
      { icon: <Archive size={16}/>, label: "记忆管理",        val: "" },
      { icon: <Clock   size={16}/>, label: "三日寄存规则",    val: "3天" },
      { icon: <Shield  size={16}/>, label: "隐私与数据删除",  val: "" },
    ]},
    { title: "界面与体验", rows: [
      { icon: <Moon   size={16}/>, label: "夜间氛围",   val: night ? "开启" : "关闭", act: onNightToggle },
      { icon: <Type   size={16}/>, label: "字体大小",   val: "标准" },
      { icon: <Layers size={16}/>, label: "减少透明度", val: "关闭" },
    ]},
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[52px] pb-3 flex-shrink-0">
        <h1 className="text-[26px] font-medium tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>我的</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-[100px]" style={{ scrollbarWidth: "none" }}>
        <GlassCard className="p-5 mb-5 flex items-center gap-4" onClick={onChangePet}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
            style={{ background: "rgba(246,231,168,0.62)", border: "1px solid rgba(255,255,255,0.5)" }}>
            {petEmoji}
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-medium" style={{ color: "var(--text-primary)" }}>{petName}</div>
            <div className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>温柔，善于倾听</div>
          </div>
          <div className="text-[13px] px-3 py-1.5 rounded-full active:opacity-70"
            style={{ background: "rgba(255,252,245,0.82)", color: "#655D61", border: "1px solid rgba(255,255,255,0.4)" }}>
            更换伙伴
          </div>
        </GlassCard>
        {sections.map((sec, si) => (
          <div key={si} className="mb-4">
            <p className="text-[13px] font-medium mb-2 px-1" style={{ color: "var(--text-secondary)" }}>{sec.title}</p>
            <GlassCard>
              {sec.rows.map((row, ri) => (
                <div key={ri}>
                  <button onClick={row.act}
                    className="w-full flex items-center gap-3 px-5 py-4 active:opacity-65 transition-opacity">
                    <span style={{ color: "var(--text-secondary)" }}>{row.icon}</span>
                    <span className="flex-1 text-[15px] text-left" style={{ color: "var(--text-primary)" }}>{row.label}</span>
                    <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>{row.val}</span>
                    <ChevronRight size={13} style={{ color: "var(--chevron)" }}/>
                  </button>
                  {ri < sec.rows.length - 1 && (
                    <div className="mx-5 h-px" style={{ background: "var(--row-divider)" }}/>
                  )}
                </div>
              ))}
            </GlassCard>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pet Change ───────────────────────────────────────────────────────────────

function PetChange({ onBack, onHandoff }: { onBack: () => void; onHandoff: (i: number) => void }) {
  const [sel, setSel] = useState(-1);
  const opts = [
    { name: "晴晴", trait: "活泼，偶尔调皮",  emoji: "☀️" },
    { name: "暮云", trait: "沉稳，有时神秘",   emoji: "🌙" },
  ];
  return (
    <div className="flex flex-col h-full">
      <SafeHeader onBack={onBack} title="更换伙伴"/>
      <div className="flex-1 px-5 pt-3 pb-[100px] flex flex-col gap-4">
        <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>小栖会把粗粒度近况告诉新伙伴，不会复述细节</p>
        {opts.map((p, i) => (
          <GlassCard key={i} className="p-5 flex items-center gap-4" onClick={() => setSel(i)}
            style={{
              border: sel === i ? "1.5px solid rgba(196,149,58,0.5)" : "1px solid rgba(255,255,255,0.45)",
              background: sel === i ? "rgba(246,231,168,0.42)" : "rgba(255,252,245,0.65)",
            }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
              style={{ background: "rgba(255,252,245,0.85)" }}>
              {p.emoji}
            </div>
            <div className="flex-1">
              <div className="text-[16px] font-medium" style={{ color: "var(--text-primary)" }}>{p.name}</div>
              <div className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{p.trait}</div>
            </div>
            {sel === i && (
              <div className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "rgba(196,149,58,0.8)" }}>
                <Check size={11} style={{ color: "#fff" }}/>
              </div>
            )}
          </GlassCard>
        ))}
        <div className="mt-auto">
          <PrimaryBtn onClick={() => onHandoff(sel)} full disabled={sel === -1}>确认更换</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Pet Handoff ──────────────────────────────────────────────────────────────

function PetHandoff({ onBack, onDone, newPetEmoji }: {
  onBack: () => void; onDone: () => void; newPetEmoji: string;
}) {
  return (
    <div className="flex flex-col h-full">
      <SafeHeader onBack={onBack}/>
      <div className="flex-1 px-5 pt-2 pb-[100px] flex flex-col gap-5 items-center justify-center">
        <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 18, stiffness: 200 }}
          className="text-6xl">{newPetEmoji}</motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }} className="text-center">
          <h2 className="text-[22px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>来自小栖的交接信</h2>
          <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>给新来的伙伴看的</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }} className="w-full">
          <GlassCard className="p-6" style={{ background: "rgba(246,231,168,0.35)" }}>
            <p className="text-[15px] leading-[1.75]" style={{ color: "var(--text-primary)" }}>
              嗨。<br/><br/>
              这位朋友最近在处理一些需要时间消化的事情，心情整体还不错，偶尔会有点累。<br/><br/>
              喜欢睡前说说话。有几件事放在信箱里还没处理完。<br/><br/>
              好好陪着她。<br/><br/>
              <span style={{ color: "var(--text-muted)" }}>— 小栖</span>
            </p>
          </GlassCard>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="w-full">
          <PrimaryBtn onClick={onDone} full>认识新伙伴</PrimaryBtn>
        </motion.div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════

const PET_DATA = [
  { name: "小栖", emoji: "🌿" },
  { name: "晴晴", emoji: "☀️" },
  { name: "暮云", emoji: "🌙" },
];

export default function App() {
  const [screen, setScreen]     = useState<Screen>("onboard-1");
  const [tab, setTab]           = useState<Tab>("companion");
  const [night, setNight]       = useState(false);
  const [petIndex, setPetIndex] = useState(0);
  const [onboardPet, setOnboardPet] = useState(0);
  const [showMode, setShowMode]     = useState(false);
  const [pendingPet, setPendingPet] = useState(0);
  const [letterState, setLetterState] = useState<LetterState>("sealed");
  const [frameToast, setFrameToast]   = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setFrameToast(msg);
    toastTimer.current = setTimeout(() => setFrameToast(null), 2200);
  };

  const handleOpenLetter = () => {
    if (letterState !== "sealed") return;
    setLetterState("opening");
    setTimeout(() => setLetterState("opened"), 680);
  };

  const handleSaveLetter = () => {
    setLetterState("saved");
    showToast("已放入长久珍藏 ✦");
  };

  const handleAckLetter = () => {
    showToast("它知道你收到了");
  };

  const pet = PET_DATA[petIndex];

  const go = (s: Screen) => setScreen(s);

  const tabScreens: Tab[] = ["companion", "mailbox", "scene", "profile"];
  const fullScreens: Screen[] = [
    "chat", "sleep-dump", "processing", "receipt",
    "task-detail", "storage-detail",
    "scene-create", "scene-play", "scene-end",
    "pet-change", "pet-handoff",
  ];

  const isMainApp = !screen.startsWith("onboard");
  const showTabBar = isMainApp && !fullScreens.includes(screen);

  const handleTabChange = (t: Tab) => {
    setTab(t);
    go(t as Screen);
  };

  return (
    <NightCtx.Provider value={night}>
    <div className={`min-h-screen flex items-center justify-center ${night ? "dark" : ""}`}
      style={{ background: night ? "#1C1A20" : "#D8D2CA", ...(night ? NIGHT_VARS : DAY_VARS) }}>
      <div className={`relative overflow-hidden select-none${night ? " night-root" : ""}`} style={{
        width: 393, height: 852,
        borderRadius: 50,
        boxShadow: "0 48px 96px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(255,255,255,0.12)",
        background: night ? NK.bg : "#FFFBF3",
        flexShrink: 0,
      }}>
        {/* Night typography global overrides */}
        <style>{`
          .night-root input::placeholder,
          .night-root textarea::placeholder { color: ${NK.placeholder}; }
          .night-root .row-divider { background: ${NK.divider}; }
        `}</style>

        {/* Mist background */}
        <MistBackground night={night}/>

        {/* Screens */}
        <div className="absolute inset-0 z-10">
          <AnimatePresence mode="wait">
            <motion.div key={screen} className="absolute inset-0"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}>

              {screen === "onboard-1" && <OnboardWelcome onNext={() => go("onboard-2")}/>}
              {screen === "onboard-2" && <OnboardHow     onNext={() => go("onboard-3")} onBack={() => go("onboard-1")}/>}
              {screen === "onboard-3" && (
                <OnboardPet onNext={() => go("onboard-4")} onBack={() => go("onboard-2")}
                  selected={onboardPet} onSelect={i => { setOnboardPet(i); }}/>
              )}
              {screen === "onboard-4" && (
                <OnboardPermission
                  onNext={() => { setPetIndex(onboardPet); go("companion"); }}
                  onBack={() => go("onboard-3")}/>
              )}

              {screen === "companion" && (
                <CompanionIdle petName={pet.name} petEmoji={pet.emoji}
                  night={night} onNightToggle={() => setNight(n => !n)}
                  onChat={() => go("chat")} onModeSheet={() => setShowMode(true)}/>
              )}
              {screen === "chat" && (
                <CompanionChat petName={pet.name} petEmoji={pet.emoji}
                  onBack={() => { go("companion"); setTab("companion"); }}/>
              )}
              {screen === "sleep-dump" && (
                <SleepDump onBack={() => { go("companion"); setTab("companion"); }}
                  onProcess={() => go("processing")}/>
              )}
              {screen === "processing" && <ProcessingScreen onDone={() => go("receipt")}/>}
              {screen === "receipt" && (
                <ReceiptScreen onDone={() => { go("companion"); setTab("companion"); }}
                  onView={() => { go("mailbox"); setTab("mailbox"); }}/>
              )}

              {screen === "mailbox" && (
                <MailboxScreen
                  onTaskDetail={() => go("task-detail")}
                  onStorageDetail={() => go("storage-detail")}
                  letterState={letterState}
                  onOpenLetter={handleOpenLetter}
                  onSaveLetter={handleSaveLetter}
                  onAckLetter={handleAckLetter}
                  onReplyLetter={() => { go("chat"); setTab("companion"); }}
                />
              )}
              {screen === "task-detail" && <TaskDetail onBack={() => { go("mailbox"); setTab("mailbox"); }}/>}
              {screen === "storage-detail" && <StorageDetail onBack={() => { go("mailbox"); setTab("mailbox"); }}/>}

              {screen === "scene" && (
                <SceneScreen onCreate={() => go("scene-create")} onPlay={() => go("scene-play")}/>
              )}
              {screen === "scene-create" && (
                <SceneCreate onBack={() => { go("scene"); setTab("scene"); }}
                  onReady={() => go("scene-play")}/>
              )}
              {screen === "scene-play" && <ScenePlay onEnd={() => go("scene-end")}/>}
              {screen === "scene-end" && (
                <SceneEnd onBack={() => { go("scene"); setTab("scene"); }}
                  onReplay={() => go("scene-play")}/>
              )}

              {screen === "profile" && (
                <ProfileScreen petName={pet.name} petEmoji={pet.emoji}
                  night={night} onNightToggle={() => setNight(n => !n)}
                  onChangePet={() => go("pet-change")}/>
              )}
              {screen === "pet-change" && (
                <PetChange onBack={() => { go("profile"); setTab("profile"); }}
                  onHandoff={i => { setPendingPet(i + 1); go("pet-handoff"); }}/>
              )}
              {screen === "pet-handoff" && (
                <PetHandoff newPetEmoji={PET_DATA[pendingPet]?.emoji ?? "☀️"}
                  onBack={() => go("pet-change")}
                  onDone={() => { setPetIndex(pendingPet); go("companion"); setTab("companion"); }}/>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Mode sheet overlay */}
          <AnimatePresence>
            {showMode && (
              <ModeSheet
                onClose={() => setShowMode(false)}
                onSleepDump={() => { setShowMode(false); go("sleep-dump"); }}
                onChat={() => { setShowMode(false); go("chat"); }}/>
            )}
          </AnimatePresence>
        </div>

        {/* In-frame toast */}
        <AnimatePresence>
          {frameToast && (
            <motion.div
              className="absolute left-1/2 z-50 pointer-events-none"
              style={{ bottom: 100, transform: "translateX(-50%)", whiteSpace: "nowrap" }}
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }}
              transition={{ type: "spring", damping: 22, stiffness: 260 }}>
              <div className="px-5 py-2.5 rounded-full text-[13px] font-medium"
                style={{
                  background: night ? "rgba(50,46,56,0.94)" : "rgba(255,252,245,0.92)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: night ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(255,255,255,0.55)",
                  boxShadow: night ? "0 8px 24px rgba(10,8,14,0.20)" : "0 8px 24px rgba(121,100,72,0.12)",
                  color: "var(--text-primary)",
                }}>
                {frameToast}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab bar */}
        {showTabBar && (
          <div className="absolute bottom-0 left-0 right-0 z-20">
            <TabBar active={tab} onChange={handleTabChange}/>
          </div>
        )}
      </div>
    </div>
    </NightCtx.Provider>
  );
}
