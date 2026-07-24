/**
 * 登录 / 注册（方案 A · 晨雾 · 白天玻璃卡）。
 * 复用 theme.ts 色板与 components 的 GlassCard / PrimaryBtn；对接 api.ts 的 login/register。
 * 仅用户名 + 密码，无验证码（demo）。
 */
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Eye, EyeOff, Lock, User } from "lucide-react-native";
import { GlassCard, PrimaryBtn } from "../components";
import { GOLD_DEEP, palette, useNight } from "../theme";
import { login as apiLogin, register as apiRegister, Tokens } from "../api";

type Mode = "login" | "register";

// Web 预览时，浏览器（尤其 Edge）会在 password 输入框内自带一个原生"显示密码"眼睛，
// 与卡片右侧自定义眼睛重叠成"两个眼睛"。这里隐藏原生控件，只保留外层自定义眼睛。
// 仅在 web 生效；原生端 RN 不渲染该控件，此段自动跳过。
if (Platform.OS === "web" && typeof document !== "undefined") {
  const STYLE_ID = "mindoff-hide-native-reveal";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "input::-ms-reveal,input::-ms-clear{display:none!important;}";
    document.head.appendChild(style);
  }
}

export function AuthScreen({
  onAuthed,
}: {
  onAuthed: (tokens: Tokens, mode: Mode) => void;
}) {
  const night = useNight();
  const C = palette(night);
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState<null | "u" | "p">(null);
  const isLogin = mode === "login";

  const accent = night ? "#D8BC76" : GOLD_DEEP;

  const switchMode = () => {
    setMode(isLogin ? "register" : "login");
    setHint("");
    setPassword("");
    setShowPw(false);
  };

  const submit = async () => {
    if (loading) return;
    if (username.trim().length < 3) return setHint("用户名至少 3 个字符");
    if (password.length < 6) return setHint("密码至少 6 位");
    setHint("");
    setLoading(true);
    try {
      const fn = isLogin ? apiLogin : apiRegister;
      const tokens = await fn(username.trim(), password);
      onAuthed(tokens, mode);
    } catch (e: any) {
      setHint(e?.message || "出了点问题，待会儿再试试");
    } finally {
      setLoading(false);
    }
  };

  const field = (
    which: "u" | "p",
    icon: React.ReactNode,
    props: React.ComponentProps<typeof TextInput>,
    trailing?: React.ReactNode
  ) => {
    const focused = focus === which;
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 11,
          backgroundColor: C.glass,
          borderRadius: 16,
          paddingHorizontal: 15,
          paddingVertical: 13,
          borderWidth: 1.5,
          borderColor: focused ? accent : C.glassBorder,
        }}
      >
        {icon}
        <TextInput
          {...props}
          onFocus={() => {
            setFocus(which);
            setHint("");
          }}
          onBlur={() => setFocus(null)}
          placeholderTextColor={C.placeholder}
          style={{ flex: 1, fontSize: 16, color: C.text, padding: 0 }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {trailing}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26, paddingTop: 44, paddingBottom: 36 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 品牌 */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: night ? "rgba(59,51,64,0.5)" : "rgba(255,252,245,0.72)",
              borderWidth: 1.5,
              borderColor: night ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.6)",
            }}
          >
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: night ? "rgba(216,188,118,0.6)" : "rgba(196,149,58,0.55)",
              }}
            />
          </View>
          <View>
            <Text style={{ fontSize: 22, fontWeight: "500", letterSpacing: -0.4, color: C.text }}>
              MindOff
            </Text>
            <Text style={{ fontSize: 12, color: C.text3, marginTop: 4 }}>
              陪你把心里的事，轻轻放下
            </Text>
          </View>
        </View>

        {/* 标题 */}
        <Text style={{ fontSize: 27, fontWeight: "500", letterSpacing: -0.6, color: C.text, lineHeight: 34 }}>
          {isLogin ? "欢迎回来" : "第一次见面"}
        </Text>
        <Text style={{ fontSize: 14, color: C.text2, marginTop: 9, lineHeight: 21 }}>
          {isLogin ? "它一直在这儿，等你回来说说话。" : "给自己起个名字，我们慢慢认识。"}
        </Text>

        {/* 玻璃卡表单 */}
        <GlassCard style={{ padding: 18, marginTop: 22, gap: 14 }}>
          <View>
            <Text style={{ fontSize: 12.5, color: C.text2, marginBottom: 7 }}>用户名</Text>
            {field(
              "u",
              <User size={18} color={focus === "u" ? accent : C.text3} strokeWidth={1.75} />,
              {
                value: username,
                onChangeText: setUsername,
                placeholder: isLogin ? "你的名字" : "想让我怎么称呼你",
              }
            )}
          </View>
          <View>
            <Text style={{ fontSize: 12.5, color: C.text2, marginBottom: 7 }}>密码</Text>
            {field(
              "p",
              <Lock size={18} color={focus === "p" ? accent : C.text3} strokeWidth={1.75} />,
              {
                value: password,
                onChangeText: setPassword,
                placeholder: "悄悄话，只有你知道",
                secureTextEntry: !showPw,
                // 关掉 Android 原生自动填充/密码管理器的"内层"眼睛，只保留 App 自绘的外层眼睛（DAY-173）
                autoComplete: "off",
                importantForAutofill: "no",
                textContentType: "none",
              },
              <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={8}>
                {showPw ? (
                  <EyeOff size={18} color={C.text3} strokeWidth={1.75} />
                ) : (
                  <Eye size={18} color={C.text3} strokeWidth={1.75} />
                )}
              </Pressable>
            )}
          </View>
        </GlassCard>

        {/* 温柔提示（非红色 error） */}
        <View style={{ minHeight: 20, marginTop: 11 }}>
          {hint ? <Text style={{ fontSize: 12.5, color: accent }}>{hint}</Text> : null}
        </View>

        <View style={{ flex: 1, minHeight: 20 }} />

        <PrimaryBtn onClick={submit} full disabled={loading}>
          {loading ? (isLogin ? "登录中…" : "创建中…") : isLogin ? "进来坐坐" : "开始吧"}
        </PrimaryBtn>

        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 16 }}>
          <Text style={{ fontSize: 13, color: C.text2 }}>
            {isLogin ? "还没有账号？" : "已经有账号了？"}
          </Text>
          <Pressable onPress={switchMode} hitSlop={8}>
            <Text style={{ fontSize: 13, color: accent, fontWeight: "500", marginLeft: 6 }}>
              {isLogin ? "创建一个" : "回来登录"}
            </Text>
          </Pressable>
        </View>
        {!isLogin && (
          <Text style={{ fontSize: 11, color: C.text3, textAlign: "center", marginTop: 10 }}>
            demo 版只需用户名与密码，无需验证码
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
