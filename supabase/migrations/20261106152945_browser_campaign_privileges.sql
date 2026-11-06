-- Reforço de privilégios para projetos com DEFAULT PRIVILEGES amplos no schema
-- public. Também corrige bancos de homologação que receberam a primeira versão.
begin;

revoke all on public.browser_campaigns, public.browser_campaign_recipients,
  public.browser_campaign_events, public.browser_sender_locks
  from public, anon, authenticated;

grant select on public.browser_campaigns, public.browser_campaign_recipients,
  public.browser_campaign_events to authenticated;

revoke all on function public.browser_campaign_claim(uuid,uuid) from public, anon, authenticated;
revoke all on function public.browser_campaign_release_sender(uuid) from public, anon, authenticated;
revoke all on function public.browser_campaign_heartbeat(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.browser_campaign_ack(uuid,uuid,uuid,integer,text,text) from public, anon, authenticated;

grant execute on function public.browser_campaign_claim(uuid,uuid),
  public.browser_campaign_release_sender(uuid),
  public.browser_campaign_heartbeat(uuid,uuid,uuid),
  public.browser_campaign_ack(uuid,uuid,uuid,integer,text,text) to authenticated;

commit;
