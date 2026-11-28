-- Prioriza perguntas pendentes e mantém falhas técnicas fora da retomada automática.
begin;
create or replace function public.resume_plantao_after_human_pause(p_lead_id uuid)
returns boolean language plpgsql set search_path = public as $$
declare
  l public.leads%rowtype;
  config public.ai_agent_configs%rowtype;
  local_time timestamp;
  active_now boolean := false;
begin
  select * into l from public.leads where id=p_lead_id for update;
  if not found or l.kind<>'corretor' or not l.automation_paused
    or l.plantao_human_pause_until is null or l.plantao_human_pause_until>now()
    or coalesce(l.next_action_type,'')='falha_ia'
    or l.opt_out or l.archived_at is not null or l.stage in ('encerrado','fechado_ganho') then return false; end if;
  select * into config from public.ai_agent_configs where organization_id=l.organization_id and agent='plantao' limit 1;
  if not found or not config.active then return false; end if;
  local_time := timezone(coalesce(nullif(config.schedule_timezone,''),'America/Sao_Paulo'),now());
  if jsonb_typeof(config.schedule)='array' and jsonb_array_length(config.schedule)=7 then
    active_now := coalesce((config.schedule -> extract(dow from local_time)::int ->> extract(hour from local_time)::int)::boolean,false);
  else
    active_now := extract(dow from local_time)::int in (0,6) or extract(hour from local_time)::int>=18 or extract(hour from local_time)::int<8;
  end if;
  if not active_now then return false; end if;
  update public.leads set owner_mode='ai',ai_enabled=true,automation_paused=false,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('whatsapp_manual_takeover',false,
      'plantao_resumed_after_human_pause_at',now()), updated_at=now()
    where id=l.id;
  insert into public.activities(organization_id,lead_id,type,title,description,metadata)
    values(l.organization_id,l.id,'plantao_pausa_expirada','Plantão retomado após 30 minutos sem resposta humana',
      'O horário configurado foi respeitado e a etapa comercial foi preservada.',
      jsonb_build_object('pause_until',l.plantao_human_pause_until,'stage',l.stage));
  return true;
end $$;
revoke all on function public.resume_plantao_after_human_pause(uuid) from public,anon,authenticated;
grant execute on function public.resume_plantao_after_human_pause(uuid) to service_role;


create or replace function public.plantao_human_pause_candidates(p_limit integer default 3)
returns table(lead_id uuid) language sql stable set search_path = public as $$
  with eligible as (
    select l.*, exists (
      select 1 from public.messages m join public.whatsapp_channels ch on ch.id=m.whatsapp_channel_id
      where m.lead_id=l.id and ch.role='corretor' and m.direction='in' and m.sender_kind='lead'
        and m.created_at>l.plantao_human_pause_until-interval '30 minutes'
        and m.created_at>now()-interval '24 hours'
        and coalesce(m.raw_payload->>'source','')<>'whatsapp_business_app_history'
        and not exists(select 1 from public.messages o where o.whatsapp_conversation_id=m.whatsapp_conversation_id
          and o.direction='out' and o.created_at>=m.created_at)
    ) as waiting
    from public.leads l where l.kind='corretor' and l.plantao_human_pause_until<=now()
    and not l.opt_out and l.archived_at is null and l.stage not in ('encerrado','fechado_ganho')
    and coalesce(l.next_action_type,'')<>'falha_ia'
  ) select id from eligible
  where automation_paused or (owner_mode='ai' and ai_enabled and waiting)
  order by waiting desc,plantao_human_pause_until desc,id limit greatest(1,least(p_limit,20));
$$;
revoke all on function public.plantao_human_pause_candidates(integer) from public,anon,authenticated;
grant execute on function public.plantao_human_pause_candidates(integer) to service_role;


commit;
