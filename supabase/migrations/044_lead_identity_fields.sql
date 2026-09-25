alter table public.leads
  add column if not exists first_name text,
  add column if not exists last_name text;

comment on column public.leads.first_name is 'Primeiro nome identificado do contato.';
comment on column public.leads.last_name is 'Restante do nome do contato, sem o primeiro nome.';
