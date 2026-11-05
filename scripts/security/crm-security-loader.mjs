import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const mocks = new URL('./crm-security-mocks.mjs', import.meta.url).href;
const source = new URL('../../src/', import.meta.url);
const stubbed = new Set([
  'next/server', '@supabase/ssr', '@/lib/supabase/server', '@/lib/supabase/admin', '@/lib/auth',
  '@/lib/whatsapp/channelService', '@/lib/whatsapp/media', '@/lib/whatsapp/webhookDispatcher',
  '@/lib/agenda', '@/lib/microsoft-calendar', '@/lib/audio-transcription',
]);

export async function resolve(specifier, context, nextResolve) {
  if (stubbed.has(specifier)) return { url: mocks, shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const url = new URL(`${specifier.slice(2)}.ts`, source);
    if (!existsSync(fileURLToPath(url))) throw new Error(`Unexpected application import: ${specifier}`);
    return { url: url.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
