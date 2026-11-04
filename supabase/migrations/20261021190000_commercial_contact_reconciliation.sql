-- Explicit, non-destructive identity review. Historical foreign keys and snapshots stay on their original contacts.
begin;
create table public.commercial_contact_reconciliations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 contact_low_id uuid not null references public.leads(id),
 contact_high_id uuid not null references public.leads(id),
 preferred_contact_id uuid not null references public.leads(id),
 proposed_by uuid not null,
 proposed_at timestamptz not null default now(),
 proposal_reason text not null check (length(trim(proposal_reason)) between 20 and 2000),
 evidence_reference text not null check (length(trim(evidence_reference)) between 8 and 500),
 contact_snapshot jsonb not null,
 status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
 reviewed_by uuid,
 reviewed_at timestamptz,
 review_reason text,
 constraint commercial_reconciliation_order check(contact_low_id < contact_high_id),
 constraint commercial_reconciliation_preferred check(preferred_contact_id in (contact_low_id,contact_high_id)),
 constraint commercial_reconciliation_review check (
   (status='pending' and reviewed_by is null and reviewed_at is null and review_reason is null)
   or (status<>'pending' and reviewed_by is not null and reviewed_at is not null and length(trim(review_reason))>=20)),
 unique(organization_id,contact_low_id,contact_high_id)
);
create index commercial_reconciliation_queue on public.commercial_contact_reconciliations(organization_id,status,proposed_at);
create unique index commercial_reconciliation_one_confirmed_alias on public.commercial_contact_reconciliations(organization_id,contact_low_id)
 where status='confirmed' and preferred_contact_id=contact_high_id;
create unique index commercial_reconciliation_one_confirmed_reverse on public.commercial_contact_reconciliations(organization_id,contact_high_id)
 where status='confirmed' and preferred_contact_id=contact_low_id;
alter table public.commercial_contact_reconciliations enable row level security;
revoke all on public.commercial_contact_reconciliations from public,anon,authenticated,service_role;
grant select on public.commercial_contact_reconciliations to authenticated,service_role;
create policy commercial_reconciliation_read on public.commercial_contact_reconciliations for select to authenticated
 using(private.is_org_member(organization_id));

-- Both identities remain protected even if the only initial history belonged to one contact.
create or replace function public.commercial_contact_has_history(p_org uuid,p_contact uuid) returns boolean
language sql stable security invoker set search_path=public as $$
 select p_contact is not null and (
  exists(select 1 from public.commercial_contact_reconciliations r where r.organization_id=p_org
   and p_contact in (r.contact_low_id,r.contact_high_id))
  or exists(select 1 from public.commercial_opportunities o where o.organization_id=p_org and (o.primary_contact_id=p_contact or o.broker_id=p_contact))
  or exists(select 1 from public.commercial_participants p where p.organization_id=p_org and p.contact_id=p_contact)
  or exists(select 1 from public.commercial_link_reviews r where r.organization_id=p_org and r.contact_id=p_contact)
  or exists(select 1 from public.commercial_intent_confirmations c where c.organization_id=p_org and
    (c.buyer_id=p_contact or public.commercial_snapshot_has_contact(c.source_snapshot,p_contact)))
  or exists(select 1 from public.commercial_conversation_reviews r where r.organization_id=p_org and r.lead_id=p_contact)
  or exists(select 1 from public.proposals p where p.organization_id=p_org and p.lead_id=p_contact and p.opportunity_id is not null)
  or exists(select 1 from public.agenda_events a where a.organization_id=p_org and a.lead_id=p_contact and a.opportunity_id is not null)
  or exists(select 1 from public.commercial_events e where e.organization_id=p_org and
    (public.commercial_snapshot_has_contact(e.previous_state,p_contact) or public.commercial_snapshot_has_contact(e.new_state,p_contact)))
  or exists(select 1 from public.commercial_proposal_versions v where v.organization_id=p_org and public.commercial_snapshot_has_contact(v.snapshot,p_contact))
 );
$$;

