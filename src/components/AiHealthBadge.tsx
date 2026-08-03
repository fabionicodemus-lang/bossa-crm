'use client';

import { useEffect, useState } from 'react';

type AiTrainingStatus = {
  configured?: boolean;
};

type AiTrainingResponse = {
  ai?: AiTrainingStatus;
  error?: string;
};

type Props = {
  lastSuccessAt: string | null;
};

function formatSuccess(value: string | null) {
  if (!value) return 'Nenhuma resposta bem-sucedida registrada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Última resposta sem data válida';
  return `Última resposta: ${new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)}`;
}

export function AiHealthBadge({ lastSuccessAt }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;

    fetch('/api/ai-training?agent=nara', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as AiTrainingResponse;
        if (!response.ok) throw new Error(data.error || 'Não foi possível consultar a IA.');
        if (active) setConfigured(Boolean(data.ai?.configured));
      })
      .catch(() => {
        if (active) setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const state = loadError
    ? { label: 'Saúde da IA indisponível', color: 'var(--red)' }
    : configured === null
      ? { label: 'Verificando IA…', color: 'var(--muted)' }
      : configured
        ? { label: 'IA configurada', color: 'var(--green)' }
        : { label: 'IA sem chave configurada', color: 'var(--red)' };

  return (
    <div
      aria-live="polite"
      title={formatSuccess(lastSuccessAt)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: '7px 11px',
        background: 'var(--surface)',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: state.color }} />
      <span style={{ display: 'grid', lineHeight: 1.15 }}>
        <strong style={{ fontSize: 12 }}>{state.label}</strong>
        <small style={{ color: 'var(--muted)', fontSize: 10 }}>{formatSuccess(lastSuccessAt)}</small>
      </span>
    </div>
  );
}
