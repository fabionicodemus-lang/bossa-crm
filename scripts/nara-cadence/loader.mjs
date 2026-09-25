// Loader do teste da cadência: resolve o alias "@/" e troca WhatsApp/Supabase por simulações.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../src') + '/';
const STUBS = {
  '@/lib/whatsapp/webhookProcessor': 'stubs/wp.mjs',
  '@/lib/supabase/admin': 'stubs/admin.mjs',
  '@/lib/whatsapp/channelService': 'stubs/cs.mjs',
  '@/lib/whatsapp/utils': 'stubs/utils.mjs',
};
export async function resolve(spec, ctx, next) {
  if (STUBS[spec]) return next(pathToFileURL(path.join(here, STUBS[spec])).href, ctx);
  if (spec.startsWith('@/')) return next(pathToFileURL(SRC + spec.slice(2) + '.ts').href, ctx);
  return next(spec, ctx);
}
