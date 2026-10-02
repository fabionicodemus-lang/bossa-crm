
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('handoff','task')),
  source text not null default 'system',
  title text not null,
  body text,
  lead_id uuid references public.leads(id) on delete cascade,
  handoff_id uuid references public.lead_handoffs(id) on delete cascade,
  task_id uuid references public.lead_tasks(id) on delete cascade,
  status text not null default 'open' check (status in ('open','resolved')),
  accepted_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_notifications enable row level security;

drop policy if exists user_notifications_select_own on public.user_notifications;
create policy user_notifications_select_own
on public.user_notifications for select
to authenticated
using (user_id = auth.uid());

drop policy if exists user_notifications_update_own on public.user_notifications;
create policy user_notifications_update_own
on public.user_notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, update on public.user_notifications to authenticated;
grant all on public.user_notifications to service_role;

create unique index if not exists user_notifications_user_handoff_uidx
  on public.user_notifications(user_id,handoff_id)
  where handoff_id is not null;

create unique index if not exists user_notifications_user_task_uidx
  on public.user_notifications(user_id,task_id)
  where task_id is not null;

create index if not exists user_notifications_open_user_idx
  on public.user_notifications(user_id,created_at desc)
  where status='open';

alter table public.lead_tasks
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references public.profiles(id) on delete set null;

create or replace function public.sync_handoff_user_notification()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text;
  v_kind public.lead_kind;
  v_source text;
  v_title text;
begin
  if tg_op='UPDATE' and old.offered_to is distinct from new.offered_to and old.offered_to is not null then
    update public.user_notifications
    set status='resolved',resolved_at=coalesce(resolved_at,now()),updated_at=now()
    where handoff_id=new.id and user_id=old.offered_to and status='open';
  end if;

  if new.status in ('pending','overdue') and new.offered_to is not null then
    select name,kind into v_name,v_kind from public.leads where id=new.lead_id;
    if new.requested_by in ('ai','system') then
      v_source := case when v_kind='cliente' then 'nara' when v_kind='corretor' then 'plantao' else 'sistema' end;
      v_title := case when v_kind='cliente' then 'Nova passagem da Nara' when v_kind='corretor' then 'Nova passagem do Plantão' else 'Nova passagem de atendimento' end;
    else
      v_source := 'usuario';
      v_title := 'Nova passagem de atendimento';
    end if;

    insert into public.user_notifications(
      organization_id,user_id,kind,source,title,body,lead_id,handoff_id,status,metadata,created_at,updated_at
    ) values (
      new.organization_id,new.offered_to,'handoff',v_source,v_title,
      concat(coalesce(v_name,'Lead'),case when nullif(new.reason,'') is not null then ' · '||new.reason else '' end),
      new.lead_id,new.id,'open',
      jsonb_build_object('action','accept_handoff','priority_class',new.priority_class,'requested_by',new.requested_by),
      now(),now()
    )
    on conflict (user_id,handoff_id) where handoff_id is not null
    do update set
      title=excluded.title,
      body=excluded.body,
      source=excluded.source,
      status='open',
      resolved_at=null,
      accepted_at=null,
      metadata=excluded.metadata,
      updated_at=now();
  else
    update public.user_notifications
    set status='resolved',
        accepted_at=case when new.status='accepted' then coalesce(accepted_at,new.accepted_at,now()) else accepted_at end,
        resolved_at=coalesce(resolved_at,now()),
        updated_at=now()
    where handoff_id=new.id and status='open';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_handoff_user_notification on public.lead_handoffs;
create trigger trg_sync_handoff_user_notification
after insert or update of status,offered_to,reason on public.lead_handoffs
for each row execute function public.sync_handoff_user_notification();

