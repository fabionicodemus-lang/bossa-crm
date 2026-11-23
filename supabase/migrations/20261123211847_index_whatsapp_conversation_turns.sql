-- Match the enum predicate of messages_ai_recent_conversation_idx in both RPCs.
-- The additional index covers a conversation's recent history and human replies.
set local lock_timeout = '3s';

create index if not exists messages_conversation_chronology_idx
  on public.messages (whatsapp_conversation_id, created_at desc, id desc)
  where whatsapp_conversation_id is not null;

create or replace function public.claim_whatsapp_ai_turn(p_conversation_id uuid, p_source_message_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_latest uuid; v_claimed uuid;
begin
  select id into v_latest from public.messages
  where whatsapp_conversation_id = p_conversation_id and direction = 'in'
  order by created_at desc, id desc limit 1;
  if v_latest is distinct from p_source_message_id then return false; end if;
  insert into public.whatsapp_ai_turn_claims as c (conversation_id, source_message_id, claimed_at, expires_at, sent_at)
  values (p_conversation_id, p_source_message_id, now(), now() + interval '120 seconds', null)
  on conflict (conversation_id) do update
    set source_message_id = excluded.source_message_id,
        claimed_at = excluded.claimed_at,
        expires_at = excluded.expires_at,
        sent_at = null
    where (c.source_message_id is distinct from excluded.source_message_id)
       or (c.sent_at is null and c.expires_at < now())
  returning source_message_id into v_claimed;
  return v_claimed is not null;
end; $$;

create or replace function public.whatsapp_ai_turn_is_current(p_conversation_id uuid, p_source_message_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.whatsapp_ai_turn_claims c
    where c.conversation_id = p_conversation_id and c.source_message_id = p_source_message_id
      and c.sent_at is null and c.expires_at >= now()
      and p_source_message_id = (
        select m.id from public.messages m
        where m.whatsapp_conversation_id = p_conversation_id and m.direction = 'in'
        order by m.created_at desc, m.id desc limit 1
      )
  );
$$;

revoke all on function public.claim_whatsapp_ai_turn(uuid,uuid),
  public.whatsapp_ai_turn_is_current(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_ai_turn(uuid,uuid),
  public.whatsapp_ai_turn_is_current(uuid,uuid) to service_role;
