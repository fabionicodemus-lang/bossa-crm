-- Se o clique no WhatsApp tiver resultado incerto, nenhum outro computador
-- deve reservar este número até o operador revisar a sessão interrompida.
begin;

create function private.browser_campaign_hold_uncertain()
returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.browser_sender_locks
    set requires_review = true
    where organization_id = new.organization_id
      and campaign_id = new.campaign_id
      and recipient_id = new.id;
  return new;
end;
$$;

revoke all on function private.browser_campaign_hold_uncertain() from public, anon, authenticated;

create trigger browser_campaign_hold_uncertain
  after update of status on public.browser_campaign_recipients
  for each row
  when (new.status = 'uncertain' and old.status is distinct from 'uncertain')
  execute function private.browser_campaign_hold_uncertain();

commit;
