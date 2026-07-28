'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageTopbar } from '@/components/PageTopbar';

type Agent = 'nara' | 'plantao';
type Tab = 'simulador' | 'persona' | 'base' | 'correcoes' | 'abertura' | 'prompt';
type ChatRole = 'user' | 'assistant';

type Persona = {
  name: string;
  role: string;
  tone: string;
  length: string;
  emojis: string;
  identity: string;
};

type AgentConfig = {
  persona: Persona;
  knowledge: Record<string, string>;
  first_message: string;
  active: boolean;
};

type TrainingExample = {
  id: string;
  scenario: string | null;
  user_message: string;
  assistant_message: string;
  rating: 'approved' | 'corrected' | 'rejected';
  correction: string | null;
  notes: string | null;
  created_at: string;
};

type ChatMessage = { role: ChatRole; content: string };
type Scenario = { key: string; name: string; first: string };

const naraScenarios: Scenario[] = [
  { key: 'investidor', name: 'Investidor cético', first: 'Oi, vi o anúncio. Comprar na planta hoje não é arriscado demais? Tem construtora quebrando por aí.' },
  { key: 'familia', name: 'Família procurando imóvel', first: 'Boa tarde! Estamos procurando um apartamento para morar com as crianças. Vocês têm de 3 quartos?' },
  { key: 'preco', name: 'Caçador de preço', first: 'Quanto custa o menor apartamento? Só quero saber o valor.' },
  { key: 'frio', name: 'Lead frio do Instagram', first: 'oi' },
  { key: 'desconfiado', name: 'Desconfiado sobre IA', first: 'Boa noite. Antes de continuar: estou falando com uma pessoa ou é um robô?' },
  { key: 'urgente', name: 'Comprador com pressa', first: 'Preciso resolver essa semana. Tenho 1,5 milhão para investir e quero fechar rápido.' },
];

const plantaoScenarios: Scenario[] = [
  { key: 'novo', name: 'Corretor novo', first: 'Boa noite, sou corretor aqui de Itapema. Vocês trabalham com parceria? Qual a comissão de vocês?' },
  { key: 'material', name: 'Pedindo material', first: 'Oi, manda o book do Alma Seahouses e a tabela atualizada.' },
  { key: 'cliente', name: 'Com cliente real', first: 'Tenho um casal procurando 3 quartos no Flow. Quais unidades ainda estão disponíveis?' },
  { key: 'comissao', name: 'Forçando comissão', first: 'Consigo 6% nessa venda? Outra construtora aqui me paga isso.' },
  { key: 'urgente', name: 'Cliente na frente dele', first: 'Estou com o cliente aqui agora, ele quer a 1204. Consegue segurar para mim até amanhã?' },
  { key: 'proposta', name: 'Proposta na mesa', first: 'Meu cliente fez proposta de 950 mil na 1204, com entrada de 300. Topam?' },
  { key: 'reclamacao', name: 'Reclamação de atendimento', first: 'Mandei um cliente semana passada e até hoje ninguém retornou para ele. Assim fica difícil trabalhar com vocês.' },
];

