-- Acrescenta a localização de cada sessão para exibição no painel /site do CRM.
-- A localização é obtida no servidor pelos cabeçalhos geográficos da Vercel.
alter table public.site_sessions
  add column if not exists country text,
  add column if not exists region text,
  add column if not exists city text;

-- Mantém a assinatura anterior funcionando durante a transição do deploy.
create or replace function public.site_registrar_evento(
  p_visitante text, p_sessao uuid, p_visita integer, p_evento text, p_detalhe jsonb,
  p_pagina text, p_referencia text, p_utm jsonb, p_tela text, p_idioma text,
  p_pais text, p_estado text, p_cidade text, p_dispositivo text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into site_visitors(code, first_page, first_referrer, first_utm, country, city, device, visits)
  values (p_visitante, p_pagina, p_referencia, coalesce(p_utm, '{}'::jsonb), p_pais, p_cidade, p_dispositivo, greatest(p_visita, 1))
  on conflict (code) do update set last_seen_at = now(), visits = greatest(site_visitors.visits, excluded.visits),
    country = coalesce(excluded.country, site_visitors.country), city = coalesce(excluded.city, site_visitors.city),
    device = coalesce(excluded.device, site_visitors.device);

  if p_sessao is not null then
    insert into site_sessions(id, visitor_code, visit_number, entry_page, referrer, utm, events, country, region, city)
    values (p_sessao, p_visitante, greatest(p_visita, 1), p_pagina, p_referencia, coalesce(p_utm, '{}'::jsonb), 1, p_pais, p_estado, p_cidade)
    on conflict (id) do update set last_event_at = now(), events = site_sessions.events + 1,
      country = coalesce(excluded.country, site_sessions.country),
      region = coalesce(excluded.region, site_sessions.region),
      city = coalesce(excluded.city, site_sessions.city);
  end if;

  insert into site_events(visitor_code, session_id, name, props, page)
  values (p_visitante, p_sessao, p_evento,
          coalesce(p_detalhe, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('tela', p_tela, 'idioma', p_idioma)),
          p_pagina);
end $$;

revoke all on function public.site_registrar_evento(text, uuid, integer, text, jsonb, text, text, jsonb, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.site_registrar_evento(text, uuid, integer, text, jsonb, text, text, jsonb, text, text, text, text, text, text) to service_role;
