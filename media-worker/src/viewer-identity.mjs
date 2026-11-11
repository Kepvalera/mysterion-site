// Telegram-only accounts prove identity through the immutable confirmed bot
// link. They do not acquire a fictitious email verification timestamp.
export const verifiedIdentitySQL=(alias='a')=>`(${alias}.email_verified_at IS NOT NULL OR (${alias}.telegram_only=1 AND EXISTS(SELECT 1 FROM telegram_account_links identity_link WHERE identity_link.viewer_id=${alias}.id)))`;
