import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "../theme";
import { spacing, touchTarget } from "../tokens";
import { GrainTexture } from "./effects";

type CardVariant = "default" | "elevated" | "emphasized";

type CardProps = {
  children: React.ReactNode;
  /** 卡片变体：default（白底无阴影）、elevated（白底+弱阴影）、emphasized（强调背景） */
  variant?: CardVariant;
  /** @deprecated 使用 variant="emphasized" 代替 */
  emphasized?: boolean;
  /** 是否叠加 grain 纹理 */
  grainy?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  variant,
  emphasized: _emphasizedDeprecated = false,
  grainy = false,
  onPress,
  style,
}: CardProps) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);

  const resolvedVariant: CardVariant = variant ?? (_emphasizedDeprecated ? "emphasized" : "default");

  const variantStyle: ViewStyle = resolvedVariant === "emphasized"
    ? {
        borderColor: theme.colors.accentSoft,
        backgroundColor: theme.colors.accentSoft,
      }
    : resolvedVariant === "elevated"
    ? {
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        ...theme.shadows.soft,
      }
    : {
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      };

  const baseStyle: ViewStyle = {
    padding: spacing[5],
    borderRadius: theme.radii.card,
    borderWidth: 1,
    overflow: "hidden",
    ...variantStyle,
  };

  const content = (
    <>
      {grainy && <GrainTexture />}
      {children}
    </>
  );

  if (!onPress) return <View style={[baseStyle, style]}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={({ pressed }) => [
        baseStyle,
        hovered && resolvedVariant === "default" ? { backgroundColor: theme.colors.surfaceHover } : null,
        { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] },
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

type ListItemProps = {
  description?: string;
  leading?: React.ReactNode;
  onPress?: () => void;
  title: string;
  trailing?: React.ReactNode;
};

export function ListItem({
  description,
  leading,
  onPress,
  title,
  trailing,
}: ListItemProps) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);

  const content = (
    <>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[
            theme.typography.textStyles.bodyStrong,
            { color: theme.colors.textPrimary },
          ]}
        >
          {title}
        </Text>
        {description ? (
          <Text
            style={[
              theme.typography.textStyles.caption,
              { marginTop: spacing[1], color: theme.colors.textSecondary },
            ]}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {trailing}
    </>
  );

  const style: ViewStyle = {
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: theme.radii.control,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  };

  if (!onPress) return <View style={style}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        {
          backgroundColor: hovered ? theme.colors.surfaceHover : "transparent",
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      {content}
    </Pressable>
  );
}

type ChipProps = {
  children: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
};

export function Chip({ children, onPress, selected = false }: ChipProps) {
  const theme = useTheme();
  const body = (
    <Text
      style={[
        theme.typography.textStyles.label,
        { color: selected ? theme.colors.accent : theme.colors.textSecondary },
      ]}
    >
      {children}
    </Text>
  );
  const style: ViewStyle = {
    minHeight: 32,
    paddingHorizontal: spacing[3],
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: selected ? theme.colors.accentSoft : theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
  };

  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [style, { opacity: pressed ? 0.78 : 1 }]}
    >
      {body}
    </Pressable>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.colors.divider }} />;
}

export function EmptyState({
  description,
  icon,
  title,
}: {
  description?: string;
  icon?: React.ReactNode;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        padding: spacing[8],
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon}
      <Text
        style={[
          theme.typography.textStyles.sectionTitle,
          { marginTop: icon ? spacing[4] : 0, color: theme.colors.textPrimary },
        ]}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={[
            theme.typography.textStyles.body,
            {
              maxWidth: 420,
              marginTop: spacing[2],
              textAlign: "center",
              color: theme.colors.textSecondary,
            },
          ]}
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}

export function LoadingState({ label = "加载中…" }: { label?: string }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      style={{
        padding: spacing[8],
        alignItems: "center",
        justifyContent: "center",
        gap: spacing[3],
      }}
    >
      <ActivityIndicator color={theme.colors.accent} />
      <Text
        style={[theme.typography.textStyles.caption, { color: theme.colors.textSecondary }]}
      >
        {label}
      </Text>
    </View>
  );
}
