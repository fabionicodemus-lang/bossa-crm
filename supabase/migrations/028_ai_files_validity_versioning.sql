alter table public.ai_files
  add column if not exists valid_from timestamptz,
  add column if not exists valid_until timestamptz,
  add column if not exists version_label text,
  add column if not exists content_group text;

create index if not exists ai_files_active_validity_idx
  on public.ai_files (organization_id, active, valid_until, updated_at desc);

comment on column public.ai_files.valid_from is 'Optional date/time from which the AI may use this file.';
comment on column public.ai_files.valid_until is 'Optional expiry date/time after which the AI must not use this file.';
comment on column public.ai_files.version_label is 'Human-readable version label for commercial material.';
comment on column public.ai_files.content_group is 'Optional logical group used to keep only the newest valid version in AI context.';