-- SECURITY DEFINER is confined to these two write gates: authenticated has no direct
-- INSERT/UPDATE on the audit table. Both gates check auth.uid(), membership and
-- organization before touching contacts; only authenticated receives EXECUTE.
-- pg_catalog precedes public and pg_temp is last to avoid search-path shadowing.
create function public.commercial_propose_contact_reconciliation(
 p_org uuid,p_first uuid,p_second uuid,p_preferred uuid,p_reason text,p_evidence text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare a public.leads%rowtype; b public.leads%rowtype; v_id uuid; existing public.commercial_contact_reconciliations%rowtype;
begin
 if auth.uid() is null or not private.can_edit_org(p_org) then raise exception 'COMMERCIAL_RECONCILIATION_FORBIDDEN' using errcode='42501'; end if;
 if p_first is null or p_second is null or p_first=p_second or p_preferred not in (p_first,p_second)
    or length(trim(coalesce(p_reason,''))) not between 20 and 2000 or length(trim(coalesce(p_evidence,''))) not between 8 and 500 then
  raise exception 'COMMERCIAL_RECONCILIATION_INVALID' using errcode='22023'; end if;
 -- Identical lock order for either request direction; validation happens under these locks.
 perform l.id from public.leads l where l.organization_id=p_org and l.id in (p_first,p_second) order by l.id for update;
 select * into a from public.leads where id=least(p_first,p_second) and organization_id=p_org;
 select * into b from public.leads where id=greatest(p_first,p_second) and organization_id=p_org;
 if a.id is null or b.id is null or a.kind<>'cliente' or b.kind<>'cliente'
    or a.archived_at is not null or b.archived_at is not null
    or (a.metadata->>'merged_into') is not null or (b.metadata->>'merged_into') is not null then
  raise exception 'COMMERCIAL_RECONCILIATION_CONTACT_UNAVAILABLE' using errcode='23514'; end if;
 if not (public.commercial_contact_has_history(p_org,a.id) or public.commercial_contact_has_history(p_org,b.id)) then
  raise exception 'COMMERCIAL_RECONCILIATION_NO_HISTORY' using errcode='23514'; end if;
 select * into existing from public.commercial_contact_reconciliations
  where organization_id=p_org and contact_low_id=a.id and contact_high_id=b.id;
 if existing.id is not null then
  if existing.preferred_contact_id=p_preferred and existing.proposed_by=auth.uid()
     and existing.proposal_reason=trim(p_reason) and existing.evidence_reference=trim(p_evidence) then
   return jsonb_build_object('id',existing.id,'status',existing.status,'idempotent',true); end if;
  raise exception 'COMMERCIAL_RECONCILIATION_EXISTS' using errcode='23505';
 end if;
 insert into public.commercial_contact_reconciliations(organization_id,contact_low_id,contact_high_id,preferred_contact_id,
  proposed_by,proposal_reason,evidence_reference,contact_snapshot)
 values(p_org,a.id,b.id,p_preferred,auth.uid(),trim(p_reason),trim(p_evidence),
  jsonb_build_object('first',jsonb_build_object('id',a.id,'name',a.name,'phone',a.phone,'kind',a.kind),
                     'second',jsonb_build_object('id',b.id,'name',b.name,'phone',b.phone,'kind',b.kind))) returning id into v_id;
 return jsonb_build_object('id',v_id,'status','pending','idempotent',false);
end; $$;

create function public.commercial_review_contact_reconciliation(p_org uuid,p_id uuid,p_confirm boolean,p_reason text)
 returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.commercial_contact_reconciliations%rowtype; a public.leads%rowtype; b public.leads%rowtype;
begin
 if auth.uid() is null or not private.is_org_admin(p_org) then raise exception 'COMMERCIAL_RECONCILIATION_FORBIDDEN' using errcode='42501'; end if;
 if p_confirm is null or length(trim(coalesce(p_reason,''))) not between 20 and 2000 then
  raise exception 'COMMERCIAL_RECONCILIATION_INVALID' using errcode='22023'; end if;
 -- Contact locks first, then review row, matching proposal lock order.
 select * into r from public.commercial_contact_reconciliations where id=p_id and organization_id=p_org;
 if r.id is null then raise exception 'COMMERCIAL_RECONCILIATION_NOT_FOUND' using errcode='P0002'; end if;
 perform l.id from public.leads l where l.organization_id=p_org and l.id in (r.contact_low_id,r.contact_high_id) order by l.id for update;
 select * into r from public.commercial_contact_reconciliations where id=p_id and organization_id=p_org for update;
 if r.status<>'pending' then
  if r.reviewed_by=auth.uid() and r.review_reason=trim(p_reason) and (r.status='confirmed')=p_confirm then
   return jsonb_build_object('id',r.id,'status',r.status,'idempotent',true); end if;
  raise exception 'COMMERCIAL_RECONCILIATION_ALREADY_REVIEWED' using errcode='23505';
 end if;
 if r.proposed_by=auth.uid() then raise exception 'COMMERCIAL_RECONCILIATION_SELF_REVIEW' using errcode='42501'; end if;
 select * into a from public.leads where id=r.contact_low_id and organization_id=p_org;
 select * into b from public.leads where id=r.contact_high_id and organization_id=p_org;
 if p_confirm and (a.id is null or b.id is null or a.kind<>'cliente' or b.kind<>'cliente'
    or a.archived_at is not null or b.archived_at is not null
    or (a.metadata->>'merged_into') is not null or (b.metadata->>'merged_into') is not null) then
  raise exception 'COMMERCIAL_RECONCILIATION_CONTACT_UNAVAILABLE' using errcode='23514'; end if;
 if p_confirm and (exists(select 1 from public.commercial_contact_reconciliations x where x.organization_id=p_org
   and x.status='confirmed' and x.id<>r.id and (r.contact_low_id in (x.contact_low_id,x.contact_high_id)
     or r.contact_high_id in (x.contact_low_id,x.contact_high_id)))) then
  raise exception 'COMMERCIAL_RECONCILIATION_CONFLICT' using errcode='23505'; end if;
 update public.commercial_contact_reconciliations set status=case when p_confirm then 'confirmed' else 'rejected' end,
  reviewed_by=auth.uid(),reviewed_at=now(),review_reason=trim(p_reason) where id=r.id;
 return jsonb_build_object('id',r.id,'status',case when p_confirm then 'confirmed' else 'rejected' end,'idempotent',false);
end; $$;

-- A confirmed relation is an alias for review only. No source rows or ledger facts are rewritten or counted twice.
revoke all on function public.commercial_propose_contact_reconciliation(uuid,uuid,uuid,uuid,text,text),
 public.commercial_review_contact_reconciliation(uuid,uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.commercial_propose_contact_reconciliation(uuid,uuid,uuid,uuid,text,text),
 public.commercial_review_contact_reconciliation(uuid,uuid,boolean,text) to authenticated;
commit;
