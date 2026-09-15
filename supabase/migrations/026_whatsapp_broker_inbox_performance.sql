-- A caixa WhatsApp Corretores não deve revarrer dezenas de milhares de mensagens
-- sempre que o usuário troca de conversa. Guardamos na própria conversa um
-- resumo da última mensagem e o mantemos atualizado por trigger.

alter table public.whatsapp_conversations
  add column if not exists last_message_id uuid,
  add column if not exists last_message_body text,
  add column if not exists last_message_type text,
  add column if not exists last_message_direction text,
  add column if not exists last_message_status text,
  add column if not exists last_message_at timestamptz;

create index if not exists whatsapp_conversations_channel_last_message_idx
  on public.whatsapp_conversations (channel_id, last_message_at desc nulls last, updated_at desc);

create or replace function public.sync_whatsapp_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_at timestamptz;
begin
  if new.conversation_id is null then
    return new;
  end if;

  event_at := coalesce(new.sent_at, new.created_at, now());

  if tg_op = 'UPDATE' then
    update public.whatsapp_conversations
    set last_message_body = new.body,
        last_message_type = new.type,
        last_message_direction = new.direction,
        last_message_status = new.status,
        updated_at = greatest(updated_at, event_at)
    where id = new.conversation_id
      and last_message_id = new.id;

    if found then
      return new;
    end if;
  end if;

  update public.whatsapp_conversations
  set last_message_id = new.id,
      last_message_body = new.body,
      last_message_type = new.type,
      last_message_direction = new.direction,
      last_message_status = new.status,
      last_message_at = event_at,
      updated_at = greatest(updated_at, event_at)
  where id = new.conversation_id
    and (last_message_at is null or event_at >= last_message_at);

  return new;
end;
$$;

drop trigger if exists whatsapp_messages_sync_conversation_last on public.whatsapp_messages;
create trigger whatsapp_messages_sync_conversation_last
after insert or update of body, type, direction, status, sent_at, conversation_id
on public.whatsapp_messages
for each row
execute function public.sync_whatsapp_conversation_last_message();

with latest as (
  select distinct on (conversation_id)
    conversation_id,
    id,
    body,
    type,
    direction,
    status,
    coalesce(sent_at, created_at) as event_at
  from public.whatsapp_messages
  where conversation_id is not null
  order by conversation_id, coalesce(sent_at, created_at) desc, created_at desc
)
update public.whatsapp_conversations c
set last_message_id = latest.id,
    last_message_body = latest.body,
    last_message_type = latest.type,
    last_message_direction = latest.direction,
    last_message_status = latest.status,
    last_message_at = latest.event_at,
    updated_at = greatest(c.updated_at, latest.event_at)
from latest
where c.id = latest.conversation_id;
