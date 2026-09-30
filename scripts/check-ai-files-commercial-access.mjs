import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tabs = readFileSync('src/components/WorkspaceTabs.tsx', 'utf8');
const nara = readFileSync('src/app/(crm)/nara/page.tsx', 'utf8');
const page = readFileSync('src/app/(crm)/configuracoes/arquivos-ia/page.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/021_ai_files_commercial_access.sql', 'utf8');

const aiFilesMenu = tabs.match(/\{ href: "\/configuracoes\/arquivos-ia"[^\n]+/u)?.[0] ?? '';
assert.match(aiFilesMenu, /edit: true/, 'Materiais deve exigir permissão de edição.');
assert.doesNotMatch(aiFilesMenu, /admin: true/, 'Materiais deve aceitar o perfil comercial.');
assert.match(tabs, /"edit" in i && i.edit && role === "viewer"/, 'Viewer não deve receber acesso aos materiais.');
assert.match(nara, /context.role === "viewer"\) redirect/, 'A área Nara deve impedir acesso de viewer.');
assert.match(nara, /href: "\/configuracoes\/arquivos-ia"/, 'A área Nara deve oferecer acesso aos materiais.');

assert.match(
  page,
  /!\['admin', 'comercial'\]\.includes\(membership\.role\)/,
  'A tela deve aceitar usuários admin e comercial.',
);
assert.doesNotMatch(
  page,
  /membership\.role !== 'admin'/,
  'A tela não pode continuar restrita somente a administradores.',
);

const canEditOccurrences = migration.match(/private\.can_edit_org/g) ?? [];
assert.ok(
  canEditOccurrences.length >= 8,
  'As políticas da tabela e do storage devem usar private.can_edit_org.',
);
assert.match(migration, /drop policy if exists ai_files_select_admin/);
assert.match(migration, /drop policy if exists ai_files_storage_select_admin/);
assert.doesNotMatch(
  migration,
  /private\.is_org_admin/,
  'A migration nova não deve manter a autorização exclusiva de administrador.',
);

console.log('Acesso comercial aos Arquivos da IA validado.');
