alter table public.whatsapp_channels
  add column if not exists coexistence_webhooks_ensured_at timestamptz,
  add column if not exists coexistence_webhooks_error text;
