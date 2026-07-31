// Fachada temporária de compatibilidade.
// O acesso à Graph API fica exclusivamente em providers/metaCloud.ts.

import type {
  WhatsAppMediaType,
  WhatsAppTemplate,
  WhatsAppTemplateComponent,
} from '@/lib/whatsapp/channelProvider';
import { encryptToken, decryptToken, verifyMetaSignature } from '@/lib/whatsapp/crypto';
import { exchangeEmbeddedSignupCode, metaCloudProvider } from '@/lib/whatsapp/providers/metaCloud';
import { normalizeWaId } from '@/lib/whatsapp/utils';

export type MetaTemplateComponent = WhatsAppTemplateComponent;
export type MetaMessageTemplate = WhatsAppTemplate;
export type { WhatsAppMediaType };
export { encryptToken, decryptToken, verifyMetaSignature, normalizeWaId, exchangeEmbeddedSignupCode };

export async function subscribeAppToWaba(wabaId: string, accessToken: string) {
  return metaCloudProvider.subscribeWebhook({ wabaId, accessToken });
}

export async function getPhoneNumber(phoneNumberId: string, accessToken: string) {
  const phone = await metaCloudProvider.getPhoneInfo({ phoneNumberId, accessToken });
  return {
    id: phone.id,
    verified_name: phone.verifiedName ?? undefined,
    display_phone_number: phone.displayPhoneNumber ?? undefined,
    quality_rating: phone.qualityRating ?? undefined,
    whatsapp_business_manager_messaging_limit: phone.messagingLimit ?? undefined,
  };
}

export async function getWhatsAppTemplates(args: { wabaId: string; accessToken: string }) {
  return metaCloudProvider.listTemplates(args);
}

export async function uploadMetaTemplateMedia(args: {
  accessToken: string;
  fileName: string;
  fileType: string;
  bytes: ArrayBuffer;
}) {
  return metaCloudProvider.uploadTemplateMedia(args);
}

export async function createWhatsAppTemplate(args: {
  wabaId: string;
  accessToken: string;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY';
  components: MetaTemplateComponent[];
}) {
  return metaCloudProvider.createTemplate(args);
}

export async function sendWhatsAppText(args: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
}) {
  const result = await metaCloudProvider.sendText(args);
  return result.raw as { messages?: Array<{ id: string }> };
}

export async function sendWhatsAppTemplate(args: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  name: string;
  language: string;
  bodyParameters?: string[];
  headerType?: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | 'NONE';
  headerMediaLink?: string;
  headerText?: string;
}) {
  const result = await metaCloudProvider.sendTemplate(args);
  return result.raw as { messages?: Array<{ id: string }> };
}

export async function sendWhatsAppMedia(args: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  type: WhatsAppMediaType;
  link: string;
  caption?: string;
  filename?: string;
}) {
  const result = await metaCloudProvider.sendMedia(args);
  return result.raw as { messages?: Array<{ id: string }> };
}
