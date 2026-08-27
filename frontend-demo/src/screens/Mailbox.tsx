/**
 * 信箱模块入口（barrel）：拆分后各分区独立成文件，此处统一 re-export，
 * 保持 `../screens/Mailbox` 导入路径不变。
 * - MailboxScreen      主屏（来信 + 思绪双层）
 * - mailbox/Keepsakes  「我留下的」（原长久珍藏，现为来信页内入口）
 * - mailbox/Letters    桌宠来信
 * - mailbox/shared     类型、主题映射与日期工具
 */
export { MailboxScreen } from "./mailbox/MailboxScreen";
export type { Task, Keepsake, LetterState, SceneInviteAttachment, ApiLetter } from "./mailbox/shared";