function defaultConfig(agent: Agent): AgentConfig {
  if (agent === 'plantao') {
    return {
      active: true,
      first_message: 'Oi, {{primeiro_nome}}! Aqui é o plantão da Bossa 😊 Em que posso te ajudar?',
      persona: {
        name: 'Plantão da Bossa',
        role: 'atendimento institucional para corretores parceiros fora do horário comercial',
        tone: 'direto, prático e de igual para igual, como colega de mercado',
        length: 'mensagens curtas e resolutivas',
        emojis: 'poucos e discretos',
        identity: 'Nunca usa nome próprio. Identifica-se somente como o plantão da Bossa e nunca finge ser uma pessoa específica.',
      },
      knowledge: {
        papel: 'Atende corretores parceiros, não clientes finais. O objetivo é destravar a venda com informação correta e rapidez.',
        materiais: 'Pode orientar sobre tabela, book, plantas, imagens, andamento de obra e informações públicas dos empreendimentos. Nunca inventa arquivo ou disponibilidade.',
        parceria: 'Recebe corretor novo, coleta nome, imobiliária, CRECI e necessidade. Encaminha cadastro e questões de comissão ao comercial.',
        limites: 'Não negocia comissão, não reserva unidade, não aceita proposta e não promete retorno em horário exato.',
        escalonamento: 'Escala imediatamente propostas, pedidos de reserva, exceções comerciais, reclamações, cliente aguardando e qualquer informação não confirmada.',
      },
    };
  }
  return {
    active: true,
    first_message: 'Oi, {{primeiro_nome}}! Aqui é a Nara, da Bossa 😊 Vi seu interesse no {{empreendimento}} — posso te ajudar a entender as opções?',
    persona: {
      name: 'Nara',
      role: 'consultora de relacionamento da Bossa Empreendimentos',
      tone: 'caloroso, próximo e objetivo, sem formalidade exagerada e sem gírias forçadas',
      length: 'no máximo duas frases e uma pergunta por mensagem',
      emojis: 'poucos e discretos',
      identity: 'Apresenta-se como Nara, da Bossa. Se perguntarem se é robô ou IA, não mente e oferece passar para um consultor humano.',
    },
    knowledge: {
      missao: 'Entender finalidade, tipologia, orçamento, decisor e prazo sem transformar a conversa em interrogatório.',
      empreendimentos: 'Flow Aptos e Alma Seahouses. Use somente informações confirmadas pela Bossa e nunca invente preços, disponibilidade, prazo ou condição comercial.',
      qualificacao: 'Identifique se é para morar ou investir, número de quartos, faixa de investimento, quem decide e quando pretende comprar.',
      agendamento: 'Quando houver interesse real, proponha visita ou videochamada e sinalize que o comercial dará continuidade.',
      escalonamento: 'Transfira quando houver proposta, pedido de reserva, negociação, reclamação, urgência, pergunta não confirmada ou preferência por atendimento humano.',
    },
  };
}

function buildPrompt(agent: Agent, config: AgentConfig, examples: TrainingExample[]) {
  const base = Object.entries(config.knowledge).map(([key, value]) => `## ${key.toUpperCase()}\n${value}`).join('\n\n');
  const approved = examples.slice(0, 20).map((item) => {
    const ideal = item.rating === 'corrected' && item.correction ? item.correction : item.assistant_message;
    return `Cliente/corretor: ${item.user_message}\nResposta ideal: ${ideal}`;
  }).join('\n\n');
  const identity = agent === 'nara'
    ? 'Você atende clientes finais interessados em comprar imóveis da Bossa.'
    : 'Você atende corretores parceiros fora do horário comercial. Nunca use nome próprio; identifique-se somente como o plantão da Bossa.';
  return `${identity}\n\n# PERSONA\nNome/identificação: ${config.persona.name}\nPapel: ${config.persona.role}\nTom: ${config.persona.tone}\nTamanho: ${config.persona.length}\nEmojis: ${config.persona.emojis}\nIdentidade: ${config.persona.identity}\n\n# ABERTURA PADRÃO\n${config.first_message}\n\n# BASE DE CONHECIMENTO\n${base}${approved ? `\n\n# EXEMPLOS APROVADOS E CORRIGIDOS\n${approved}` : ''}\n\nResponda em português brasileiro. Nunca invente dados. Quando não tiver certeza, encaminhe ao comercial.`;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'error' in data ? String((data as { error?: unknown }).error ?? 'Erro inesperado.') : 'Erro inesperado.';
    throw new Error(message);
  }
  return data as T;
}

