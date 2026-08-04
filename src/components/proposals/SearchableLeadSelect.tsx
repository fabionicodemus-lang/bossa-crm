'use client';

import { useMemo, useState } from 'react';
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
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredLeads = useMemo(() => {
    const term = normalizeSearch(query);
    if (!term || (selectedLead && query === selectedLabel)) return leads.slice(0, 40);
    return leads.filter((lead) => normalizeSearch([
      lead.name,
      lead.company,
      lead.phone,
      lead.enterprise,
      lead.group_name,
    ].filter(Boolean).join(' ')).includes(term)).slice(0, 40);
  }, [leads, query, selectedLabel, selectedLead]);

  function selectLead(lead: ProposalLead) {
    setQuery(leadLabel(lead));
    setOpen(false);
    setActiveIndex(0);
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
        setOpen(true);
        setActiveIndex(0);
      }}
      onBlur={() => window.setTimeout(() => {
        setOpen(false);
        setQuery(selectedLabel);
      }, 120)}
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
          const lead = filteredLeads[activeIndex];
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
        zIndex: 30,
        top: 'calc(100% + 4px)',
        left: 0,
        right: 0,
        maxHeight: 280,
        overflowY: 'auto',
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--card)',
        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.16)',
      }}
    >
      {filteredLeads.length === 0
        ? <div className="faint" style={{ padding: 12 }}>Nenhum resultado encontrado.</div>
        : filteredLeads.map((lead, index) => <button
            key={lead.id}
            type="button"
            role="option"
            aria-selected={lead.id === value}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => selectLead(lead)}
            style={{
              width: '100%',
              border: 0,
              borderBottom: index < filteredLeads.length - 1 ? '1px solid var(--border)' : 0,
              padding: '10px 12px',
              textAlign: 'left',
              cursor: 'pointer',
              background: index === activeIndex ? 'var(--bg)' : 'transparent',
              color: 'inherit',
            }}
          >
            <strong style={{ display: 'block' }}>{leadLabel(lead)}</strong>
            {leadDetails(lead) && <small className="faint">{leadDetails(lead)}</small>}
          </button>)}
    </div>}
  </div>;
}
