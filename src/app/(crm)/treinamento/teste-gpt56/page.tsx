'use client';

import { useEffect, useState } from 'react';
import { PageTopbar } from '@/components/PageTopbar';

type Scenario = { key: string; name: string };
type Message = { role: 'user' | 'assistant'; content: string };
type EvalResult = {
  key: string;
  name: string;
  conversation: Message[];
  models: string[];
  totals: {
    input_tokens: number;
    cached_tokens: number;
    cache_write_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    estimated_cost_usd: number;
    fallback_calls: number;
    compacted_calls: number;
  };
};

type Settings = {
  primary: string;
  fallback: string;
  reasoningEffort: string;
  maxOutputTokens: number;
  verbosity: string;
  timeoutMs: number;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data ? String(data.error) : 'Erro inesperado.';
    throw new Error(error);
  }
  return data as T;
}

export default function Gpt56EvalPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    readJson<{ scenarios: Scenario[]; settings: Settings }>(fetch('/api/ai-eval', { cache: 'no-store' }))
      .then((data) => { setScenarios(data.scenarios); setSettings(data.settings); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Falha ao carregar os testes.'));
  }, []);

  async function runSuite() {
    setRunning(true);
    setError('');
    setResults([]);
    const completed: EvalResult[] = [];
    try {
      for (let index = 0; index < scenarios.length; index += 1) {
        const scenario = scenarios[index];
        setProgress(`Executando ${index + 1} de ${scenarios.length}: ${scenario.name}`);
        const result = await readJson<EvalResult>(await fetch('/api/ai-eval', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scenario: scenario.key }),
        }));
        completed.push(result);
        setResults([...completed]);
      }
      setProgress('8 cenários concluídos.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha durante os testes.');
    } finally {
      setRunning(false);
    }
  }

  const totalCost = results.reduce((sum, item) => sum + item.totals.estimated_cost_usd, 0);
  const totalInput = results.reduce((sum, item) => sum + item.totals.input_tokens, 0);
  const totalCached = results.reduce((sum, item) => sum + item.totals.cached_tokens, 0);
  const totalOutput = results.reduce((sum, item) => sum + item.totals.output_tokens, 0);

  return <>
    <PageTopbar title="Teste GPT-5.6" subtitle="8 conversas reais usando o mesmo motor da Nara" />
    <div className="page-content">
      {error && <div className="error-box">{error}</div>}
      <div className="info-box">
        <strong>Configuração ativa:</strong> {settings ? `${settings.primary} · fallback ${settings.fallback} · reasoning ${settings.reasoningEffort} · saída máxima ${settings.maxOutputTokens}` : 'carregando...'}
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h3>Suíte de validação</h3>
          <button className="btn btn-primary" onClick={runSuite} disabled={running || scenarios.length !== 8}>
            {running ? 'Executando...' : 'Executar os 8 testes'}
          </button>
        </div>
        <div className="card-body">
          <p className="muted">Os cenários são executados um por vez para evitar picos de requisições. Nenhuma mensagem é enviada ao WhatsApp e nenhum lead real é alterado.</p>
          {progress && <div className="success-box">{progress}</div>}
          {results.length > 0 && <div className="info-list" style={{ marginTop: 12 }}>
            <div className="info-row"><span>Tokens de entrada</span><strong>{totalInput.toLocaleString('pt-BR')}</strong></div>
            <div className="info-row"><span>Tokens lidos do cache</span><strong>{totalCached.toLocaleString('pt-BR')}</strong></div>
            <div className="info-row"><span>Tokens de saída</span><strong>{totalOutput.toLocaleString('pt-BR')}</strong></div>
            <div className="info-row"><span>Custo estimado da suíte</span><strong>US$ {totalCost.toFixed(4)}</strong></div>
          </div>}
        </div>
      </section>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        {results.map((result) => <section className="card" key={result.key}>
          <div className="card-head"><h3>{result.name}</h3></div>
          <div className="card-body">
            <div className="messages" style={{ minHeight: 0, maxHeight: 'none', padding: 0 }}>
              {result.conversation.map((message, index) => <div key={`${result.key}-${index}`} className={`message ${message.role === 'user' ? 'in' : 'out'}`}>
                <small style={{ display: 'block', fontWeight: 700, marginBottom: 3 }}>{message.role === 'user' ? 'Lead' : 'Nara'}</small>
                {message.content}
              </div>)}
            </div>
            <div className="info-list" style={{ marginTop: 12 }}>
              <div className="info-row"><span>Modelo</span><strong>{result.models.join(', ')}</strong></div>
              <div className="info-row"><span>Entrada</span><strong>{result.totals.input_tokens.toLocaleString('pt-BR')}</strong></div>
              <div className="info-row"><span>Cache</span><strong>{result.totals.cached_tokens.toLocaleString('pt-BR')}</strong></div>
              <div className="info-row"><span>Saída</span><strong>{result.totals.output_tokens.toLocaleString('pt-BR')}</strong></div>
              <div className="info-row"><span>Custo estimado</span><strong>US$ {result.totals.estimated_cost_usd.toFixed(4)}</strong></div>
            </div>
          </div>
        </section>)}
      </div>
    </div>
  </>;
}
