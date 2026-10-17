-- Mesmo critério do CRM (índice leads_org_active_phone_uidx): telefone com ou sem o 9 é o mesmo lead.
create or replace function public.site_registrar_lead(
  p_organizacao uuid, p_nome text, p_telefone text, p_formulario text, p_empreendimento text,
  p_interesse text, p_creci text, p_visitante text, p_utm jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lead uuid;
  v_origem text := 'Site · ' || coalesce(p_empreendimento, 'Bossa') || ' · ' || p_formulario;
begin
  select id into v_lead from leads
  where organization_id = p_organizacao and lead_phone_key(phone) = lead_phone_key(p_telefone) and archived_at is null
  order by created_at desc limit 1;

  if v_lead is null then
    insert into leads(organization_id, kind, name, phone, stage, source, enterprise, creci, metadata)
    values (p_organizacao, (case when p_formulario = 'corretor' then 'corretor' else 'cliente' end)::lead_kind,
            p_nome, p_telefone, 'novo_triagem', v_origem, p_empreendimento, p_creci,
            jsonb_build_object('site', jsonb_build_object('formulario', p_formulario, 'interesse', p_interesse,
              'visitante', p_visitante, 'utm', coalesce(p_utm, '{}'::jsonb), 'em', now())))
    returning id into v_lead;
  else
    update leads set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('site_ultimo', jsonb_build_object('formulario', p_formulario,
      'empreendimento', p_empreendimento, 'interesse', p_interesse, 'visitante', p_visitante, 'em', now())),
      updated_at = now()
    where id = v_lead;
  end if;

  if p_visitante is not null and exists (select 1 from site_visitors where code = p_visitante) then
    insert into lead_site_links(organization_id, lead_id, visitor_code, method)
    values (p_organizacao, v_lead, p_visitante, 'formulario') on conflict do nothing;
  end if;
  return v_lead;
end $$;
revoke all on function public.site_registrar_lead(uuid, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.site_registrar_lead(uuid, text, text, text, text, text, text, text, jsonb) to service_role;
