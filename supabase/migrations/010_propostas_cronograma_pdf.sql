-- BOSSA CRM — cronograma por datas e identidade visual das propostas
-- Execute depois de 009_transmissoes_whatsapp.sql.

begin;

alter table public.developments
  add column if not exists logo_path text;

comment on column public.developments.logo_path is
  'Caminho privado no bucket development-files para o logo usado nos PDFs de propostas.';

commit;