create or replace function public.sync_task_user_notification()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text;
begin
  if tg_op='UPDATE' and old.assigned_to is distinct from new.assigned_to and old.assigned_to is not null then
    update public.user_notifications
    set status='resolved',resolved_at=coalesce(resolved_at,now()),updated_at=now()
    where task_id=new.id and user_id=old.assigned_to and status='open';
  end if;

  if new.status in ('pending','overdue')
     and new.assigned_to is not null
     and new.accepted_at is null
     and coalesce(new.dedupe_key,'') not in ('handoff:pending','human:first-contact')
     and (new.created_by is null or new.created_by is distinct from new.assigned_to)
  then
    select name into v_name from public.leads where id=new.lead_id;

    insert into public.user_notifications(
      organization_id,user_id,kind,source,title,body,lead_id,task_id,status,metadata,created_at,updated_at
    ) values (
      new.organization_id,new.assigned_to,'task',
      case when new.created_by_kind='human' then 'usuario' else 'sistema' end,
      'Nova tarefa para você',
      concat(new.title,case when v_name is not null then ' · '||v_name else '' end),
      new.lead_id,new.id,'open',
      jsonb_build_object('action','accept_task','priority',new.priority,'due_at',new.due_at,'type',new.type),
      now(),now()
    )
    on conflict (user_id,task_id) where task_id is not null
    do update set
      title=excluded.title,
      body=excluded.body,
      source=excluded.source,
      status='open',
      resolved_at=null,
      accepted_at=null,
      metadata=excluded.metadata,
      updated_at=now();
  else
    update public.user_notifications
    set status='resolved',
        resolved_at=coalesce(resolved_at,now()),
        updated_at=now()
    where task_id=new.id and status='open';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_task_user_notification on public.lead_tasks;
create trigger trg_sync_task_user_notification
after insert or update of status,assigned_to,title,due_at,accepted_at on public.lead_tasks
for each row execute function public.sync_task_user_notification();

insert into public.user_notifications(
  organization_id,user_id,kind,source,title,body,lead_id,handoff_id,status,metadata,created_at,updated_at
)
select
  h.organization_id,h.offered_to,'handoff',
  case when h.requested_by in ('ai','system') and l.kind='cliente' then 'nara'
       when h.requested_by in ('ai','system') and l.kind='corretor' then 'plantao'
       when h.requested_by='human' then 'usuario' else 'sistema' end,
  case when h.requested_by in ('ai','system') and l.kind='cliente' then 'Nova passagem da Nara'
       when h.requested_by in ('ai','system') and l.kind='corretor' then 'Nova passagem do Plantão'
       else 'Nova passagem de atendimento' end,
  concat(l.name,case when nullif(h.reason,'') is not null then ' · '||h.reason else '' end),
  h.lead_id,h.id,'open',
  jsonb_build_object('action','accept_handoff','priority_class',h.priority_class,'requested_by',h.requested_by),
  h.created_at,now()
from public.lead_handoffs h
join public.leads l on l.id=h.lead_id
where h.status in ('pending','overdue')
  and h.offered_to is not null
  and h.created_at >= now()-interval '30 days'
on conflict (user_id,handoff_id) where handoff_id is not null do nothing;

insert into public.user_notifications(
  organization_id,user_id,kind,source,title,body,lead_id,task_id,status,metadata,created_at,updated_at
)
select
  t.organization_id,t.assigned_to,'task',
  case when t.created_by_kind='human' then 'usuario' else 'sistema' end,
  'Nova tarefa para você',
  concat(t.title,' · ',l.name),
  t.lead_id,t.id,'open',
  jsonb_build_object('action','accept_task','priority',t.priority,'due_at',t.due_at,'type',t.type),
  t.created_at,now()
from public.lead_tasks t
join public.leads l on l.id=t.lead_id
where t.status in ('pending','overdue')
  and t.assigned_to is not null
  and t.accepted_at is null
  and coalesce(t.dedupe_key,'') not in ('handoff:pending','human:first-contact')
  and (t.created_by is null or t.created_by is distinct from t.assigned_to)
  and t.created_at >= now()-interval '30 days'
on conflict (user_id,task_id) where task_id is not null do nothing;
