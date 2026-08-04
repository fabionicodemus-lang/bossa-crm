'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageTopbar } from '@/components/PageTopbar';

type Agent = 'nara' | 'plantao';
type Tab = 'simulador' | 'persona' | 'base' | 'correcoes' | 'prompt';
type ChatRole = 'user' | 'assistant';
type FeedbackMode = 'rewrite' | 'comment';

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
type AiStatus = { configured: boolean; model: string; files_count: number; simulator_mode: string };
type SimulationResult = {
  classification: string;
  score: number;
  stage: string;
  handoff: boolean;
  attachments: Array<{ id: string; title: string; category: string; original_name: string }>;
};

const NARA_PROMPT_MARKER = '# PROMPT FINAL DA NARA';
const NARA_PROMPT_STORAGE_KEY = 'triagem_pergunta_inicial';

const NARA_TRIAGE_DEFAULTS: Record<string, string> = {
  triagem_objetivo: 'Antes de qualificar, descubra se o contato é realmente um possível comprador de imóvel novo da Bossa ou se pertence a outro tipo de atendimento.',
  triagem_pergunta_inicial: 'Quando a intenção não estiver clara, faça uma pergunta curta e aberta, como: “Para eu te direcionar certinho, você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?”',
  triagem_comprador: 'Se o contato demonstra que quer comprar, morar, investir ou conhecer um empreendimento, conclua a triagem e só então comece a qualificação comercial.',
  triagem_corretor: 'Se for corretor, imobiliária ou parceiro comercial, não faça a qualificação de cliente final. Explique que vai direcionar ao Plantão da Bossa e transfira para o canal correto.',
  triagem_cliente_atual: 'Se já for cliente, comprador, proprietário ou morador e o assunto for contrato, boleto, obra, assistência, entrega, documentação ou pós-venda, não qualifique. Acolha, registre o assunto e transfira ao setor responsável.',
  triagem_outros: 'Fornecedor, prestador, candidato a vaga, currículo, imprensa, vizinho, cobrança, spam e assuntos institucionais não seguem para qualificação. Colete somente o mínimo necessário e transfira ou encerre educadamente.',
  triagem_saida: 'A qualificação só pode começar quando houver evidência de que o contato é um possível comprador. Se ainda existir dúvida, continue somente a triagem, com uma pergunta por vez.',
};

const naraScenarios: Scenario[] = [
  { key: 'intencao', name: 'Intenção não está clara', first: 'Oi, preciso de uma informação da Bossa.' },
  { key: 'corretor', name: 'Corretor caiu no canal da Nara', first: 'Sou corretor e tenho um cliente interessado no Alma. Pode me mandar a tabela?' },
  { key: 'cliente_atual', name: 'Cliente atual pedindo ajuda', first: 'Já comprei uma unidade no Flow e preciso da segunda via do boleto.' },
  { key: 'fornecedor', name: 'Fornecedor oferecendo serviço', first: 'Bom dia, trabalhamos com esquadrias e gostaria de apresentar nossa empresa.' },
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
      ...NARA_TRIAGE_DEFAULTS,
      missao: 'Entender finalidade, tipologia, orçamento, decisor e prazo sem transformar a conversa em interrogatório.',
      empreendimentos: 'Flow Aptos e Alma Seahouses. Use somente informações confirmadas pela Bossa e nunca invente preços, disponibilidade, prazo ou condição comercial.',
      qualificacao: 'Depois da triagem confirmar que é possível comprador, identifique se é para morar ou investir, número de quartos, faixa de investimento, quem decide e quando pretende comprar.',
      agendamento: 'Quando houver interesse real, proponha visita ou videochamada e sinalize que o comercial dará continuidade.',
      escalonamento: 'Transfira quando houver proposta, pedido de reserva, negociação, reclamação, urgência, pergunta não confirmada ou preferência por atendimento humano.',
    },
  };
}

function withNaraDefaults(config: AgentConfig): AgentConfig {
  return {
    ...config,
    knowledge: {
      ...NARA_TRIAGE_DEFAULTS,
      ...config.knowledge,
    },
  };
}

function titleFromKey(key: string) {
  return key.replace('triagem_', '').replaceAll('_', ' ').toLocaleUpperCase('pt-BR');
}

