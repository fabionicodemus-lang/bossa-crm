const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'NEXT_PUBLIC_APP_URL',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Variáveis ausentes: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('Variáveis essenciais configuradas.');
