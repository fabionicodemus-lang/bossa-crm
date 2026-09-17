-- Mensagens da equipe no WhatsApp Business devem avançar o pipeline sem enviar resposta da IA.
-- Esta migração também cria o marcador de análise assíncrona idempotente.
create table if not exists public.broker_human_review_state (
 lead_id uuid primary key references public.leads(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 last_message_id uuid not null references public.messages(id),
 analyzed_at timestamptz not null default now(),
 last_model text
);
alter table public.broker_human_review_state enable row level security;

create or replace function public.advance_broker_pipeline_for_human_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
 v_lead public.leads%rowtype;
 v_offer boolean := false;
 v_stage text;
 v_next_action text;
begin
 if new.lead_id is null or new.whatsapp_channel_id is null then return new; end if;
 if new.created_at < now() - interval '15 minutes' or new.created_at > now() + interval '2 minutes' then return new; end if;
 if coalesce(new.raw_payload ->> 'source', '') = 'whatsapp_business_app_history' then return new; end if;
 if not (new.direction::text = 'out' and new.sender_kind::text = 'humano'
       or new.direction::text = 'in' and new.sender_kind::text = 'lead') then return new; end if;
 if not exists (select 1 from public.whatsapp_channels c where c.id=new.whatsapp_channel_id and c.role='corretor') then return new; end if;
 select * into v_lead from public.leads where id=new.lead_id and kind='corretor' and archived_at is null;
 if not found then return new; end if;
 -- Não tocar em uma conversa ainda controlada pela IA.
 if new.direction::text = 'in' and v_lead.owner_mode <> 'human' and v_lead.ai_enabled and not v_lead.automation_paused then return new; end if;
 if v_lead.stage in ('encerrado','fechado_ganho') then return new; end if;
 select exists(select 1 from public.proposals p where p.lead_id=v_lead.id and p.status='enviada' and p.updated_at >= now()-interval '14 days') into v_offer;
 v_stage := case
   when v_lead.stage in ('agendado','pos_reuniao','proposta_negociacao') then v_lead.stage
   when v_offer then 'proposta_negociacao'
   when v_lead.stage in ('novo_triagem','qualificacao_ia','nutricao_ativa','passagem_pendente','futuro') then 'humano_ativo'
   else v_lead.stage end;
 v_next_action := case when v_offer then 'Acompanhar com a corretora a proposta enviada e confirmar o retorno do cliente; visita somente quando combinada.'
 else 'Acompanhar o retorno do corretor e registrar o próximo passo comercial.' end;
 update public.leads set
   stage=v_stage,
   owner_mode=case when new.direction::text='out' then 'human' else owner_mode end,
   ai_enabled=case when new.direction::text='out' then false else ai_enabled end,
   automation_paused=case when new.direction::text='out' then true else automation_paused end,
   priority_class=coalesce(priority_class,case when v_offer then 'A2' else 'B' end),
   temperature=greatest(temperature,case when v_offer then 65 else 35 end),
   next_action=case when next_action is null or btrim(next_action)='' then v_next_action else next_action end,
   next_action_type=coalesce(next_action_type,'followup_humano'),
   next_action_due_at=coalesce(next_action_due_at,now()+interval '1 day')
 where id=v_lead.id and kind='corretor' and archived_at is null;
 return new;
end $$;
drop trigger if exists messages_advance_broker_human_pipeline on public.messages;
create trigger messages_advance_broker_human_pipeline after insert on public.messages
for each row execute function public.advance_broker_pipeline_for_human_message();