export default function AgentTrainingPage() {
  const params = useParams<{ agente: string }>();
  const agent: Agent = params.agente === 'plantao' ? 'plantao' : 'nara';
  const isNara = agent === 'nara';
  const [tab, setTab] = useState<Tab>('simulador');
  const [config, setConfig] = useState<AgentConfig>(() => defaultConfig(agent));
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scenario, setScenario] = useState('');
  const [input, setInput] = useState('');
  const [correction, setCorrection] = useState('');
  const [correctingIndex, setCorrectingIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const scenarios = isNara ? naraScenarios : plantaoScenarios;
  const prompt = useMemo(() => buildPrompt(agent, config, examples), [agent, config, examples]);
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'simulador', label: '🎭 Simulador' },
    { key: 'persona', label: '🗣️ Personalidade' },
    { key: 'base', label: isNara ? '📚 Base de conhecimento' : '📚 Base do corretor' },
    { key: 'correcoes', label: `✏️ Correções (${examples.length})` },
    ...(isNara ? [{ key: 'abertura' as Tab, label: '📤 Primeira mensagem' }] : []),
    { key: 'prompt', label: '📄 Prompt final' },
  ];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setNotice('');
    setTab('simulador');
    setMessages([]);
    setScenario('');
    fetch(`/api/ai-training?agent=${agent}`, { cache: 'no-store' })
      .then((response) => readJson<{ config: AgentConfig; examples: TrainingExample[] }>(response))
      .then((data) => {
        if (cancelled) return;
        setConfig(data.config);
        setExamples(data.examples);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar o treinamento.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [agent]);

  function updatePersona(key: keyof Persona, value: string) {
    setConfig((current) => ({ ...current, persona: { ...current.persona, [key]: value } }));
  }

  function updateKnowledge(key: string, value: string) {
    setConfig((current) => ({ ...current, knowledge: { ...current.knowledge, [key]: value } }));
  }

  async function saveConfig() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await readJson<{ ok: boolean }>(await fetch('/api/ai-training', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agent, config }),
      }));
      setNotice('Configuração salva. O prompt final foi atualizado.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function requestReply(nextMessages: ChatMessage[]) {
    setSending(true);
    setError('');
    try {
      const data = await readJson<{ reply: string; source: 'anthropic' | 'local' }>(await fetch('/api/ai-training', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'simulate', agent, messages: nextMessages, scenario }),
      }));
      setMessages([...nextMessages, { role: 'assistant', content: data.reply }]);
      if (data.source === 'local') setNotice('Simulação local usada. Para testar a IA real, configure ANTHROPIC_API_KEY na Vercel.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível gerar a resposta.');
    } finally {
      setSending(false);
    }
  }

  async function startScenario(key: string) {
    const selected = scenarios.find((item) => item.key === key);
    if (!selected) return;
    setScenario(key);
    setCorrection('');
    setCorrectingIndex(null);
    const nextMessages: ChatMessage[] = [{ role: 'user', content: selected.first }];
    setMessages(nextMessages);
    await requestReply(nextMessages);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const nextMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(nextMessages);
    await requestReply(nextMessages);
  }

  async function saveExample(index: number, rating: TrainingExample['rating'], correctedText?: string) {
    const assistant = messages[index];
    const user = [...messages.slice(0, index)].reverse().find((item) => item.role === 'user');
    if (!assistant || assistant.role !== 'assistant' || !user) return;
    setError('');
    try {
      const data = await readJson<{ example: TrainingExample }>(await fetch('/api/ai-training', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'example',
          agent,
          scenario,
          user_message: user.content,
          assistant_message: assistant.content,
          rating,
          correction: correctedText || null,
        }),
      }));
      setExamples((current) => [data.example, ...current]);
      setCorrectingIndex(null);
      setCorrection('');
      setNotice(rating === 'approved' ? 'Resposta aprovada e adicionada ao treinamento.' : 'Correção salva como exemplo ideal.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o exemplo.');
    }
  }

  async function deleteExample(id: string) {
    setError('');
    try {
      await readJson<{ ok: boolean }>(await fetch(`/api/ai-training?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
      setExamples((current) => current.filter((item) => item.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível excluir o exemplo.');
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice('Prompt copiado.');
    } catch {
      setError('O navegador não permitiu copiar automaticamente.');
    }
  }

  const title = isNara ? 'Treinar a Nara' : 'Treinar o Plantão';
  const subtitle = isNara
    ? 'Atendimento de clientes finais — qualificação e agendamento'
    : 'Atendimento de corretores fora do horário — sem nome próprio e sem promessas';

  return <>
    <PageTopbar title={title} subtitle={subtitle} actions={<button className="btn btn-primary btn-sm" onClick={saveConfig} disabled={saving || loading}>{saving ? 'Salvando...' : 'Salvar treinamento'}</button>} />
    <div className="page-content">
      {!isNara && <div className="info-box"><strong>O plantão não é a Nara com outro nome.</strong> A Nara conversa com quem compra, qualifica e agenda. O plantão conversa com quem vende, destrava material, responde dúvidas e escala propostas.</div>}
      {error && <div className="error-box">{error}</div>}
      {notice && <div className="success-box">{notice}</div>}
      <div className="detail-top" style={{ marginTop: 14 }}>
        <div className="profile-head">
          <div className="profile-avatar">{isNara ? 'NA' : 'PL'}</div>
          <div>
            <div className="profile-name">{config.persona.name}</div>
            <div className="profile-meta">{config.persona.role}</div>
          </div>
          <div className="profile-actions">
            <span className={`chip ${config.active ? 'chip-green' : 'chip-orange'}`}>{config.active ? 'Ativo' : 'Pausado'}</span>
          </div>
        </div>
        <div className="tabs">
          {tabs.map((item) => <button key={item.key} className={`tab ${tab === item.key ? 'on' : ''}`} onClick={() => setTab(item.key)}>{item.label}</button>)}
        </div>
      </div>

      {loading ? <section className="card"><div className="empty-state">Carregando treinamento...</div></section> : null}

      {!loading && tab === 'simulador' && <div className="detail-grid">
        <section className="card whatsapp-panel">
          <div className="wa-head">
            <div className="wa-icon">💬</div>
            <div><strong>Conversa de treino</strong><div className="faint" style={{ fontSize: 10 }}>Você interpreta o contato e avalia a resposta.</div></div>
            <span className="connection-pill">SIMULADOR</span>
          </div>
          <div className="messages">
            {messages.length === 0 && <div className="empty-state">Escolha um cenário para começar.</div>}
            {messages.map((message, index) => <div key={`${index}-${message.content.slice(0, 12)}`} className={`message ${message.role === 'user' ? 'in' : 'out'}`}>
              {message.content}
              {message.role === 'assistant' && <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => saveExample(index, 'approved')}>👍 Aprovar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setCorrectingIndex(index); setCorrection(message.content); }}>✏️ Corrigir</button>
              </div>}
              {correctingIndex === index && <div style={{ marginTop: 9 }}>
                <textarea className="textarea" value={correction} onChange={(event) => setCorrection(event.target.value)} />
                <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setCorrectingIndex(null)}>Cancelar</button>
                  <button className="btn btn-primary btn-sm" onClick={() => saveExample(index, 'corrected', correction.trim())} disabled={!correction.trim()}>Salvar correção</button>
                </div>
              </div>}
            </div>)}
            {sending && <div className="message out">digitando…</div>}
          </div>
          <div className="composer">
            <textarea placeholder="Digite como se fosse o contato..." value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} />
            <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !input.trim()}>Enviar</button>
          </div>
        </section>
        <aside className="side-stack">
          <section className="card"><div className="card-head"><h3>Cenários de teste</h3></div><div className="card-body grid">
            {scenarios.map((item) => <button key={item.key} className={`btn ${scenario === item.key ? 'btn-secondary' : 'btn-ghost'} btn-block`} onClick={() => startScenario(item.key)} disabled={sending}>{item.name}</button>)}
          </div></section>
          <section className="card"><div className="card-head"><h3>Como treinar</h3></div><div className="card-body muted" style={{ lineHeight: 1.65, fontSize: 12 }}>
            Inicie um cenário, converse normalmente e aprove ou corrija cada resposta. Os exemplos salvos entram no prompt final como referência de comportamento.
          </div></section>
        </aside>
      </div>}

      {!loading && tab === 'persona' && <div className="grid grid-2">
        <section className="card"><div className="card-head"><h3>Identidade e papel</h3></div><div className="card-body">
          <div className="field"><label>Nome ou identificação</label><input className="input" value={config.persona.name} onChange={(event) => updatePersona('name', event.target.value)} /></div>
          <div className="field"><label>Papel</label><textarea className="textarea" value={config.persona.role} onChange={(event) => updatePersona('role', event.target.value)} /></div>
          <div className="field"><label>Regra de identidade</label><textarea className="textarea" value={config.persona.identity} onChange={(event) => updatePersona('identity', event.target.value)} /></div>
        </div></section>
        <section className="card"><div className="card-head"><h3>Forma de falar</h3></div><div className="card-body">
          <div className="field"><label>Tom</label><textarea className="textarea" value={config.persona.tone} onChange={(event) => updatePersona('tone', event.target.value)} /></div>
          <div className="field"><label>Tamanho das mensagens</label><input className="input" value={config.persona.length} onChange={(event) => updatePersona('length', event.target.value)} /></div>
          <div className="field"><label>Uso de emojis</label><input className="input" value={config.persona.emojis} onChange={(event) => updatePersona('emojis', event.target.value)} /></div>
          <label style={{ display: 'flex', gap: 9, alignItems: 'center', fontWeight: 700 }}><input type="checkbox" checked={config.active} onChange={(event) => setConfig((current) => ({ ...current, active: event.target.checked }))} /> Agente ativo</label>
        </div></section>
      </div>}

      {!loading && tab === 'base' && <div className="grid grid-2">
        {Object.entries(config.knowledge).map(([key, value]) => <section className="card" key={key}><div className="card-head"><h3>{key.replaceAll('_', ' ')}</h3></div><div className="card-body"><textarea className="textarea" style={{ minHeight: 170 }} value={value} onChange={(event) => updateKnowledge(key, event.target.value)} /></div></section>)}
      </div>}

      {!loading && tab === 'correcoes' && <section className="card">
        <div className="card-head"><h3>Exemplos usados no treinamento</h3><span className="chip">{examples.length} registros</span></div>
        <div className="card-body">
          {examples.length === 0 ? <div className="empty-state">Ainda não há respostas aprovadas ou corrigidas.</div> : <div className="timeline">{examples.map((item) => <div className="timeline-item" key={item.id}>
            <div className="timeline-icon">{item.rating === 'approved' ? '👍' : item.rating === 'corrected' ? '✏️' : '👎'}</div>
            <div>
              <div className="timeline-title">{item.scenario || 'Conversa livre'} · {item.rating === 'approved' ? 'Aprovada' : item.rating === 'corrected' ? 'Corrigida' : 'Rejeitada'}</div>
              <div className="timeline-desc"><strong>Contato:</strong> {item.user_message}<br /><strong>Resposta:</strong> {item.assistant_message}{item.correction ? <><br /><strong>Resposta ideal:</strong> {item.correction}</> : null}</div>
              <div style={{ marginTop: 7 }}><button className="btn btn-ghost btn-sm" onClick={() => deleteExample(item.id)}>Excluir</button></div>
            </div>
          </div>)}</div>}
        </div>
      </section>}

      {!loading && tab === 'abertura' && <div className="grid grid-2">
        <section className="card"><div className="card-head"><h3>Primeira mensagem</h3></div><div className="card-body">
          <div className="field"><label>Mensagem enviada no primeiro contato</label><textarea className="textarea" style={{ minHeight: 160 }} value={config.first_message} onChange={(event) => setConfig((current) => ({ ...current, first_message: event.target.value }))} /></div>
          <div className="info-box">Variáveis disponíveis: <span className="mono">{'{{primeiro_nome}}'}</span> e <span className="mono">{'{{empreendimento}}'}</span>.</div>
        </div></section>
        <section className="card"><div className="card-head"><h3>Prévia</h3></div><div className="card-body" style={{ background: '#f2efea', minHeight: 260 }}><div className="message out">{config.first_message.replace('{{primeiro_nome}}', 'Marina').replace('{{empreendimento}}', 'Flow Aptos')}</div></div></section>
      </div>}

      {!loading && tab === 'prompt' && <section className="card">
        <div className="card-head"><h3>Prompt final consolidado</h3><button className="btn btn-ghost btn-sm" onClick={copyPrompt}>Copiar prompt</button></div>
        <div className="card-body"><textarea className="textarea mono" style={{ minHeight: 560, fontSize: 11.5, lineHeight: 1.6 }} value={prompt} readOnly /></div>
      </section>}
    </div>
  </>;
}
