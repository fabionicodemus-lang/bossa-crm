-- Local PostgreSQL adapter only. These objects are NOT a Supabase schema dump.
-- Business tables, policies, constraints and triggers come from repository SQL.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
create function auth.role() returns text language sql stable as $$
 select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'
$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
 select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]
$$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
grant execute on all functions in schema auth,storage to anon,authenticated,service_role;
-- Models server access to public relations. No authenticated grants are added
-- to bypass the grants and RLS declared by the application's own migrations.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
create publication supabase_realtime;
