-- Segmentação por domínio do Site Bossa: mudanças aditivas, dados antigos preservados.
-- O domínio vem exclusivamente do servidor do site, no detalhe técnico __site_hostname.
ALTER TABLE public.site_sessions ADD COLUMN IF NOT EXISTS hostname text;
ALTER TABLE public.site_events ADD COLUMN IF NOT EXISTS hostname text;
CREATE INDEX IF NOT EXISTS site_sessions_hostname_started_idx ON public.site_sessions(hostname, started_at);
CREATE INDEX IF NOT EXISTS site_events_hostname_created_idx ON public.site_events(hostname, created_at);

CREATE OR REPLACE FUNCTION public.site_registrar_evento(p_visitante text, p_sessao uuid, p_visita integer, p_evento text, p_detalhe jsonb, p_pagina text, p_referencia text, p_utm jsonb, p_tela text, p_idioma text, p_pais text, p_cidade text, p_dispositivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hostname text := nullif(lower(left(p_detalhe->>'__site_hostname', 253)), '');
begin
  insert into site_visitors(code, first_page, first_referrer, first_utm, country, city, device, visits)
  values (p_visitante, p_pagina, p_referencia, coalesce(p_utm, '{}'::jsonb), p_pais, p_cidade, p_dispositivo, greatest(p_visita, 1))
  on conflict (code) do update set last_seen_at = now(), visits = greatest(site_visitors.visits, excluded.visits),
    country = coalesce(excluded.country, site_visitors.country), city = coalesce(excluded.city, site_visitors.city),
    device = coalesce(excluded.device, site_visitors.device);

  if p_sessao is not null then
    insert into site_sessions(id, visitor_code, visit_number, entry_page, referrer, utm, events, hostname)
    values (p_sessao, p_visitante, greatest(p_visita, 1), p_pagina, p_referencia, coalesce(p_utm, '{}'::jsonb), 1, v_hostname)
    on conflict (id) do update set last_event_at = now(), events = site_sessions.events + 1,
      hostname = coalesce(site_sessions.hostname, excluded.hostname);
  end if;

  insert into site_events(visitor_code, session_id, name, props, page, hostname)
  values (p_visitante, p_sessao, p_evento,
          (coalesce(p_detalhe, '{}'::jsonb) - '__site_hostname') || jsonb_strip_nulls(jsonb_build_object('tela', p_tela, 'idioma', p_idioma)),
          p_pagina, v_hostname);
end $function$;


CREATE OR REPLACE FUNCTION public.site_registrar_evento(p_visitante text, p_sessao uuid, p_visita integer, p_evento text, p_detalhe jsonb, p_pagina text, p_referencia text, p_utm jsonb, p_tela text, p_idioma text, p_pais text, p_estado text, p_cidade text, p_dispositivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hostname text := nullif(lower(left(p_detalhe->>'__site_hostname', 253)), '');
begin
  insert into site_visitors(code, first_page, first_referrer, first_utm, country, city, device, visits)
  values (p_visitante, p_pagina, p_referencia, coalesce(p_utm, '{}'::jsonb), p_pais, p_cidade, p_dispositivo, greatest(p_visita, 1))
  on conflict (code) do update set last_seen_at = now(), visits = greatest(site_visitors.visits, excluded.visits),
    country = coalesce(excluded.country, site_visitors.country), city = coalesce(excluded.city, site_visitors.city),
    device = coalesce(excluded.device, site_visitors.device);

  if p_sessao is not null then
    insert into site_sessions(id, visitor_code, visit_number, entry_page, referrer, utm, events, country, region, city, hostname)
    values (p_sessao, p_visitante, greatest(p_visita, 1), p_pagina, p_referencia, coalesce(p_utm, '{}'::jsonb), 1, p_pais, p_estado, p_cidade, v_hostname)
    on conflict (id) do update set last_event_at = now(), events = site_sessions.events + 1,
      country = coalesce(excluded.country, site_sessions.country),
      region = coalesce(excluded.region, site_sessions.region),
      city = coalesce(excluded.city, site_sessions.city),
      hostname = coalesce(site_sessions.hostname, excluded.hostname);
  end if;

  insert into site_events(visitor_code, session_id, name, props, page, hostname)
  values (p_visitante, p_sessao, p_evento,
          (coalesce(p_detalhe, '{}'::jsonb) - '__site_hostname') || jsonb_strip_nulls(jsonb_build_object('tela', p_tela, 'idioma', p_idioma)),
          p_pagina, v_hostname);
end $function$;


-- Mantém o acesso privilegiado original a ambas as versões do RPC.
REVOKE ALL ON FUNCTION public.site_registrar_evento(text, uuid, integer, text, jsonb, text, text, jsonb, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_registrar_evento(text, uuid, integer, text, jsonb, text, text, jsonb, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_registrar_evento(text, uuid, integer, text, jsonb, text, text, jsonb, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_registrar_evento(text, uuid, integer, text, jsonb, text, text, jsonb, text, text, text, text, text, text) TO service_role;
