-- BOSSA CRM — libera a biblioteca de arquivos da IA para administradores e comercial
-- Execute depois de 003_arquivos_ia.sql.

begin;

-- Tabela: administradores e usuários comerciais podem consultar e administrar a biblioteca.
drop policy if exists ai_files_select_admin on public.ai_files;
drop policy if exists ai_files_insert_admin on public.ai_files;
drop policy if exists ai_files_update_admin on public.ai_files;
drop policy if exists ai_files_delete_admin on public.ai_files;
drop policy if exists ai_files_select_commercial on public.ai_files;
drop policy if exists ai_files_insert_commercial on public.ai_files;
drop policy if exists ai_files_update_commercial on public.ai_files;
drop policy if exists ai_files_delete_commercial on public.ai_files;

create policy ai_files_select_commercial
  on public.ai_files for select to authenticated
  using (private.can_edit_org(organization_id));

create policy ai_files_insert_commercial
  on public.ai_files for insert to authenticated
  with check (private.can_edit_org(organization_id));

create policy ai_files_update_commercial
  on public.ai_files for update to authenticated
  using (private.can_edit_org(organization_id))
  with check (private.can_edit_org(organization_id));

create policy ai_files_delete_commercial
  on public.ai_files for delete to authenticated
  using (private.can_edit_org(organization_id));

-- Storage privado: mantém o isolamento por organização e libera CRUD para admin/comercial.
drop policy if exists ai_files_storage_select_admin on storage.objects;
drop policy if exists ai_files_storage_insert_admin on storage.objects;
drop policy if exists ai_files_storage_update_admin on storage.objects;
drop policy if exists ai_files_storage_delete_admin on storage.objects;
drop policy if exists ai_files_storage_select_commercial on storage.objects;
drop policy if exists ai_files_storage_insert_commercial on storage.objects;
drop policy if exists ai_files_storage_update_commercial on storage.objects;
drop policy if exists ai_files_storage_delete_commercial on storage.objects;

create policy ai_files_storage_select_commercial
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ai-files'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  );

create policy ai_files_storage_insert_commercial
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ai-files'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  );

create policy ai_files_storage_update_commercial
  on storage.objects for update to authenticated
  using (
    bucket_id = 'ai-files'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'ai-files'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  );

create policy ai_files_storage_delete_commercial
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ai-files'
    and private.can_edit_org(((storage.foldername(name))[1])::uuid)
  );

commit;
