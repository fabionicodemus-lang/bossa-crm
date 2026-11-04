-- H2.3B candidate only. Install solely after independent Work review.
-- No historical migration, existing table policy, Auth grant or managed role changes.
-- Reference rows and receipts must be supplied by the independent operator, never by app/service_role.
begin;
do $install$
begin
 if to_regprocedure('public.bossa_homologation_preflight()') is not null
    or to_regnamespace('bossa_preflight') is not null then
  raise exception 'PREFLIGHT_INSTALLATION_REQUIRES_REVIEW';
 end if;
 if not exists(select 1 from pg_catalog.pg_roles where rolname='bossa_preflight_owner') then
  create role bossa_preflight_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
 end if;
 if exists(select 1 from pg_catalog.pg_roles where rolname='bossa_preflight_owner'
   and (rolcanlogin or rolinherit or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls))
   or exists(select 1 from pg_catalog.pg_auth_members where member='bossa_preflight_owner'::regrole) then
  raise exception 'UNSAFE_PREFLIGHT_OWNER';
 end if;
 -- Ownership transfer needs SET on the narrow role and CREATE for that role on
 -- public. The operator provisions SET separately; never inherit a broad role.
 if not pg_catalog.pg_has_role(current_user,'bossa_preflight_owner','SET')
    or not pg_catalog.has_schema_privilege(current_user,'public','CREATE WITH GRANT OPTION') then
  raise exception 'PREFLIGHT_OWNER_ASSIGNMENT_REQUIRES_OPERATOR';
 end if;
 if pg_catalog.has_schema_privilege('bossa_preflight_owner','public','CREATE') then
  raise exception 'PREFLIGHT_OWNER_HAS_UNREVIEWED_CREATE';
 end if;
 grant create on schema public to bossa_preflight_owner;
end $install$;
create schema bossa_preflight;
revoke all on schema bossa_preflight from public,anon,authenticated,service_role;
grant usage on schema bossa_preflight to bossa_preflight_owner;
create table bossa_preflight.reference (
 singleton boolean primary key default true check(singleton), environment_id uuid not null,
 project_ref text not null check(project_ref='okhtfibuexfsgkobjxtu'),
 catalog_fingerprint text not null check(catalog_fingerprint ~ '^[a-f0-9]{32}$'),
 migrations jsonb not null check(jsonb_typeof(migrations)='array' and jsonb_array_length(migrations)=22),
 users jsonb not null check(jsonb_typeof(users)='array' and jsonb_array_length(users)=7),
 empty_relations jsonb not null check(jsonb_typeof(empty_relations)='array' and jsonb_array_length(empty_relations)>0),
 rpc_body_md5 text not null check(rpc_body_md5 ~ '^[a-f0-9]{32}$'),
 fingerprint_body_md5 text not null check(fingerprint_body_md5 ~ '^[a-f0-9]{32}$')
);
create table bossa_preflight.receipt (
 singleton boolean primary key default true check(singleton), payload text not null,
 signature text not null, revoked_at timestamptz
);
revoke all on all tables in schema bossa_preflight from public,anon,authenticated,service_role,bossa_preflight_owner;
grant select on bossa_preflight.reference,bossa_preflight.receipt to bossa_preflight_owner;

