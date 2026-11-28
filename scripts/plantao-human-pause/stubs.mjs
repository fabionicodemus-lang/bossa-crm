export function createAdminClient() { return globalThis.TEST_ADMIN; }
export async function ensureConversation() { return { id: 'conversation' }; }
export async function findChannelByPhoneNumberId() { return globalThis.TEST_CHANNEL; }
export async function processWebhookEvent() { throw new Error('Unexpected inbound dispatch'); }
export function channelAccess() { throw new Error('No real sends in this test'); }
