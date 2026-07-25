import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";

import { useResponsive } from "../responsive";
import { useTheme } from "../theme";
import { iconSizes, spacing } from "../tokens";
import { IconButton } from "./controls";

type OverlayProps = {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
  visible: boolean;
};

function OverlayHeader({ onClose, title }: { onClose: () => void; title?: string }) {
  const theme = useTheme();
  if (!title) return null;

  return (
    <View
      style={{
        minHeight: 52,
        paddingLeft: spacing[5],
        paddingRight: spacing[2],
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
      }}
    >
      <Text
        style={[
          theme.typography.textStyles.sectionTitle,
          { color: theme.colors.textPrimary },
        ]}
      >
        {title}
      </Text>
      <IconButton
        accessibilityLabel="关闭"
        icon={<X size={iconSizes.default} color={theme.colors.textSecondary} />}
        onPress={onClose}
      />
    </View>
  );
}

export function Dialog({ children, onClose, title, visible }: OverlayProps) {
  const theme = useTheme();
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View
        style={{
          flex: 1,
          padding: spacing[6],
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.overlay,
        }}
      >
        <Pressable
          accessibilityLabel="关闭弹窗"
          onPress={onClose}
          style={{ position: "absolute", inset: 0 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            width: "100%",
            maxWidth: 520,
            maxHeight: "86%",
            overflow: "hidden",
            borderRadius: theme.radii.dialog,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
            ...theme.shadows.floating,
          }}
        >
          <OverlayHeader onClose={onClose} title={title} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function BottomSheet({ children, onClose, title, visible }: OverlayProps) {
  const theme = useTheme();
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityLabel="关闭面板"
          onPress={onClose}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: theme.colors.overlay,
          }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "88%",
            overflow: "hidden",
            borderTopLeftRadius: theme.radii.dialog,
            borderTopRightRadius: theme.radii.dialog,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
          }}
        >
          <View
            style={{
              paddingTop: spacing[2],
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.border,
              }}
            />
          </View>
          <OverlayHeader onClose={onClose} title={title} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function ResponsiveOverlay(props: OverlayProps) {
  const { isExpanded } = useResponsive();
  return isExpanded ? <Dialog {...props} /> : <BottomSheet {...props} />;
}

export function ToastSurface({ message }: { message: string }) {
  const theme = useTheme();
  const { isExpanded } = useResponsive();
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      pointerEvents="none"
      style={{
        position: "absolute",
        left: isExpanded ? spacing[6] : spacing[4],
        right: isExpanded ? undefined : spacing[4],
        bottom: isExpanded ? spacing[6] : 92,
        maxWidth: isExpanded ? 420 : undefined,
        paddingHorizontal: spacing[4],
        paddingVertical: spacing[3],
        borderRadius: theme.radii.control,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceElevated,
        ...theme.shadows.floating,
      }}
    >
      <Text
        style={[theme.typography.textStyles.bodyStrong, { color: theme.colors.textPrimary }]}
      >
        {message}
      </Text>
    </View>
  );
}
