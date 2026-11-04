import fs from 'node:fs';
import crypto from 'node:crypto';

export const repositoryMigrationRoot = new URL('../../../supabase/migrations/', import.meta.url);
export const hash = text => crypto.createHash('sha256').update(text).digest('hex');
export const migrationFiles = () => fs.readdirSync(repositoryMigrationRoot).filter(n => n.endsWith('.sql')).sort();
export const commercialFiles = () => migrationFiles().filter(n => /^\d{14}_commercial_/.test(n));

// Split only top-level statements: function bodies, nested comments and quoted
// strings must remain byte-for-byte intact. No business DDL is synthesized.
export function statements(source) {
  const result = [];
  let start = 0, i = 0, quote = null, dollar = null, comment = 0, lineComment = false;
  while (i < source.length) {
    const c = source[i], next = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; i++; continue; }
    if (comment) {
      if (c === '/' && next === '*') { comment++; i += 2; }
      else if (c === '*' && next === '/') { comment--; i += 2; } else i++;
      continue;
    }
    if (dollar) { if (source.startsWith(dollar, i)) { i += dollar.length; dollar = null; } else i++; continue; }
    if (quote) {
      if (c === quote && next === quote) { i += 2; continue; }
      if (c === quote) quote = null;
      i++; continue;
    }
    if (c === '-' && next === '-') { lineComment = true; i += 2; continue; }
    if (c === '/' && next === '*') { comment = 1; i += 2; continue; }
    if (c === "'" || c === '"') { quote = c; i++; continue; }
    if (c === '$') {
      const tag = source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
      if (tag) { dollar = tag; i += tag.length; continue; }
    }
    if (c === ';') { result.push({text: source.slice(start, i + 1), line: source.slice(0, start).split('\n').length}); start = i + 1; }
    i++;
  }
  if (quote || dollar || comment) throw Error('Unclosed SQL token');
  if (source.slice(start).trim()) result.push({text: source.slice(start), line: source.slice(0, start).split('\n').length});
  return result;
}

const uncommentStart = text => text.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '').trim();
export function legacySchema(file) {
  const source = fs.readFileSync(new URL(file, repositoryMigrationRoot), 'utf8');
  const skipped = [], kept = [];
  for (const statement of statements(source)) {
    const sql = uncommentStart(statement.text);
    if (!sql) continue;
    let reason;
    if (/^(insert|update|delete|with)\b/i.test(sql)) reason = 'legacy-data-or-backfill';
    else if (/^select\b/i.test(sql)) reason = 'operational-select-or-scheduling';
    else if (/^do\b/i.test(sql) && /\b(vault\.|cron\.)/i.test(sql)) reason = 'operational-vault-or-scheduling';
    else if (/^create extension[^;]*\b(pg_cron|pg_net)\b/i.test(sql)) reason = 'disabled-automation-extension';
    if (reason) skipped.push({line: statement.line, reason, sha256: hash(statement.text)});
    else kept.push(statement.text);
  }
  return {sql: kept.join('\n'), file, sha256: hash(source), skipped, statementsApplied: kept.length};
}