function buildNaraPrompt(config: AgentConfig) {
  const triage = Object.entries(config.knowledge)
    .filter(([key, value]) => key.startsWith('triagem_') && !String(value).startsWith(NARA_PROMPT_MARKER))
    .map(([key, value]) => `## ${titleFromKey(key)}\n${value}`)
    .join('\n\n');
  const qualification = Object.entries(config.knowledge)
    .filter(([key]) => !key.startsWith('triagem_'))
    .map(([key, value]) => `## ${titleFromKey(key)}\n${value}`)
    .join('\n\n');

  return `${NARA_PROMPT_MARKER}

Você é a Nara, consultora de relacionamento da Bossa Empreendimentos, responsável pelo atendimento de clientes finais no WhatsApp.

# FORMA DE ATENDER
Nome: ${config.persona.name}
Papel: ${config.persona.role}
Tom: ${config.persona.tone}
Tamanho das mensagens: ${config.persona.length}
Emojis: ${config.persona.emojis}
Identidade: ${config.persona.identity}

# TRIAGEM — SEMPRE ANTES DA QUALIFICAÇÃO
${triage}

# PRIMEIRA MENSAGEM
Use como referência no começo de uma conversa nova:
“${config.first_message}”
Não repita a apresentação nas mensagens seguintes e adapte a abertura ao contexto real recebido.

# QUALIFICAÇÃO E CONHECIMENTO
${qualification}

# REGRAS GERAIS
- Responda sempre em português brasileiro.
- Leia o histórico inteiro e nunca repita uma pergunta já respondida.
- Faça uma pergunta por vez e mantenha a conversa natural.
- Nunca invente preço, disponibilidade, metragem, condição de pagamento, prazo de entrega ou informação comercial.
- Quando faltar uma informação confirmada, diga que o time da Bossa vai verificar.
- Transfira para atendimento humano em proposta, reserva, negociação, reclamação, urgência, assunto sensível ou pedido explícito.
- Não revele termos internos como classificação, etapa, triagem ou handoff ao contato.
- Use as correções salvas pelo gestor como exemplos prioritários de comportamento.`;
}

