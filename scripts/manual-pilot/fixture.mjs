// Test transport/configuration only; never a real account or deployment credential.
export const origin='https://okhtfibuexfsgkobjxtu.supabase.co';
export const site='https://manual-pilot-fixture.vercel.app';
export const config={BOSSA_HOMOLOGATION_MODE:'manual-pilot',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_L89zRE7TKcC4ij14B5QyOa72XfPz',
 VERCEL_DEPLOYMENT_ID:'dpl_ManualFixture',VERCEL_URL:'manual-pilot-fixture.vercel.app',VERCEL_GIT_COMMIT_REF:'feat/commercial-metrics-foundation',
 VERCEL_GIT_COMMIT_SHA:'1'.repeat(40),BOSSA_HOMOLOGATION_COMMIT:'1'.repeat(40),
 NEXT_PUBLIC_BOSSA_HOMOLOGATION:'required',NEXT_PUBLIC_BOSSA_HOMOLOGATION_MODE:'manual-pilot',NEXT_PUBLIC_BOSSA_HOMOLOGATION_PROJECT:'prj_L89zRE7TKcC4ij14B5QyOa72XfPz',
 NEXT_PUBLIC_BOSSA_HOMOLOGATION_COMMIT:'1'.repeat(40),NEXT_PUBLIC_BOSSA_HOMOLOGATION_ORIGIN:site,
 BOSSA_HOMOLOGATION_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_URL:origin,
 BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_manual_fixture',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_manual_fixture',
 FEATURE_DIRECT_WHATSAPP_CONNECTION:'false',FEATURE_EMBEDDED_SIGNUP:'false',NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP:'false'};
export const claims={sub:'00000000-0000-0000-0000-000000000010',role:'authenticated',email:'fixture@bossa-homolog.invalid',is_anonymous:false,iss:origin+'/auth/v1',aud:'authenticated',exp:4102444800};
// This token is deliberately not a usable Supabase JWT. Real signature verification is external.
export const token=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify(claims)).toString('base64url'),'unregistered-local-fixture'].join('.');
export function setEnv(values={}) {
 for(const k of Object.keys(process.env))if(/^(BOSSA_|VERCEL_|NEXT_PUBLIC_|SUPABASE_|OPENAI_|CRON_|FEATURE_|META_|MICROSOFT_|OUTLOOK_|WHATSAPP_|NARA_|SMTP_|RESEND_|SENDGRID_|MAILGUN_|WEBHOOK_|DATABASE_URL|PGPASSWORD)/.test(k))delete process.env[k];
 Object.assign(process.env,config,values);
}
