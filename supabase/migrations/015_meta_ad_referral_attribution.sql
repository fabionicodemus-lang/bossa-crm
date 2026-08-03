-- BOSSA CRM — atribuição de anúncios Click-to-WhatsApp da Meta
-- Arquivo criado na Fase 5. Não executar automaticamente sem aprovação.

create index if not exists leads_meta_ad_source_id_idx
  on public.leads (organization_id, ((metadata -> 'ad' ->> 'source_id')))
  where kind = 'cliente'
    and metadata -> 'ad' ->> 'source_id' is not null;

comment on index public.leads_meta_ad_source_id_idx is
  'Permite consultar e agrupar leads pelo ID do anúncio Meta preservado em metadata.ad.source_id.';
