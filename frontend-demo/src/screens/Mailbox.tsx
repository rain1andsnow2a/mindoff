/**
 * 信箱模块入口（barrel）：拆分后各分区独立成文件，此处统一 re-export，
 * 保持 `../screens/Mailbox` 导入路径不变。
 * - MailboxScreen / TaskDetail / StorageDetail  主屏与两个详情屏
 * - mailbox/TasksTab   今日待启
 * - mailbox/Keepsakes  长久珍藏
 * - mailbox/Letters    桌宠来信
 * - mailbox/shared     类型、主题映射与日期工具
 */
export { MailboxScreen, TaskDetail, StorageDetail } from "./mailbox/MailboxScreen";
export type { Task, Keepsake, LetterState, SceneInviteAttachment, ApiLetter } from "./mailbox/shared";
