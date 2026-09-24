import {
  channelAccess,
  type WhatsAppChannelRecord,
} from '@/lib/whatsapp/channelService';

export async function sendNaraResetConfirmation(
  channel: WhatsAppChannelRecord,
  waId: string,
) {
  const { provider, accessToken, phoneNumberId } = channelAccess(channel);
  return provider.sendText({
    phoneNumberId,
    accessToken,
    to: waId,
    body: 'Conversa da Nara zerada. O próximo teste começa do zero.',
  });
}
