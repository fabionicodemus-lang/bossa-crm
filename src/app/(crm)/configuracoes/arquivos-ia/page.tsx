'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageTopbar } from '@/components/PageTopbar';
import { createClient } from '@/lib/supabase/client';

type AgentTarget = 'nara' | 'plantao' | 'both';

type AiFile = {
  id: string;
  organization_id: string;
  agent: AgentTarget;
  category: string;
  title: string;
  description: string | null;
  trigger_keywords: string[];
  storage_bucket: string;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  version_label: string | null;
  content_group: string | null;
  created_at: string;
  updated_at: string | null;
};

const categories = [
  ['tabela', 'Tabela de vendas'],
  ['book', 'Book de vendas'],
  ['planta', 'Plantas'],
  ['imagem', 'Imagens'],
  ['video', 'Vídeos'],
  ['obra', 'Andamento de obra'],
  ['condicoes', 'Condições comerciais'],
  ['institucional', 'Institucional'],
  ['outros', 'Outros'],
] as const;

const agentLabels: Record<AgentTarget, string> = {
  nara: 'Nara',
  plantao: 'Plantão',
  both: 'Ambas as IAs',
};

const fileSelect = 'id,organization_id,agent,category,title,description,trigger_keywords,storage_bucket,storage_path,original_name,mime_type,size_bytes,active,valid_from,valid_until,version_label,content_group,created_at,updated_at';
const acceptedExtensions = '.pdf,.jpg,.jpeg,.png,.webp,.mp4,.mp3,.m4a,.xlsx,.xls,.doc,.docx,.ppt,.pptx';
const maxFileSize = 50 * 1024 * 1024;

const whatsappImageTargetSize = Math.floor(4.5 * 1024 * 1024);

async function compressLargeJpegForWhatsApp(file: File): Promise<File> {
  if (!/^image\/jpe?g$/i.test(file.type) || file.size <= whatsappImageTargetSize) return file;

  const bitmap = await createImageBitmap(file);
  const attempts = [
    { maxSide: 2560, quality: 0.82 },
    { maxSide: 2200, quality: 0.78 },
    { maxSide: 1920, quality: 0.74 },
    { maxSide: 1600, quality: 0.70 },
  ];

  try {
    for (const attempt of attempts) {
      const scale = Math.min(1, attempt.maxSide / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Não foi possível preparar a imagem.');
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', attempt.quality));
      if (!blob) continue;
      if (blob.size <= whatsappImageTargetSize) {
        return new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified });
      }
    }
  } finally {
    bitmap.close();
  }

  throw new Error('A imagem continua grande demais para envio como imagem no WhatsApp após a compressão.');
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFilename(name: string) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').toLowerCase();
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message ?? 'Erro inesperado.');
  return 'Erro inesperado.';
}

function dateInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function endOfDayIso(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function expired(item: AiFile) {
  return Boolean(item.valid_until && new Date(item.valid_until).getTime() < Date.now());
}

export default function AiFilesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [organizationId, setOrganizationId] = useState('');
  const [files, setFiles] = useState<AiFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [agent, setAgent] = useState<AgentTarget>('both');
  const [category, setCategory] = useState('outros');
  const [keywords, setKeywords] = useState('');
  const [active, setActive] = useState(true);
  const [versionLabel, setVersionLabel] = useState('');
  const [contentGroup, setContentGroup] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState<'all' | AgentTarget>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/login');
          return;
        }
        const { data: membership, error: membershipError } = await supabase
          .from('memberships')
          .select('organization_id,role')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership || !['admin', 'comercial'].includes(membership.role)) {
          router.replace('/dashboard');
          return;
        }
        const { data, error: filesError } = await supabase
          .from('ai_files')
          .select(fileSelect)
          .eq('organization_id', membership.organization_id)
          .order('created_at', { ascending: false });
        if (filesError) throw filesError;
        if (!cancelled) {
          setOrganizationId(membership.organization_id);
          setFiles((data ?? []) as AiFile[]);
        }
      } catch (caught) {
        if (!cancelled) {
          const message = errorMessage(caught);
          setError(message.includes('ai_files') || message.includes('schema cache') ? 'Execute as migrations da biblioteca de arquivos no Supabase antes de usar esta tela.' : message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [router, supabase]);

  const filteredFiles = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return files.filter((item) => {
      if (agentFilter !== 'all' && item.agent !== agentFilter && item.agent !== 'both') return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!term) return true;
      return [item.title, item.description ?? '', item.original_name, item.version_label ?? '', item.content_group ?? '', ...item.trigger_keywords].join(' ').toLocaleLowerCase('pt-BR').includes(term);
    });
  }, [agentFilter, categoryFilter, files, search]);

  function resetForm() {
    setSelectedFile(null);
    setEditingId(null);
    setTitle('');
    setDescription('');
    setAgent('both');
    setCategory('outros');
    setKeywords('');
    setActive(true);
    setVersionLabel('');
    setContentGroup('');
    setValidUntil('');
    const input = document.getElementById('ai-file-input') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  function startEdit(item: AiFile) {
    setEditingId(item.id);
    setSelectedFile(null);
    setTitle(item.title);
    setDescription(item.description ?? '');
    setAgent(item.agent);
    setCategory(item.category);
    setKeywords(item.trigger_keywords.join(', '));
    setActive(item.active);
    setVersionLabel(item.version_label ?? '');
    setContentGroup(item.content_group ?? '');
    setValidUntil(dateInput(item.valid_until));
    setNotice('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const parsedKeywords = keywords.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 30);
    const versioning = {
      version_label: versionLabel.trim() || null,
      content_group: contentGroup.trim() || null,
      valid_until: endOfDayIso(validUntil),
    };
    try {
      if (!title.trim()) throw new Error('Informe um título para o arquivo.');
      if (editingId) {
        const { data, error: updateError } = await supabase
          .from('ai_files')
          .update({
            title: title.trim(),
            description: description.trim() || null,
            agent,
            category,
            trigger_keywords: parsedKeywords,
            active,
            ...versioning,
          })
          .eq('id', editingId)
          .eq('organization_id', organizationId)
          .select(fileSelect)
          .single();
        if (updateError) throw updateError;
        setFiles((current) => current.map((item) => item.id === editingId ? data as AiFile : item));
        setNotice('Informações, versão e validade do arquivo atualizadas.');
        resetForm();
        return;
      }

      if (!selectedFile) throw new Error('Selecione um arquivo para enviar.');
      if (selectedFile.size > maxFileSize) throw new Error('O arquivo deve ter no máximo 50 MB.');
      const uploadFile = await compressLargeJpegForWhatsApp(selectedFile);
      const path = `${organizationId}/${crypto.randomUUID()}-${safeFilename(selectedFile.name)}`;
      const { error: uploadError } = await supabase.storage.from('ai-files').upload(path, uploadFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: uploadFile.type || undefined,
      });
      if (uploadError) throw uploadError;
      const { data, error: insertError } = await supabase
        .from('ai_files')
        .insert({
          organization_id: organizationId,
          agent,
          category,
          title: title.trim(),
          description: description.trim() || null,
          trigger_keywords: parsedKeywords,
          storage_bucket: 'ai-files',
          storage_path: path,
          original_name: selectedFile.name,
          mime_type: uploadFile.type || null,
          size_bytes: uploadFile.size,
          active,
          ...versioning,
        })
        .select(fileSelect)
        .single();
      if (insertError) {
        await supabase.storage.from('ai-files').remove([path]);
        throw insertError;
      }
      setFiles((current) => [data as AiFile, ...current]);
      setNotice('Arquivo enviado e liberado para a biblioteca da IA.');
      resetForm();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: AiFile) {
    setError('');
    const { error: updateError } = await supabase.from('ai_files').update({ active: !item.active }).eq('id', item.id).eq('organization_id', organizationId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setFiles((current) => current.map((row) => row.id === item.id ? { ...row, active: !row.active } : row));
  }

  async function preview(item: AiFile) {
    setError('');
    const { data, error: signedError } = await supabase.storage.from(item.storage_bucket).createSignedUrl(item.storage_path, 600);
    if (signedError) {
      setError(signedError.message);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function remove(item: AiFile) {
    if (!window.confirm(`Excluir definitivamente “${item.title}”?`)) return;
    setError('');
    const { error: storageError } = await supabase.storage.from(item.storage_bucket).remove([item.storage_path]);
    if (storageError) {
      setError(storageError.message);
      return;
    }
    const { error: deleteError } = await supabase.from('ai_files').delete().eq('id', item.id).eq('organization_id', organizationId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setFiles((current) => current.filter((row) => row.id !== item.id));
    if (editingId === item.id) resetForm();
  }

  return <>
    <PageTopbar title="Arquivos da IA" subtitle="Biblioteca inteligente de materiais da Nara e do Plantão" />
    <div className="page-content">
      {error && <div className="error-box">{error}</div>}
      {notice && <div className="success-box">{notice}</div>}

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head"><h3>{editingId ? 'Editar arquivo' : 'Adicionar arquivo'}</h3><span className="chip">Até 50 MB</span></div>
          <form className="card-body" onSubmit={save}>
            {!editingId && <div className="field">
              <label>Arquivo</label>
              <input id="ai-file-input" className="input" type="file" accept={acceptedExtensions} onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
                if (file && !title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''));
              }} />
              <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>PDF, imagens, vídeos, áudios, Excel, Word e PowerPoint.</div>
            </div>}
            <div className="field"><label>Título que a IA verá</label><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Tabela atualizada do Flow" /></div>
            <div className="grid grid-2">
              <div className="field"><label>Quem pode enviar</label><select className="select" value={agent} onChange={(event) => setAgent(event.target.value as AgentTarget)}><option value="both">Ambas as IAs</option><option value="nara">Somente Nara</option><option value="plantao">Somente Plantão</option></select></div>
              <div className="field"><label>Categoria</label><select className="select" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            </div>
            <div className="field"><label>Descrição e regra de uso</label><textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex.: Enviar quando o cliente pedir tabela do Flow." /></div>
            <div className="field"><label>Palavras que indicam esse arquivo</label><input className="input" value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="tabela, preço, valores, Flow" /><div className="muted" style={{ fontSize: 11, marginTop: 5 }}>A IA usa estas palavras junto com a conversa para ranquear os materiais.</div></div>
            <div className="grid grid-3">
              <div className="field"><label>Versão</label><input className="input" value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="Ex.: set/2026" /></div>
              <div className="field"><label>Grupo do conteúdo</label><input className="input" value={contentGroup} onChange={(event) => setContentGroup(event.target.value)} placeholder="Ex.: tabela-flow" /><div className="muted" style={{ fontSize: 10, marginTop: 4 }}>Arquivos do mesmo grupo: só a versão mais nova é oferecida à IA.</div></div>
              <div className="field"><label>Válido até</label><input className="input" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /><div className="muted" style={{ fontSize: 10, marginTop: 4 }}>Após esta data, o material some automaticamente do contexto da IA.</div></div>
            </div>
            <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontWeight: 700, marginBottom: 14 }}><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Arquivo liberado para envio</label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {editingId && <button type="button" className="btn btn-ghost" onClick={resetForm}>Cancelar</button>}
              <button className="btn btn-primary" disabled={saving || loading || !organizationId}>{saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Enviar arquivo'}</button>
            </div>
          </form>
        </section>

        <section className="card">
          <div className="card-head"><h3>Resumo da biblioteca</h3></div>
          <div className="card-body">
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
              <div className="kpi"><div className="label">Total</div><div className="value">{files.length}</div></div>
              <div className="kpi"><div className="label">Ativos e válidos</div><div className="value">{files.filter((item) => item.active && !expired(item)).length}</div></div>
              <div className="kpi"><div className="label">Nara</div><div className="value">{files.filter((item) => item.agent === 'nara' || item.agent === 'both').length}</div></div>
              <div className="kpi"><div className="label">Plantão</div><div className="value">{files.filter((item) => item.agent === 'plantao' || item.agent === 'both').length}</div></div>
            </div>
            <div className="info-box" style={{ marginTop: 14 }}><strong>Seleção inteligente:</strong> a IA não recebe mais a biblioteca inteira. Ela recebe apenas os materiais mais relevantes para a conversa, priorizando empreendimento, categoria, palavras-chave e a versão válida mais nova.</div>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>Biblioteca cadastrada</h3><span className="chip">{filteredFiles.length} exibidos</span></div>
        <div className="card-body">
          <div className="grid grid-3" style={{ marginBottom: 14 }}>
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, descrição, versão ou palavra-chave" />
            <select className="select" value={agentFilter} onChange={(event) => setAgentFilter(event.target.value as 'all' | AgentTarget)}><option value="all">Todas as IAs</option><option value="nara">Nara</option><option value="plantao">Plantão</option><option value="both">Ambas</option></select>
            <select className="select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Todas as categorias</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>

          {loading ? <div className="empty-state">Carregando arquivos...</div> : filteredFiles.length === 0 ? <div className="empty-state">Nenhum arquivo cadastrado com esses filtros.</div> : <div className="grid grid-2">
            {filteredFiles.map((item) => <article className="card" key={item.id} style={{ boxShadow: 'none' }}>
              <div className="card-head">
                <div><h3>{item.title}</h3><div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{item.original_name}</div></div>
                <span className={`chip ${item.active && !expired(item) ? 'chip-green' : 'chip-orange'}`}>{expired(item) ? 'Expirado' : item.active ? 'Ativo' : 'Pausado'}</span>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span className="chip">{agentLabels[item.agent]}</span><span className="chip">{categories.find(([value]) => value === item.category)?.[1] ?? item.category}</span><span className="chip">{formatBytes(item.size_bytes)}</span>
                  {item.version_label && <span className="chip">Versão: {item.version_label}</span>}
                  {item.valid_until && <span className="chip">Válido até {new Date(item.valid_until).toLocaleDateString('pt-BR')}</span>}
                </div>
                {item.content_group && <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>Grupo: {item.content_group}</div>}
                {item.description && <p className="muted" style={{ fontSize: 12, lineHeight: 1.55 }}>{item.description}</p>}
                {item.trigger_keywords.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>{item.trigger_keywords.map((keyword) => <span className="chip" key={keyword}>{keyword}</span>)}</div>}
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 14 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => preview(item)}>Visualizar</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}>Editar</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(item)}>{item.active ? 'Pausar' : 'Ativar'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(item)}>Excluir</button>
                </div>
              </div>
            </article>)}
          </div>}
        </div>
      </section>
    </div>
  </>;
}
