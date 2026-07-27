'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import type { LeadKind } from '@/lib/types';
import { normalizePhone, safeText } from '@/lib/format';

interface ImportRecord {
  kind: LeadKind;
  kommo_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  stage: string;
  source: string | null;
  enterprise: string | null;
  company: string | null;
  group_name: string | null;
  creci: string | null;
  temperature: number;
  metadata: Record<string, unknown>;
}

function norm(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function lookup(row: Record<string, unknown>, ...names: string[]) {
  const entries = Object.entries(row);
  for (const name of names) {
    const target = norm(name);
    const match = entries.find(([key]) => norm(key) === target);
    if (match && String(match[1] ?? '').trim()) return match[1];
  }
  return '';
}

function firstPhone(row: Record<string, unknown>) {
  return lookup(row, 'Celular (contato)', 'Telefone comercial (contato)', 'Tel. direto com. (contato)', 'Telefone residencial (contato)', 'Outro telefone (contato)', 'Telefone', 'Celular');
}

function firstEmail(row: Record<string, unknown>) {
  return lookup(row, 'Email comercial (contato)', 'Email pessoal (contato)', 'Outro email (contato)', 'Email');
}

function clientStage(value: unknown) {
  const text = norm(value);
  if (/fechad|ganh|vendid/.test(text)) return 'fechado';
  if (/negoci/.test(text)) return 'negociacao';
  if (/agend|visita|call/.test(text)) return 'agendado';
  if (/qualific|quente/.test(text)) return 'qualificado';
  if (/ia|atend/.test(text)) return 'ia';
  return 'novo';
}

function brokerStage(value: unknown) {
  const text = norm(value);
  if (/parceiro|nivel 5|n5/.test(text)) return 'n5';
  if (/negoci|nivel 4|n4/.test(text)) return 'n4';
  if (/ativ|nivel 3|n3/.test(text)) return 'n3';
  if (/curios|nivel 2|n2/.test(text)) return 'n2';
  return 'n1';
}

function temperature(value: unknown) {
  const text = norm(value);
  const numeric = Number(String(value ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
  if (Number.isFinite(numeric) && numeric > 0) return Math.max(0, Math.min(100, Math.round(numeric)));
  if (/quente/.test(text)) return 85;
  if (/morno/.test(text)) return 50;
  if (/frio/.test(text)) return 15;
  return 0;
}

function detectKind(row: Record<string, unknown>, fallback: LeadKind): LeadKind {
  const pipeline = norm(lookup(row, 'Funil de vendas', 'Pipeline'));
  if (/corretor/.test(pipeline)) return 'corretor';
  if (/cliente|lead|venda/.test(pipeline)) return 'cliente';
  return fallback;
}

function mapRow(row: Record<string, unknown>, fallback: LeadKind): ImportRecord | null {
  const kind = detectKind(row, fallback);
  const name = safeText(lookup(row, 'Contato principal', 'Lead título', 'Nome', 'Contato'));
  if (!name) return null;
  const phone = normalizePhone(firstPhone(row)) || null;
  const stageRaw = lookup(row, 'Etapa do lead', 'Etapa');
  const metadata: Record<string, unknown> = {};
  const metadataFields = [
    'Objetivo (contato)', 'Faixa de investimento (contato)', 'Tipologia desejada (contato)',
    'Cidade (contato)', 'País (contato)', 'Prazo de compra (contato)', 'Próxima ação (contato)',
    'Observacoes comerciais (contato)', 'Observações estratégicas (contato)', 'Produtos preferidos (contato)',
    'Volume médio de vendas/mês (contato)', 'Ticket médio das vendas (contato)', 'Total de vendas Bossa (contato)',
    'Lead tags', 'Data Criada', 'Última modificação', 'Lead usuário responsável',
  ];
  metadataFields.forEach((field) => {
    const value = lookup(row, field);
    if (String(value ?? '').trim()) metadata[field.replace(/ \(contato\)$/i, '')] = value;
  });

  return {
    kind,
    kommo_id: safeText(lookup(row, 'ID')) || null,
    name,
    phone,
    email: safeText(firstEmail(row)) || null,
    stage: kind === 'cliente' ? clientStage(stageRaw) : brokerStage(stageRaw),
    source: kind === 'cliente' ? safeText(lookup(row, 'Origem do lead (contato)', 'Canal de entrada (contato)', 'utm_source', 'Lead tags'), 'Importado XLSX') : 'Importado XLSX',
    enterprise: kind === 'cliente' ? safeText(lookup(row, 'Produto de interesse (contato)', 'Lead título')) || null : null,
    company: kind === 'corretor' ? safeText(lookup(row, 'Empresa do contato', "Empresa lead 's"), 'Autônomo') : null,
    group_name: kind === 'corretor' ? safeText(lookup(row, 'Região de atuação (contato)', 'Região', 'Grupo'), 'Novos cadastros') : null,
    creci: kind === 'corretor' ? safeText(lookup(row, 'CRECI (contato)', 'CRECI')) || null : null,
    temperature: kind === 'cliente' ? temperature(lookup(row, 'Temperatura do lead do lead (contato)', 'Temperatura')) : 0,
    metadata,
  };
}

export function Importer({ defaultKind }: { defaultKind: LeadKind }) {
  const router = useRouter();
  const [kind, setKind] = useState<LeadKind>(defaultKind);
  const [fileName, setFileName] = useState('');
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [invalid, setInvalid] = useState(0);
  const [strategy, setStrategy] = useState<'ignore' | 'update' | 'replace'>('update');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number } | null>(null);

  const counts = useMemo(() => ({ clients: records.filter((r) => r.kind === 'cliente').length, brokers: records.filter((r) => r.kind === 'corretor').length }), [records]);

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false, cellDates: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('A planilha não possui abas.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: false });
      const mapped = rows.map((row) => mapRow(row, kind));
      setRecords(mapped.filter(Boolean) as ImportRecord[]);
      setInvalid(mapped.filter((item) => !item).length);
      setFileName(file.name);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Não foi possível ler o arquivo XLSX.');
      setRecords([]);
    }
    setLoading(false);
  }

  async function importRecords() {
    if (!records.length) return;
    setLoading(true);
    setError('');
    setResult(null);
    setProgress(0);
    const batchSize = 350;
    const totals = { added: 0, updated: 0, skipped: 0 };
    try {
      for (let index = 0; index < records.length; index += batchSize) {
        const batch = records.slice(index, index + batchSize);
        const response = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: batch, strategy: strategy === 'replace' ? 'update' : strategy, reset: strategy === 'replace' && index === 0, resetKinds: [...new Set(records.map((r) => r.kind))] }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Falha durante a importação.');
        totals.added += payload.added || 0;
        totals.updated += payload.updated || 0;
        totals.skipped += payload.skipped || 0;
        setProgress(Math.round(Math.min(records.length, index + batch.length) / records.length * 100));
      }
      setResult(totals);
      router.refresh();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Falha durante a importação.');
    }
    setLoading(false);
  }

  return (
    <div className="grid grid-2">
      <section className="card">
        <div className="card-head"><h3>1. Selecione a planilha</h3></div>
        <div className="card-body">
          <div className="field"><label>Pipeline padrão para linhas sem identificação</label><select className="select" value={kind} onChange={(e) => setKind(e.target.value as LeadKind)}><option value="cliente">Clientes finais</option><option value="corretor">Corretores</option></select></div>
          <label className="dropzone"><input type="file" accept=".xlsx,.xls" onChange={readFile} style={{ display: 'none' }} /><strong>📄 Clique para escolher o arquivo XLSX</strong><br /><span className="muted">Compatível com a exportação do Kommo e planilhas simples</span>{fileName && <div className="success-box" style={{ marginBottom: 0 }}>{fileName}</div>}</label>
          {loading && !records.length && <div className="info-box">Lendo a planilha…</div>}
          {error && <div className="error-box">{error}</div>}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h3>2. Confira e importe</h3></div>
        <div className="card-body">
          <div className="import-summary"><div className="import-stat"><b>{records.length}</b><span>válidos</span></div><div className="import-stat"><b>{counts.clients}</b><span>clientes</span></div><div className="import-stat"><b>{counts.brokers}</b><span>corretores</span></div><div className="import-stat"><b>{invalid}</b><span>sem nome</span></div></div>
          <div className="field"><label>Tratamento de duplicados</label><select className="select" value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)}><option value="update">Atualizar existentes e adicionar novos</option><option value="ignore">Ignorar duplicados</option><option value="replace">Apagar as pipelines envolvidas e substituir</option></select></div>
          {strategy === 'replace' && <div className="error-box"><strong>Atenção:</strong> os registros atuais das pipelines identificadas no arquivo serão apagados antes da importação.</div>}
          {loading && records.length > 0 && <div className="info-box">Importando… {progress}%</div>}
          {result && <div className="success-box">Importação concluída: {result.added} adicionados, {result.updated} atualizados e {result.skipped} ignorados.</div>}
          <button className="btn btn-primary btn-block" disabled={loading || records.length === 0} onClick={() => void importRecords()}>{loading ? 'Processando…' : `Importar ${records.length} registros`}</button>
          <p className="faint" style={{ fontSize: 11, lineHeight: 1.5 }}>O sistema identifica duplicidades primeiro pelo ID do Kommo e depois pelo telefone. Os dados ficam gravados no banco da empresa.</p>
        </div>
      </section>

      {records.length > 0 && <section className="card" style={{ gridColumn: '1 / -1' }}><div className="card-head"><h3>Prévia das primeiras linhas</h3></div><div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Nome</th><th>Telefone</th><th>Etapa</th><th>Empresa / Empreendimento</th></tr></thead><tbody>{records.slice(0, 20).map((record, index) => <tr key={`${record.kommo_id}-${index}`}><td>{record.kind}</td><td>{record.name}</td><td>{record.phone || '—'}</td><td>{record.stage}</td><td>{record.kind === 'cliente' ? record.enterprise || '—' : record.company || '—'}</td></tr>)}</tbody></table></div></section>}
    </div>
  );
}
