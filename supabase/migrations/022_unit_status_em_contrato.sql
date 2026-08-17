-- BOSSA CRM — adiciona o status comercial Em contrato às unidades

begin;

alter table public.development_units
  drop constraint if exists development_units_status_check;

alter table public.development_units
  add constraint development_units_status_check
  check (status in ('disponivel','reservado','em_contrato','vendido','oculto','bloqueado'));

commit;
