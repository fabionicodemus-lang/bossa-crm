-- Agenda do Plantão de corretores e controle de tomada manual da conversa.

alter table public.ai_agent_configs
  add column if not exists schedule jsonb not null default '[]'::jsonb,
  add column if not exists schedule_timezone text not null default 'America/Sao_Paulo';

-- Padrão inicial: dias úteis 18h–8h e fins de semana 24h.
update public.ai_agent_configs c
set schedule = s.default_schedule,
    schedule_timezone = 'America/Sao_Paulo'
from (
  select jsonb_agg(day_hours order by day_no) as default_schedule
  from (
    select day_no,
           jsonb_agg(
             case
               when day_no in (0, 6) then true
               when hour_no >= 18 or hour_no < 8 then true
               else false
             end
             order by hour_no
           ) as day_hours
    from generate_series(0, 6) as d(day_no)
    cross join generate_series(0, 23) as h(hour_no)
    group by day_no
  ) q
) s
where c.agent = 'plantao'
  and (jsonb_typeof(c.schedule) <> 'array' or jsonb_array_length(c.schedule) <> 7);

create or replace function public.apply_broker_plantao_schedule_on_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_automation_paused boolean;
  v_metadata jsonb;
  v_active boolean;
  v_schedule jsonb;
  v_timezone text;
  v_local timestamp;
  v_day integer;
  v_hour integer;
  v_schedule_on boolean := false;
begin
  if new.lead_id is null or new.direction::text <> 'in' or new.sender_kind::text <> 'lead' then
    return new;
  end if;

  -- A importação dos 180 dias não deve acionar nem alterar o Plantão.
  if coalesce(new.raw_payload ->> 'source', '') = 'whatsapp_business_app_history' then
    return new;
  end if;

  select kind::text, automation_paused, metadata
    into v_kind, v_automation_paused, v_metadata
  from public.leads
  where id = new.lead_id;

  if v_kind is distinct from 'corretor' then
    return new;
  end if;

  -- Uma conversa assumida manualmente permanece com o comercial.
  if coalesce(v_automation_paused, false)
     and coalesce((v_metadata ->> 'whatsapp_manual_takeover')::boolean, false) then
    return new;
  end if;

  select active, schedule, schedule_timezone
    into v_active, v_schedule, v_timezone
  from public.ai_agent_configs
  where organization_id = new.organization_id
    and agent = 'plantao'
  limit 1;

  if coalesce(v_active, false) then
    v_timezone := coalesce(nullif(v_timezone, ''), 'America/Sao_Paulo');
    v_local := timezone(v_timezone, now());
    v_day := extract(dow from v_local)::integer;
    v_hour := extract(hour from v_local)::integer;

    if jsonb_typeof(v_schedule) = 'array' and jsonb_array_length(v_schedule) = 7 then
      begin
        v_schedule_on := coalesce((v_schedule -> v_day ->> v_hour)::boolean, false);
      exception when others then
        v_schedule_on := false;
      end;
    else
      v_schedule_on := (v_day in (0, 6)) or (v_hour >= 18) or (v_hour < 8);
    end if;
  end if;

  update public.leads
  set owner_mode = case when v_schedule_on then 'ai' else 'human' end,
      ai_enabled = v_schedule_on,
      automation_paused = false,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'plantao_schedule_checked_at', now(),
          'plantao_schedule_active', v_schedule_on,
          'plantao_schedule_timezone', coalesce(v_timezone, 'America/Sao_Paulo')
        )
  where id = new.lead_id;

  return new;
end;
$$;

drop trigger if exists messages_apply_broker_plantao_schedule on public.messages;
create trigger messages_apply_broker_plantao_schedule
after insert on public.messages
for each row
execute function public.apply_broker_plantao_schedule_on_inbound();