function buildPlantaoPrompt(config: AgentConfig, examples: TrainingExample[]) {
  const base = Object.entries(config.knowledge)
    .map(([key, value]) => `## ${titleFromKey(key)}\n${value}`)
    .join('\n\n');
  const learning = examples.slice(0, 30).map((item) => {
    if (item.rating === 'approved') return `Contato: ${item.user_message}\nResposta aprovada: ${item.assistant_message}`;
    if (item.rating === 'corrected' && item.correction) return `Contato: ${item.user_message}\nResposta enviada: ${item.assistant_message}\nResposta ideal: ${item.correction}`;
    if (item.rating === 'rejected' && item.notes) return `Contato: ${item.user_message}\nResposta que precisa melhorar: ${item.assistant_message}\nOrientação do gestor: ${item.notes}`;
    return '';
  }).filter(Boolean).join('\n\n');

  return `Você atende corretores parceiros fora do horário comercial. Nunca use nome próprio; identifique-se somente como o plantão da Bossa.

# PERSONA
Nome/identificação: ${config.persona.name}
Papel: ${config.persona.role}
Tom: ${config.persona.tone}
Tamanho: ${config.persona.length}
Emojis: ${config.persona.emojis}
Identidade: ${config.persona.identity}

# BASE DE CONHECIMENTO
${base}

# ABERTURA PADRÃO
${config.first_message}${learning ? `\n\n# EXEMPLOS E ORIENTAÇÕES DO GESTOR\n${learning}` : ''}

Responda em português brasileiro. Nunca invente dados. Quando não tiver certeza, encaminhe ao comercial.`;
}

function savedNaraPrompt(config: AgentConfig) {
  const stored = config.knowledge[NARA_PROMPT_STORAGE_KEY]?.trim() ?? '';
  return stored.startsWith(NARA_PROMPT_MARKER) ? stored : '';
}

function naraConfigWithPrompt(config: AgentConfig, prompt: string): AgentConfig {
  return {
    ...config,
    first_message: '',
    knowledge: {
      [NARA_PROMPT_STORAGE_KEY]: prompt.trim(),
    },
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'error' in data
      ? String((data as { error?: unknown }).error ?? 'Erro inesperado.')
      : 'Erro inesperado.';
    throw new Error(message);
  }
  return data as T;
}

export default function AgentTrainingPage() {
  const params = useParams<{ agente: string }>();
  const agent: Agent = params.agente === 'plantao' ? 'plantao' : 'nara';
  const isNara = agent === 'nara';
  const [tab, setTab] = useState<Tab>(isNara ? 'prompt' : 'simulador');
  const [config, setConfig] = useState<AgentConfig>(() => defaultConfig(agent));
  const [promptText, setPromptText] = useState('');
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scenario, setScenario] = useState('');
  const [input, setInput] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('rewrite');
  const [correctingIndex, setCorrectingIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [lastSimulation, setLastSimulation] = useState<SimulationResult | null>(null);

  const scenarios = isNara ? naraScenarios : plantaoScenarios;
  const plantaoPrompt = useMemo(() => buildPlantaoPrompt(config, examples), [config, examples]);
  const baseEntries = Object.entries(config.knowledge).filter(([key]) => !key.startsWith('triagem_'));
  const tabs: Array<{ key: Tab; label: string }> = isNara
    ? [
        { key: 'simulador', label: '🎭 Simulador' },
        { key: 'correcoes', label: `✏️ Correções (${examples.length})` },
        { key: 'prompt', label: '📄 Prompt final' },
      ]
    : [
        { key: 'simulador', label: '🎭 Simulador' },
        { key: 'persona', label: '🗣️ Personalidade' },
        { key: 'base', label: '📚 Base do corretor' },
        { key: 'correcoes', label: `✏️ Correções (${examples.length})` },
        { key: 'prompt', label: '📄 Prompt final' },
      ];

  useEffect(() => {
    let cancelled = false;

    async function loadTraining() {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError('');
      setNotice('');
      setTab(agent === 'nara' ? 'prompt' : 'simulador');
      setMessages([]);
      setScenario('');
      setFeedbackText('');
      setCorrectingIndex(null);
      setLastSimulation(null);

      try {
        const response = await fetch(`/api/ai-training?agent=${agent}`, { cache: 'no-store' });
        const data = await readJson<{ config: AgentConfig; examples: TrainingExample[]; ai?: AiStatus }>(response);
        if (cancelled) return;
        const loadedConfig = agent === 'nara' ? withNaraDefaults(data.config) : data.config;
        setConfig(loadedConfig);
        setPromptText(agent === 'nara' ? savedNaraPrompt(loadedConfig) || buildNaraPrompt(loadedConfig) : '');
        setExamples(data.examples);
        setAi(data.ai ?? null);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar o treinamento.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTraining();
    return () => { cancelled = true; };
  }, [agent]);

  function updatePersona(key: keyof Persona, value: string) {
    setConfig((current) => ({ ...current, persona: { ...current.persona, [key]: value } }));
  }

  function updateKnowledge(key: string, value: string) {
    setConfig((current) => ({ ...current, knowledge: { ...current.knowledge, [key]: value } }));
  }

  function openFeedback(index: number, mode: FeedbackMode, currentMessage: string) {
    setCorrectingIndex(index);
    setFeedbackMode(mode);
    setFeedbackText(mode === 'rewrite' ? currentMessage : '');
  }

  function closeFeedback() {
    setCorrectingIndex(null);
    setFeedbackText('');
  }

  async function saveConfig() {
    if (isNara && !promptText.trim()) {
      setError('O prompt final da Nara não pode ficar vazio.');
      setTab('prompt');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    const configToSave = isNara ? naraConfigWithPrompt(config, promptText) : config;
    try {
      await readJson<{ ok: boolean }>(await fetch('/api/ai-training', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agent, config: configToSave }),
      }));
      setConfig(configToSave);
      setNotice(isNara ? 'Prompt final da Nara salvo e aplicado ao simulador e ao atendimento.' : 'Configuração salva. O prompt final foi atualizado.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function requestReply(nextMessages: ChatMessage[]) {
    setSending(true);
    setError('');
    setNotice('');
    setLastSimulation(null);
    const simulationConfig = isNara ? naraConfigWithPrompt(config, promptText) : config;
    try {
      const data = await readJson<{ reply: string; source: 'openai'; classification: string; score: number; stage: string; handoff: boolean; attachments: SimulationResult['attachments'] }>(await fetch('/api/ai-training', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'simulate', agent, messages: nextMessages, scenario, config: simulationConfig }),
      }));
      setMessages([...nextMessages, { role: 'assistant', content: data.reply }]);
      setLastSimulation({
        classification: data.classification,
        score: data.score,
        stage: data.stage,
        handoff: data.handoff,
        attachments: data.attachments ?? [],
      });
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
    setFeedbackText('');
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

  async function saveExample(index: number, rating: TrainingExample['rating'], options?: { correction?: string; notes?: string }) {
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
          correction: options?.correction || null,
          notes: options?.notes || null,
        }),
      }));
      setExamples((current) => [data.example, ...current]);
      closeFeedback();
      setNotice(
        rating === 'approved'
          ? 'Resposta aprovada e adicionada ao treinamento.'
          : rating === 'corrected'
            ? 'Resposta reescrita e salva como exemplo ideal.'
            : 'Seu comentário foi salvo como orientação para a IA.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o exemplo.');
    }
  }

  async function saveFeedback(index: number) {
    const text = feedbackText.trim();
    if (!text) return;
    if (feedbackMode === 'rewrite') {
      await saveExample(index, 'corrected', { correction: text });
      return;
    }
    await saveExample(index, 'rejected', { notes: text });
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
    const currentPrompt = isNara ? promptText : plantaoPrompt;
    try {
      await navigator.clipboard.writeText(currentPrompt);
      setNotice('Prompt copiado.');
    } catch {
      setError('O navegador não permitiu copiar automaticamente.');
    }
  }

  const title = isNara ? 'Configurar a Nara' : 'Treinar o Plantão';
  const subtitle = isNara
    ? 'Simule conversas, registre correções e edite o prompt completo em um só lugar'
    : 'Atendimento de corretores fora do horário — sem nome próprio e sem promessas';

  return <>
    <PageTopbar
      title={title}
      subtitle={subtitle}
      actions={<button className="btn btn-primary btn-sm" onClick={saveConfig} disabled={saving || loading}>{saving ? 'Salvando...' : isNara ? 'Salvar prompt da Nara' : 'Salvar treinamento'}</button>}
    />
    <div className="page-content">
      {isNara
        ? <div className="info-box"><strong>Configuração centralizada:</strong> a triagem, a qualificação, a primeira mensagem, o tom e as regras da Nara estão dentro do Prompt final. O simulador usa inclusive as alterações ainda não salvas para você testar antes de gravar.</div>
        : <div className="info-box"><strong>O plantão não é a Nara com outro nome.</strong> A Nara conversa com quem compra. O plantão conversa com quem vende, destrava material, responde dúvidas e escala propostas.</div>}
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
            <div><strong>Conversa de treino</strong><div className="faint" style={{ fontSize: 10 }}>{isNara ? 'Testa o conteúdo atual do prompt, mesmo antes de salvar.' : 'Você interpreta o corretor e avalia a resposta.'}</div></div>
            <span className="connection-pill">{ai?.configured ? `OPENAI · ${ai.model}` : 'SEM API'}</span>
          </div>
          <div className="messages">
            {messages.length === 0 && <div className="empty-state">Escolha um cenário para começar.</div>}
            {messages.map((message, index) => <div key={`${index}-${message.content.slice(0, 12)}`} className={`message ${message.role === 'user' ? 'in' : 'out'}`}>
              {message.content}
              {message.role === 'assistant' && <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => saveExample(index, 'approved')}>👍 Aprovar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => openFeedback(index, 'rewrite', message.content)}>✏️ Reescrever resposta</button>
                <button className="btn btn-ghost btn-sm" onClick={() => openFeedback(index, 'comment', message.content)}>💬 Comentar o que mudar</button>
              </div>}
              {correctingIndex === index && <div style={{ marginTop: 9 }}>
                <div className="info-box" style={{ marginBottom: 8 }}>
                  {feedbackMode === 'rewrite'
                    ? <><strong>Reescreva a resposta:</strong> edite abaixo exatamente como ela deveria ter respondido.</>
                    : <><strong>Explique com suas palavras:</strong> diga o que ficou errado e como a IA deve agir nas próximas conversas.</>}
                </div>
                <textarea className="textarea" value={feedbackText} placeholder={feedbackMode === 'rewrite' ? 'Escreva a resposta ideal completa...' : 'Ex.: A Nara deveria confirmar a intenção antes de perguntar o orçamento.'} onChange={(event) => setFeedbackText(event.target.value)} />
                <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={closeFeedback}>Cancelar</button>
                  <button className="btn btn-primary btn-sm" onClick={() => saveFeedback(index)} disabled={!feedbackText.trim()}>{feedbackMode === 'rewrite' ? 'Salvar resposta corrigida' : 'Salvar comentário'}</button>
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
          {lastSimulation && <section className="card"><div className="card-head"><h3>Decisão da IA</h3></div><div className="card-body info-list">
            <div className="info-row"><span>Classificação</span><strong>{lastSimulation.classification}</strong></div>
            <div className="info-row"><span>Pontuação</span><strong>{lastSimulation.score}</strong></div>
            <div className="info-row"><span>Etapa</span><strong>{lastSimulation.stage}</strong></div>
            <div className="info-row"><span>Transfere humano</span><strong>{lastSimulation.handoff ? 'Sim' : 'Não'}</strong></div>
            <div className="info-row"><span>Arquivos</span><strong>{lastSimulation.attachments.length}</strong></div>
          </div></section>}
          <section className="card"><div className="card-head"><h3>Como treinar</h3></div><div className="card-body muted" style={{ lineHeight: 1.65, fontSize: 12 }}>Aprove quando estiver boa. Para ajustar, reescreva a resposta inteira ou comente o que deve mudar. Os dois formatos entram em Correções.</div></section>
        </aside>
      </div>}

      {!loading && !isNara && tab === 'persona' && <div className="grid grid-2">
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

      {!loading && !isNara && tab === 'base' && <div className="grid grid-2">
        {baseEntries.map(([key, value]) => <section className="card" key={key}><div className="card-head"><h3>{key.replaceAll('_', ' ')}</h3></div><div className="card-body"><textarea className="textarea" style={{ minHeight: 170 }} value={value} onChange={(event) => updateKnowledge(key, event.target.value)} /></div></section>)}
      </div>}

      {!loading && tab === 'correcoes' && <section className="card">
        <div className="card-head"><h3>Exemplos e orientações usados no treinamento</h3><span className="chip">{examples.length} registros</span></div>
        <div className="card-body">
          {examples.length === 0 ? <div className="empty-state">Ainda não há respostas aprovadas, reescritas ou comentadas.</div> : <div className="timeline">{examples.map((item) => <div className="timeline-item" key={item.id}>
            <div className="timeline-icon">{item.rating === 'approved' ? '👍' : item.rating === 'corrected' ? '✏️' : '💬'}</div>
            <div>
              <div className="timeline-title">{item.scenario || 'Conversa livre'} · {item.rating === 'approved' ? 'Aprovada' : item.rating === 'corrected' ? 'Resposta reescrita' : 'Comentário do gestor'}</div>
              <div className="timeline-desc">
                <strong>Contato:</strong> {item.user_message}<br />
                <strong>Resposta enviada:</strong> {item.assistant_message}
                {item.correction ? <><br /><strong>Resposta ideal:</strong> {item.correction}</> : null}
                {item.notes ? <><br /><strong>O que deve mudar:</strong> {item.notes}</> : null}
              </div>
              <div style={{ marginTop: 7 }}><button className="btn btn-ghost btn-sm" onClick={() => deleteExample(item.id)}>Excluir</button></div>
            </div>
          </div>)}</div>}
        </div>
      </section>}

      {!loading && tab === 'prompt' && <section className="card">
        <div className="card-head">
          <div><h3>Prompt final {isNara ? 'da Nara' : 'consolidado'}</h3>{isNara && <small className="muted">Edite diretamente aqui. Triagem, qualificação e primeira mensagem estão neste texto.</small>}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={copyPrompt}>Copiar prompt</button>
            {isNara && <button className="btn btn-primary btn-sm" onClick={saveConfig} disabled={saving || !promptText.trim()}>{saving ? 'Salvando...' : 'Salvar prompt'}</button>}
          </div>
        </div>
        <div className="card-body">
          <textarea
            className="textarea mono"
            style={{ minHeight: 680, fontSize: 12, lineHeight: 1.55, resize: 'vertical' }}
            value={isNara ? promptText : plantaoPrompt}
            readOnly={!isNara}
            onChange={isNara ? (event) => setPromptText(event.target.value) : undefined}
            spellCheck={false}
          />
          {isNara && <div className="info-box" style={{ marginTop: 12 }}>O botão <strong>Salvar prompt</strong> grava este conteúdo. O simulador usa o texto que está aberto agora, mesmo antes de salvar.</div>}
        </div>
      </section>}
    </div>
  </>;
}
