
alter table public.client_handoff_settings
  add column if not exists secondary_owner_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists secondary_owner_name text,
  add column if not exists secondary_owner_alert_phone text,
  add column if not exists last_assigned_owner_user_id uuid references public.profiles(id) on delete set null;

update public.client_handoff_settings
set
  secondary_owner_user_id = '56d0868a-dbcd-46ab-aba6-46726bc5a77a',
  secondary_owner_name = 'Cíntia',
  secondary_owner_alert_phone = coalesce(secondary_owner_alert_phone, post_sale_alert_phone, '554792381206'),
  last_assigned_owner_user_id = coalesce(last_assigned_owner_user_id, primary_owner_user_id),
  updated_at = now()
where organization_id = 'efb563c0-42e2-403c-b86e-15b61a563757';

create or replace function public.next_client_handoff_owner(
  target_organization_id uuid,
  target_lead_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.client_handoff_settings%rowtype;
  existing_owner uuid;
  chosen_owner uuid;
  chosen_name text;
  chosen_phone text;
begin
  select *
  into s
  from public.client_handoff_settings
  where organization_id=target_organization_id
  for update;

  if s.organization_id is null or not coalesce(s.enabled,false) then
    return jsonb_build_object('user_id',null,'owner_name',null,'alert_phone',null,'reused',false);
  end if;

  if target_lead_id is not null then
    select offered_to
    into existing_owner
    from public.lead_handoffs
    where organization_id=target_organization_id
      and lead_id=target_lead_id
      and status in ('pending','overdue')
      and offered_to is not null
    order by created_at desc
    limit 1;

    if existing_owner is not null then
      if existing_owner=s.secondary_owner_user_id then
        return jsonb_build_object(
          'user_id',existing_owner,
          'owner_name',coalesce(s.secondary_owner_name,'Cíntia'),
          'alert_phone',s.secondary_owner_alert_phone,
          'reused',true
        );
      end if;
      return jsonb_build_object(
        'user_id',existing_owner,
        'owner_name',coalesce(s.primary_owner_name,'Taís'),
        'alert_phone',s.primary_owner_alert_phone,
        'reused',true
      );
    end if;
  end if;

  if s.primary_owner_user_id is null then
    chosen_owner := s.secondary_owner_user_id;
    chosen_name := s.secondary_owner_name;
    chosen_phone := s.secondary_owner_alert_phone;
  elsif s.secondary_owner_user_id is null then
    chosen_owner := s.primary_owner_user_id;
    chosen_name := s.primary_owner_name;
    chosen_phone := s.primary_owner_alert_phone;
  elsif s.last_assigned_owner_user_id = s.primary_owner_user_id then
    chosen_owner := s.secondary_owner_user_id;
    chosen_name := coalesce(s.secondary_owner_name,'Cíntia');
    chosen_phone := s.secondary_owner_alert_phone;
  else
    chosen_owner := s.primary_owner_user_id;
    chosen_name := coalesce(s.primary_owner_name,'Taís');
    chosen_phone := s.primary_owner_alert_phone;
  end if;

  update public.client_handoff_settings
  set last_assigned_owner_user_id=chosen_owner,updated_at=now()
  where organization_id=target_organization_id;

  return jsonb_build_object(
    'user_id',chosen_owner,
    'owner_name',chosen_name,
    'alert_phone',chosen_phone,
    'reused',false
  );
end;
$$;

grant execute on function public.next_client_handoff_owner(uuid,uuid) to service_role;
