import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');
const page = readFileSync('src/app/(crm)/configuracoes/arquivos-ia/page.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/021_ai_files_commercial_access.sql', 'utf8');

assert.match(
  sidebar,
  /href: '\/configuracoes\/arquivos-ia'[\s\S]*roles: \['admin', 'comercial'\]/,
  'O menu Arquivos da IA deve ser visível para admin e comercial.',
);

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
