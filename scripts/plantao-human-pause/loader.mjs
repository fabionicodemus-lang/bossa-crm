import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolve as resolveTs } from '../ts-extension-loader.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const stubs = new Set(['@/lib/supabase/admin', '@/lib/whatsapp/channelService', '@/lib/whatsapp/webhookProcessor']);
export async function resolve(spec, ctx, next) {
  if (stubs.has(spec)) return next(pathToFileURL(path.join(here, 'stubs.mjs')).href, ctx);
  if (spec.startsWith('@/')) return next(pathToFileURL(path.resolve(here, '../../src', spec.slice(2) + '.ts')).href, ctx);
  return resolveTs(spec, ctx, next);
}