-- Catalog-only fingerprint: definitions, owners, modes, arguments, defaults, ACLs,
-- columns, constraints, indexes, policies and trigger enablement. No business/Auth row access.
create function bossa_preflight.catalog_fingerprint() returns text
language sql stable security invoker set search_path=pg_catalog as $fingerprint$
select pg_catalog.md5(pg_catalog.jsonb_build_object(
 'schema',(select jsonb_build_object('owner',nspowner::regrole::text,'acl',nspacl::text) from pg_namespace where nspname='public'),
 'functions',(select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
  'body',md5(p.prosrc),'owner',p.proowner::regrole::text,'definer',p.prosecdef,'volatility',p.provolatile,
  'path',p.proconfig,'acl',p.proacl::text,'args',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid)) order by p.oid::regprocedure::text),'[]'::jsonb)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname<>'bossa_homologation_preflight'
  and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
 'relations',(select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',c.relowner::regrole::text,
  'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text) order by c.relname),'[]'::jsonb)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S')),
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
  'notnull',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(ad.adbin,ad.adrelid)) order by c.relname,a.attnum),'[]'::jsonb)
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
  left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum where n.nspname='public' and a.attnum>0 and not a.attisdropped),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname),'[]'::jsonb) from pg_policies p where p.schemaname='public'),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,
  'definition',pg_get_triggerdef(t.oid)) order by c.relname,t.tgname),'[]'::jsonb)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'validated',k.convalidated,
  'definition',pg_get_constraintdef(k.oid)) order by c.relname,k.conname),'[]'::jsonb)
  from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',i.indexrelid::regclass::text,
  'valid',i.indisvalid,'ready',i.indisready,'definition',pg_get_indexdef(i.indexrelid)) order by c.relname,i.indexrelid::regclass::text),'[]'::jsonb)
  from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
 'defaults',(select coalesce(jsonb_agg(to_jsonb(d) order by d.oid),'[]'::jsonb) from pg_default_acl d where d.defaclnamespace='public'::regnamespace)
)::text)
$fingerprint$;
revoke all on function bossa_preflight.catalog_fingerprint() from public,anon,authenticated,service_role;
grant execute on function bossa_preflight.catalog_fingerprint() to bossa_preflight_owner;

create function public.bossa_homologation_preflight() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $preflight$
declare ref bossa_preflight.reference%rowtype; stored bossa_preflight.receipt%rowtype;
 envelope jsonb; auth_audit jsonb; db_audit jsonb; at timestamptz:=statement_timestamp();
 fresh boolean:=false; catalog_ok boolean:=false; owner_ok boolean:=false;
 auth_ok boolean:=false; roles_ok boolean:=false; schema_ok boolean:=false;
 permissions_ok boolean:=false; service_ok boolean:=false; external_ok boolean:=false;
 controls_ok boolean:=false; normalized_users jsonb; normalized_memberships jsonb; normalized_empty jsonb;
 rpc pg_proc%rowtype; fingerprint_rpc pg_proc%rowtype; returned_receipt jsonb:=null;
