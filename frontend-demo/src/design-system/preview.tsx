import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Bell, ChevronRight, Heart } from "lucide-react-native";

import { useTheme } from "./theme";
import { spacing } from "./tokens";
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  IconButton,
  ListItem,
  PageContainer,
  PageHeader,
  ResponsiveOverlay,
  TextArea,
  TextField,
  ToastSurface,
} from "./components";

/** 开发验收页：不属于产品导航，只通过 ?screen=design-system 访问。 */
export function DesignSystemPreview() {
  const theme = useTheme();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [selected, setSelected] = useState("安静");
  const [name, setName] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (!toastVisible) return;
    const timer = setTimeout(() => setToastVisible(false), 2_200);
    return () => clearTimeout(timer);
  }, [toastVisible]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <PageContainer maxWidth={920}>
        <PageHeader
          eyebrow="Design system"
          title="温暖、安静、清晰"
          description="用于检查跨端组件、状态与响应式行为的开发预览。"
          action={
            <IconButton
              accessibilityLabel="通知"
              icon={<Bell size={20} color={theme.colors.textSecondary} />}
            />
          }
        />

        <View style={{ gap: spacing[8] }}>
          <View style={{ gap: spacing[3] }}>
            <Text
              style={[
                theme.typography.textStyles.sectionTitle,
                { color: theme.colors.textPrimary },
              ]}
            >
              操作
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing[3] }}>
              <Button onPress={() => setOverlayOpen(true)}>打开浮层</Button>
              <Button variant="secondary">次要操作</Button>
              <Button variant="secondary" onPress={() => setToastVisible(true)}>
                显示提示
              </Button>
              <Button variant="ghost">文字操作</Button>
              <Button disabled>不可用</Button>
            </View>
          </View>

          <Card>
            <View style={{ gap: spacing[4] }}>
              <Text
                style={[
                  theme.typography.textStyles.sectionTitle,
                  { color: theme.colors.textPrimary },
                ]}
              >
                表单
              </Text>
              <TextField
                label="怎么称呼你"
                onChangeText={setName}
                placeholder="输入名字"
                value={name}
              />
              <TextArea
                label="想说的话"
                placeholder="慢慢说，不着急…"
              />
            </View>
          </Card>

          <Card>
            <Text
              style={[
                theme.typography.textStyles.sectionTitle,
                { marginBottom: spacing[3], color: theme.colors.textPrimary },
              ]}
            >
              选择与列表
            </Text>
            <View
              style={{
                marginBottom: spacing[4],
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing[2],
              }}
            >
              {["安静", "温暖", "轻快"].map((item) => (
                <Chip
                  key={item}
                  onPress={() => setSelected(item)}
                  selected={selected === item}
                >
                  {item}
                </Chip>
              ))}
            </View>
            <Divider />
            <ListItem
              leading={<Heart size={20} color={theme.colors.accent} />}
              title="陪伴偏好"
              description="控制主动陪伴的频率与方式"
              trailing={<ChevronRight size={18} color={theme.colors.textMuted} />}
              onPress={() => setOverlayOpen(true)}
            />
          </Card>

          <Card>
            <EmptyState
              icon={<Text style={{ fontSize: 28 }}>✉️</Text>}
              title="今天的信还在路上"
              description="有想告诉你的时候，它会送来。"
            />
          </Card>
        </View>
        </PageContainer>

        <ResponsiveOverlay
          onClose={() => setOverlayOpen(false)}
          title="选择一种陪伴方式"
          visible={overlayOpen}
        >
          <View style={{ padding: spacing[5], gap: spacing[3] }}>
            <Text
              style={[
                theme.typography.textStyles.body,
                { color: theme.colors.textSecondary },
              ]}
            >
              手机使用底部抽屉，桌面使用居中对话框。
            </Text>
            <Button fullWidth onPress={() => setOverlayOpen(false)}>
              知道了
            </Button>
          </View>
        </ResponsiveOverlay>
      </ScrollView>
      {toastVisible ? <ToastSurface message="设置已经保存" /> : null}
    </View>
  );
}
