-- Read-only diagnostic, intended for a sanitized full-schema preview first.
-- Counts only; it neither exposes personal rows nor repairs existing records.
with violations as (
 select 'proposals' relation,p.id,'product_or_contact_scope' reason from public.proposals p
 where (p.lead_id is not null and not exists(select 1 from public.leads l where l.organization_id=p.organization_id and l.id=p.lead_id))
  or not exists(select 1 from public.developments d where d.organization_id=p.organization_id and d.id=p.development_id)
  or (p.unit_id is not null and not exists(select 1 from public.development_units u where u.organization_id=p.organization_id and u.id=p.unit_id and u.development_id=p.development_id))
  or (p.opportunity_id is not null and not exists(select 1 from public.commercial_opportunities o where o.organization_id=p.organization_id and o.id=p.opportunity_id))
 union all
 select 'proposals',p.id,'team_membership' from public.proposals p where
  (p.created_by is not null and not exists(select 1 from public.memberships m where m.organization_id=p.organization_id and m.user_id=p.created_by))
  or (p.updated_by is not null and not exists(select 1 from public.memberships m where m.organization_id=p.organization_id and m.user_id=p.updated_by))
 union all
 select 'proposal_payment_items',i.id,'parent_scope' from public.proposal_payment_items i
 where not exists(select 1 from public.proposals p where p.organization_id=i.organization_id and p.id=i.proposal_id)
 union all
 select 'agenda_events',a.id,'contact_or_opportunity_scope' from public.agenda_events a where
  (a.lead_id is not null and not exists(select 1 from public.leads l where l.organization_id=a.organization_id and l.id=a.lead_id))
  or (a.opportunity_id is not null and not exists(select 1 from public.commercial_opportunities o where o.organization_id=a.organization_id and o.id=a.opportunity_id))
 union all
 select 'agenda_events',a.id,'team_membership' from public.agenda_events a where
  (a.created_by is not null and not exists(select 1 from public.memberships m where m.organization_id=a.organization_id and m.user_id=a.created_by))
  or (a.assigned_to is not null and not exists(select 1 from public.memberships m where m.organization_id=a.organization_id and m.user_id=a.assigned_to))
)
select relation,reason,count(*) violations from violations group by relation,reason order by relation,reason;