begin
 select * into ref from bossa_preflight.reference where singleton;
 select * into stored from bossa_preflight.receipt where singleton;
 if ref.environment_id is not null and stored.payload is not null and stored.revoked_at is null then
  envelope:=stored.payload::jsonb; auth_audit:=envelope->'authAudit'; db_audit:=envelope->'databaseAudit';
  fresh:=stored.signature ~ '^[A-Za-z0-9_-]{86}$' and envelope->>'contractVersion'='2' and envelope->>'environmentId'=ref.environment_id::text
   and envelope->>'supabaseProjectRef'=ref.project_ref
   and (envelope->>'issuedAt')::timestamptz<=at+interval '5 seconds'
   and (envelope->>'expiresAt')::timestamptz>at
   and (envelope->>'expiresAt')::timestamptz>(envelope->>'issuedAt')::timestamptz
   and (envelope->>'expiresAt')::timestamptz-(envelope->>'issuedAt')::timestamptz<=interval '24 hours'
   and auth_audit->>'source'='supabase-auth-admin-api' and auth_audit->>'supabaseProjectRef'=ref.project_ref
   and db_audit->>'source'='supabase-reviewed-sql-read'
   and not exists(select 1 from jsonb_array_elements(jsonb_build_array(auth_audit,db_audit)) a
    where a->>'observedAt' is null or a->>'expiresAt' is null
     or (a->>'observedAt')::timestamptz>at+interval '5 seconds' or (a->>'expiresAt')::timestamptz<=at
     or (a->>'expiresAt')::timestamptz<=(a->>'observedAt')::timestamptz
     or (a->>'expiresAt')::timestamptz-(a->>'observedAt')::timestamptz>interval '15 minutes');
  if fresh then
   returned_receipt:=jsonb_build_object('payload',rtrim(translate(replace(encode(convert_to(stored.payload,'UTF8'),'base64'),E'\n',''),'+/','-_'),'='),'signature',stored.signature);
  end if;
 end if;
 catalog_ok:=ref.catalog_fingerprint=bossa_preflight.catalog_fingerprint();
 select * into rpc from pg_proc where oid='public.bossa_homologation_preflight()'::regprocedure;
 select * into fingerprint_rpc from pg_proc where oid='bossa_preflight.catalog_fingerprint()'::regprocedure;
 owner_ok:=exists(select 1 from pg_roles where oid=rpc.proowner and rolname='bossa_preflight_owner'
  and not (rolcanlogin or rolinherit or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls))
  and not exists(select 1 from pg_auth_members where member=rpc.proowner);
 owner_ok:=owner_ok and not pg_has_role('anon',rpc.proowner,'MEMBER')
  and not pg_has_role('authenticated',rpc.proowner,'MEMBER') and not pg_has_role('service_role',rpc.proowner,'MEMBER');
 permissions_ok:=catalog_ok and owner_ok and rpc.prosecdef and rpc.provolatile='s'
  and rpc.proconfig=array['search_path=pg_catalog']::text[] and md5(rpc.prosrc)=ref.rpc_body_md5
  and md5(fingerprint_rpc.prosrc)=ref.fingerprint_body_md5 and not fingerprint_rpc.prosecdef and fingerprint_rpc.provolatile='s'
  and fingerprint_rpc.proconfig=array['search_path=pg_catalog']::text[]
  and not exists(select 1 from aclexplode(coalesce(rpc.proacl,acldefault('f',rpc.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
  and not has_function_privilege('anon',rpc.oid,'EXECUTE') and not has_function_privilege('authenticated',rpc.oid,'EXECUTE')
  and has_function_privilege('service_role',rpc.oid,'EXECUTE')
  and not has_table_privilege('service_role','bossa_preflight.receipt','INSERT,UPDATE,DELETE,TRUNCATE')
  and not has_table_privilege('service_role','bossa_preflight.reference','INSERT,UPDATE,DELETE,TRUNCATE')
  and not has_table_privilege('bossa_preflight_owner','bossa_preflight.receipt','INSERT,UPDATE,DELETE,TRUNCATE')
  and not has_table_privilege('bossa_preflight_owner','bossa_preflight.reference','INSERT,UPDATE,DELETE,TRUNCATE')
  and not has_any_column_privilege('service_role','bossa_preflight.receipt','INSERT,UPDATE')
  and not has_any_column_privilege('service_role','bossa_preflight.reference','INSERT,UPDATE')
  and not has_any_column_privilege('bossa_preflight_owner','bossa_preflight.receipt','INSERT,UPDATE')
  and not has_any_column_privilege('bossa_preflight_owner','bossa_preflight.reference','INSERT,UPDATE')
  and (select relowner<>rpc.proowner from pg_class where oid='bossa_preflight.receipt'::regclass)
  and (select relowner<>rpc.proowner from pg_class where oid='bossa_preflight.reference'::regclass)
  and not exists(select 1 from pg_namespace where nspname='auth' and has_schema_privilege('bossa_preflight_owner',oid,'USAGE'))
  and not has_schema_privilege('bossa_preflight_owner','public','CREATE')
  and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p') and
    (has_table_privilege('bossa_preflight_owner',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
     or has_any_column_privilege('bossa_preflight_owner',c.oid,'INSERT,UPDATE')));
 service_ok:=permissions_ok and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.oid<>rpc.oid and has_function_privilege('service_role',p.oid,'EXECUTE')
  and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'));
 if fresh then
  select jsonb_agg(jsonb_build_object('id',u->>'id','email',u->>'email','organizationId',u->>'organizationId','appRole',u->>'appRole') order by u->>'id')
   into normalized_users from jsonb_array_elements(auth_audit->'users') u;
  auth_ok:=jsonb_array_length(auth_audit->'users')=7 and auth_audit->'paginationComplete'='true'::jsonb
   and normalized_users=ref.users and not exists(select 1 from jsonb_array_elements(auth_audit->'users') u
    where u->>'email' !~ '^[^[:space:]@]+@bossa-homolog[.]invalid$' or u->>'authRole' is distinct from 'authenticated'
     or u->'isAnonymous' is distinct from 'false'::jsonb or u->'deletedAt' is distinct from 'null'::jsonb
     or u->'bannedUntil' is distinct from 'null'::jsonb or u->>'emailConfirmedAt' is null
     or (u->>'emailConfirmedAt')::timestamptz>(auth_audit->>'observedAt')::timestamptz);
  select jsonb_agg(jsonb_build_object('id',u->>'id','organizationId',u->>'organizationId','appRole',u->>'appRole') order by u->>'id')
   into normalized_memberships from jsonb_array_elements(auth_audit->'users') u;
  roles_ok:=auth_ok and normalized_memberships=db_audit->'memberships'
   and (select count(distinct u->>'organizationId')=2 from jsonb_array_elements(auth_audit->'users') u)
   and not exists(select 1 from jsonb_array_elements(auth_audit->'users') u
    where u->>'appRole' not in ('admin','comercial','viewer') or exists(
     select 1 from jsonb_array_elements(jsonb_build_array(u->'loginVerifiedAt',u->'getUserVerifiedAt',u->'logoutVerifiedAt')) stamp
     where stamp='null'::jsonb or (stamp#>>'{}')::timestamptz>(auth_audit->>'observedAt')::timestamptz
      or (auth_audit->>'observedAt')::timestamptz-(stamp#>>'{}')::timestamptz>interval '15 minutes'))
   and not exists(select 1 from jsonb_array_elements(auth_audit->'users') u group by u->>'organizationId' having count(distinct u->>'appRole')<>3);
  schema_ok:=catalog_ok and db_audit->>'catalogFingerprint'=ref.catalog_fingerprint and db_audit->'migrations'=ref.migrations;
  controls_ok:=not exists(select 1 from unnest(array['networkEgressRestricted','externalIntegrationsDisabled','cronDisabled','webhooksDisabled','authEmailDisabled','functionsDisabled','storageEffectsDisabled']) k
   where envelope->'checks'->k is distinct from 'true'::jsonb);
  select jsonb_agg(e->>'name' order by e->>'name') into normalized_empty from jsonb_array_elements(db_audit->'emptyRelations') e;
  external_ok:=schema_ok and service_ok and controls_ok and normalized_empty=ref.empty_relations
   and not exists(select 1 from jsonb_array_elements(db_audit->'emptyRelations') e where e->'count' is distinct from '0'::jsonb)
   and not exists(select 1 from pg_namespace where nspname in ('cron','net'));
 end if;
 return jsonb_build_object('contractVersion',2,'environmentId',ref.environment_id,'supabaseProjectRef',ref.project_ref,'checkedAt',at,
  'schemaReady',coalesce(schema_ok,false),'syntheticUsersOnly',coalesce(auth_ok,false),'requiredRolesReady',coalesce(roles_ok,false),
  'permissionsSafe',coalesce(permissions_ok,false),'guardsIntact',coalesce(catalog_ok,false),'serviceRoleGuardsIntact',coalesce(service_ok,false),
  'zeroExternalEffects',coalesce(external_ok,false),'authEmailBlocked',coalesce(catalog_ok and controls_ok and fresh,false),'platformAttestation',returned_receipt);
exception when others then
 return jsonb_build_object('contractVersion',2,'environmentId',null,'supabaseProjectRef',null,'checkedAt',at,
  'schemaReady',false,'syntheticUsersOnly',false,'requiredRolesReady',false,'permissionsSafe',false,'guardsIntact',false,
  'serviceRoleGuardsIntact',false,'zeroExternalEffects',false,'authEmailBlocked',false,'platformAttestation',null);
end $preflight$;
alter function public.bossa_homologation_preflight() owner to bossa_preflight_owner;
revoke create on schema public from bossa_preflight_owner;
revoke all on function public.bossa_homologation_preflight() from public,anon,authenticated;
grant execute on function public.bossa_homologation_preflight() to service_role;
-- No bootstrap approval data. Empty private tables yield a blocked response.
commit;
