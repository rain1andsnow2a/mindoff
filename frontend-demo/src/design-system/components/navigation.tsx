import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Film, Mail, MessageCircle, User } from "lucide-react-native";

import { useTheme } from "../theme";
import { iconSizes, spacing, touchTarget } from "../tokens";

export type AppTab = "companion" | "mailbox" | "scene" | "profile";

type NavigationProps = {
  active: AppTab;
  onChange: (tab: AppTab) => void;
};

const items = [
  { id: "companion", label: "陪伴", icon: MessageCircle },
  { id: "mailbox", label: "信箱", icon: Mail },
  { id: "scene", label: "片场", icon: Film },
  { id: "profile", label: "我的", icon: User },
] as const;

function NavigationItem({
  active,
  compact,
  icon: Icon,
  label,
  onPress,
}: {
  active: boolean;
  compact: boolean;
  icon: typeof MessageCircle;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: touchTarget.minimum,
        minHeight: compact ? 52 : 60,
        flex: compact ? 1 : undefined,
        width: compact ? undefined : 72,
        paddingHorizontal: spacing[2],
        paddingVertical: spacing[2],
        borderRadius: theme.radii.control,
        alignItems: "center",
        justifyContent: "center",
        gap: spacing[1],
        backgroundColor: active
          ? theme.colors.accentSoft
          : hovered
            ? theme.colors.surfaceHover
            : "transparent",
        opacity: pressed ? 0.82 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Icon
        size={iconSizes.default}
        color={active ? theme.colors.accent : theme.colors.textMuted}
        strokeWidth={active ? 2.2 : 1.8}
      />
      <Text
        style={[
          theme.typography.textStyles.label,
          { color: active ? theme.colors.textPrimary : theme.colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function BottomNavigation({ active, onChange }: NavigationProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        position: "absolute",
        left: spacing[3],
        right: spacing[3],
        bottom: spacing[2],
        minHeight: 68,
        padding: spacing[1],
        flexDirection: "row",
        alignItems: "center",
        borderRadius: theme.radii.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        ...theme.shadows.soft,
      }}
    >
      {items.map(({ id, icon, label }) => (
        <NavigationItem
          key={id}
          active={active === id}
          compact
          icon={icon}
          label={label}
          onPress={() => onChange(id)}
        />
      ))}
    </View>
  );
}

export function SideNavigation({ active, onChange }: NavigationProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        width: 96,
        flexShrink: 0,
        paddingHorizontal: spacing[3],
        paddingTop: spacing[6],
        paddingBottom: spacing[4],
        alignItems: "center",
        borderRightWidth: 1,
        borderRightColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View
        accessibilityLabel="MindOff"
        style={{
          width: 44,
          height: 44,
          marginBottom: spacing[8],
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 14,
          backgroundColor: theme.colors.accentSoft,
        }}
      >
        <Text style={{ fontSize: 20 }}>🌿</Text>
      </View>

      <View style={{ gap: spacing[2] }}>
        {items.map(({ id, icon, label }) => (
          <NavigationItem
            key={id}
            active={active === id}
            compact={false}
            icon={icon}
            label={label}
            onPress={() => onChange(id)}
          />
        ))}
      </View>

      <View style={{ flex: 1 }} />
      <Text
        style={[
          theme.typography.textStyles.label,
          { color: theme.colors.textMuted, textAlign: "center" },
        ]}
      >
        MindOff
      </Text>
    </View>
  );
}
