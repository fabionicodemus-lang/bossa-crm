const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_APP_URL',
  'META_APP_ID',
  'META_APP_SECRET',
  'META_GRAPH_VERSION',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64',
  'OPENAI_API_KEY',
  'CRON_SECRET',
];

if (process.env.FEATURE_EMBEDDED_SIGNUP === 'true') {
  required.push(
    'NEXT_PUBLIC_META_APP_ID',
    'NEXT_PUBLIC_META_CONFIG_ID',
    'NEXT_PUBLIC_META_GRAPH_VERSION',
  );
}

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Variáveis ausentes: ${missing.join(', ')}`);
  process.exit(1);
}

const encryptionKey = Buffer.from(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64, 'base64');
if (encryptionKey.length !== 32) {
  console.error('WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64 deve representar exatamente 32 bytes.');
  process.exit(1);
}

if (!/^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION)) {
  console.error('META_GRAPH_VERSION deve usar o formato vNN.N, conforme a versão configurada na Meta.');
  process.exit(1);
}

console.log('Variáveis essenciais, WhatsApp, IA e worker configurados.');
