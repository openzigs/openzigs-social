/**
 * Telegram channel public surface (epic #47).
 */
export { TelegramChannel, QUEUE_MENU_ID, type TelegramChannelOptions } from "./telegram-channel.js";
export { createTelegramChannelFromVault, type CreateTelegramChannelOptions } from "./factory.js";
export { AdminAcl, createAclMiddleware, normalizeChatId } from "./acl.js";
export {
  APPROVAL_CALLBACK_PREFIX,
  MAX_DETAIL_CHARS,
  buildApprovalCallbackData,
  parseApprovalCallbackData,
  buildApprovalKeyboard,
  renderApprovalMessage,
  escapeHtml,
  truncate,
  type ApprovalCallback
} from "./approval-keyboard.js";
export { parseDmCommand, relayDm, type ParsedDmCommand, type RelayResult } from "./dm-relay.js";
export {
  installCommands,
  buildStartMessage,
  buildStatusMessage,
  buildPrivacyMessage,
  buildDmUsage,
  type CommandDeps
} from "./commands.js";
export {
  isSocialApprovalPayload,
  type SocialApprovalPayload,
  type ChannelLogger,
  type TelegramRuntimeConfig
} from "./types.js";
export type { SocialDmSender, SocialDmRequest, SocialDmResult } from "../social/dm-sender.js";
