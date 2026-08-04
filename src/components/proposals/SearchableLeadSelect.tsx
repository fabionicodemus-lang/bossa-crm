'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ProposalLead } from './model';

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function leadLabel(lead: ProposalLead) {
  return `${lead.name}${lead.company ? ` · ${lead.company}` : ''}`;
}

function leadDetails(lead: ProposalLead) {
  return [lead.phone, lead.enterprise, lead.group_name].filter(Boolean).join(' · ');
}

function leadSearchText(lead: ProposalLead) {
  return normalizeSearch([
    lead.name,
    lead.company,
    lead.phone,
    lead.enterprise,
    lead.group_name,
  ].filter(Boolean).join(' '));
}

function resultScore(lead: ProposalLead, term: string) {
  const name = normalizeSearch(lead.name);
  if (name === term) return 0;
  if (name.startsWith(term)) return 1;
  if (name.includes(term)) return 2;
  return 3;
}

export function SearchableLeadSelect({
  leads,
  value,
  onChange,
  disabled = false,
  placeholder = 'Digite para buscar…',
}: {
  leads: ProposalLead[];
  value: string;
  onChange: (leadId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const selectedLead = leads.find((lead) => lead.id === value) ?? null;
  const selectedLabel = selectedLead ? leadLabel(selectedLead) : '';
  const kind: ProposalLead['kind'] = selectedLead?.kind
    ?? leads[0]?.kind
    ?? (placeholder.toLocaleLowerCase('pt-BR').includes('imobiliária') ? 'corretor' : 'cliente');
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [remoteLeads, setRemoteLeads] = useState<ProposalLead[]>([]);
  const [loading, setLoading] = useState(false);
  const term = normalizeSearch(query);
  const showingSelectedValue = Boolean(selectedLead && query === selectedLabel);
  const canSearch = term.length >= 2 && !showingSelectedValue;

  useEffect(() => {
    if (!open || !canSearch) return undefined;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/leads/search?kind=${kind}&q=${encodeURIComponent(query.trim())}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Não foi possível buscar os leads.');
        const payload = await response.json() as { leads?: ProposalLead[] };
        setRemoteLeads(payload.leads ?? []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setRemoteLeads([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 60);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canSearch, kind, open, query]);

  const filteredLeads = useMemo(() => {
    if (showingSelectedValue && selectedLead) return [selectedLead];
    if (!canSearch) return [];

    const merged = new Map<string, ProposalLead>();
    for (const lead of remoteLeads) merged.set(lead.id, lead);
    for (const lead of leads) {
      if (leadSearchText(lead).includes(term)) merged.set(lead.id, lead);
    }

    return [...merged.values()]
      .sort((first, second) => {
        const scoreDifference = resultScore(first, term) - resultScore(second, term);
        return scoreDifference || first.name.localeCompare(second.name, 'pt-BR');
      })
      .slice(0, 40);
  }, [canSearch, leads, remoteLeads, selectedLead, showingSelectedValue, term]);

  function selectLead(lead: ProposalLead) {
    setQuery(leadLabel(lead));
    setOpen(false);
    setActiveIndex(0);
    setRemoteLeads([]);
    onChange(lead.id);
  }

  return <div style={{ position: 'relative' }}>
    <input
      className="input"
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls="proposal-lead-options"
      value={query}
      placeholder={placeholder}
      autoComplete="off"
      disabled={disabled}
      onFocus={(event) => {
        setOpen(true);
        setActiveIndex(0);
        event.currentTarget.select();
      }}
      onChange={(event) => {
        setQuery(event.target.value);
        setRemoteLeads([]);
        setOpen(true);
        setActiveIndex(0);
      }}
      onBlur={() => window.setTimeout(() => {
        setOpen(false);
        setQuery(selectedLabel);
      }, 160)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setOpen(true);
          setActiveIndex((current) => Math.min(current + 1, Math.max(0, filteredLeads.length - 1)));
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActiveIndex((current) => Math.max(0, current - 1));
        } else if (event.key === 'Enter') {
          event.preventDefault();
          const lead = filteredLeads[Math.min(activeIndex, Math.max(0, filteredLeads.length - 1))];
          if (lead) selectLead(lead);
        } else if (event.key === 'Escape') {
          setOpen(false);
          setQuery(selectedLabel);
        }
      }}
    />

    {open && !disabled && <div
      id="proposal-lead-options"
      role="listbox"
      style={{
        position: 'absolute',
        isolation: 'isolate',
        zIndex: 100,
        top: 'calc(100% + 4px)',
        left: 0,
        right: 0,
        maxHeight: 320,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        border: '1px solid #d8d2c8',
        borderRadius: 10,
        backgroundColor: '#ffffff',
        color: '#2c2925',
        boxShadow: '0 16px 36px rgba(36, 30, 24, 0.22)',
      }}
    >
      {!canSearch && !showingSelectedValue
        ? <div className="faint" style={{ padding: 12, backgroundColor: '#ffffff' }}>Digite ao menos 2 letras para buscar.</div>
        : loading && filteredLeads.length === 0
          ? <div className="faint" style={{ padding: 12, backgroundColor: '#ffffff' }}>Buscando…</div>
          : filteredLeads.length === 0
            ? <div className="faint" style={{ padding: 12, backgroundColor: '#ffffff' }}>Nenhum resultado encontrado.</div>
            : filteredLeads.map((lead, index) => <button
                key={lead.id}
                type="button"
                role="option"
                aria-selected={lead.id === value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectLead(lead);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                style={{
                  display: 'block',
                  width: '100%',
                  height: 'auto',
                  minHeight: 58,
                  boxSizing: 'border-box',
                  border: 0,
                  borderBottom: index < filteredLeads.length - 1 ? '1px solid #e6e1d9' : 0,
                  padding: '10px 12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  backgroundColor: index === activeIndex ? '#f3efe9' : '#ffffff',
                  color: '#2c2925',
                  font: 'inherit',
                  lineHeight: 1.3,
                  whiteSpace: 'normal',
                  overflow: 'visible',
                }}
              >
                <strong style={{ display: 'block', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{leadLabel(lead)}</strong>
                {leadDetails(lead) && <small className="faint" style={{ display: 'block', marginTop: 4, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{leadDetails(lead)}</small>}
              </button>)}
    </div>}
  </div>;
}
