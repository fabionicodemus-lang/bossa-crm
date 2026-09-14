'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Schedule = boolean[][];

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TIMEZONE = 'America/Sao_Paulo';

function defaultSchedule(): Schedule {
  return Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => day === 0 || day === 6 || hour >= 18 || hour < 8),
  );
}

function normalizeSchedule(value: unknown): Schedule {
  if (!Array.isArray(value) || value.length !== 7) return defaultSchedule();
  const normalized = value.map((day) => {
    if (!Array.isArray(day) || day.length !== 24) return null;
    return day.map(Boolean);
  });
  return normalized.some((day) => !day) ? defaultSchedule() : normalized as Schedule;
}

function currentSlot(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: dayMap[weekday] ?? 0, hour: Number.isFinite(hour) ? hour : 0 };
}

export function PlantaoScheduleManager({ organizationId, userId }: { organizationId: string; userId: string }) {
  const [schedule, setSchedule] = useState<Schedule>(defaultSchedule);
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('ai_agent_configs')
        .select('active,schedule,schedule_timezone')
        .eq('organization_id', organizationId)
        .eq('agent', 'plantao')
        .maybeSingle();
      if (cancelled) return;
      if (error) setMessage(error.message);
      if (data) {
        setActive(data.active !== false);
        setSchedule(normalizeSchedule(data.schedule));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  const activeHours = useMemo(() => schedule.flat().filter(Boolean).length, [schedule]);
  const now = currentSlot(TIMEZONE);
  const activeNow = active && Boolean(schedule[now.day]?.[now.hour]);

  function toggleHour(day: number, hour: number) {
    setSchedule((current) => current.map((row, dayIndex) =>
      dayIndex === day ? row.map((value, hourIndex) => hourIndex === hour ? !value : value) : row,
    ));
    setMessage('');
  }

  function toggleDay(day: number) {
    setSchedule((current) => current.map((row, dayIndex) => {
      if (dayIndex !== day) return row;
      const turnOn = !row.every(Boolean);
      return row.map(() => turnOn);
    }));
    setMessage('');
  }

  function preset(kind: 'night' | 'weekend' | 'always' | 'off') {
    setSchedule(Array.from({ length: 7 }, (_, day) => Array.from({ length: 24 }, (_, hour) => {
      if (kind === 'always') return true;
      if (kind === 'off') return false;
      if (kind === 'weekend') return day === 0 || day === 6;
      return day === 0 || day === 6 || hour >= 18 || hour < 8;
    })));
    setMessage('');
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const supabase = createClient();
      const { error } = await supabase.from('ai_agent_configs').upsert({
        organization_id: organizationId,
        agent: 'plantao',
        active,
        schedule,
        schedule_timezone: TIMEZONE,
        updated_by: userId,
      }, { onConflict: 'organization_id,agent' });
      if (error) throw error;
      setMessage('Configuração salva. O próximo contato de corretor já obedecerá estes horários.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a configuração.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="plantao-loading">Carregando configuração do Plantão…</div>;

  return <div className="plantao-wrap">
    <section className="plantao-summary">
      <div>
        <span className={`plantao-dot ${activeNow ? 'on' : ''}`} />
        <div>
          <strong>{activeNow ? 'Plantão IA está atendendo agora' : 'Agora é atendimento humano'}</strong>
          <p>{DAYS[now.day]}, {String(now.hour).padStart(2, '0')}h · horário de Brasília</p>
        </div>
      </div>
      <label className="plantao-switch">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        <span />
        <b>{active ? 'Plantão automático ligado' : 'Plantão automático desligado'}</b>
      </label>
    </section>

    <section className="plantao-card">
      <header>
        <div>
          <h2>Quando a IA responde os corretores</h2>
          <p>Clique em cada hora. Verde = Plantão IA. Cinza = a conversa fica para o time comercial.</p>
        </div>
        <div className="plantao-presets">
          <button type="button" onClick={() => preset('night')}>18h–8h + fins de semana</button>
          <button type="button" onClick={() => preset('weekend')}>Só fins de semana</button>
          <button type="button" onClick={() => preset('always')}>24h</button>
          <button type="button" onClick={() => preset('off')}>Limpar</button>
        </div>
      </header>

      <div className="plantao-grid-scroll">
        <div className="plantao-grid">
          <div className="plantao-row plantao-hours">
            <div className="plantao-day" />
            {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="plantao-hour">{hour}</div>)}
          </div>
          {schedule.map((row, day) => <div className="plantao-row" key={DAYS[day]}>
            <button type="button" className={`plantao-day ${day === 0 || day === 6 ? 'weekend' : ''}`} onClick={() => toggleDay(day)}>{DAYS[day]}</button>
            {row.map((enabled, hour) => <button
              type="button"
              key={`${day}-${hour}`}
              title={`${DAYS[day]} ${hour}h · ${enabled ? 'Plantão IA' : 'Comercial'}`}
              aria-label={`${DAYS[day]} ${hour}h`}
              className={`plantao-cell ${enabled ? 'on' : ''} ${now.day === day && now.hour === hour ? 'now' : ''}`}
              onClick={() => toggleHour(day, hour)}
            />)}
          </div>)}
        </div>
      </div>

      <footer>
        <div className="plantao-legend">
          <span><i className="ai" /> IA no comando · <b>{activeHours}h/semana</b></span>
          <span><i /> Time comercial · <b>{168 - activeHours}h/semana</b></span>
          <span>Fuso: <b>Brasília · {TIMEZONE}</b></span>
        </div>
        <button className="plantao-save" type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar horários'}</button>
      </footer>
      {message && <div className="plantao-message">{message}</div>}
    </section>

    <section className="plantao-help">
      <strong>Como funciona</strong>
      <p>Dentro das horas verdes, uma nova mensagem de corretor fica com o Plantão IA. Fora delas, a IA não responde e a conversa fica disponível para o comercial. Se você responder manualmente pelo WhatsApp Corretores, aquela conversa é assumida pelo humano para evitar resposta duplicada.</p>
    </section>

    <style jsx>{`
      .plantao-wrap{display:flex;flex-direction:column;gap:16px;max-width:1500px}.plantao-loading{padding:28px;color:#6f675f}.plantao-summary,.plantao-card,.plantao-help{background:#fff;border:1px solid #e3ded7;border-radius:14px;box-shadow:0 6px 22px rgba(60,48,36,.05)}
      .plantao-summary{padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:18px}.plantao-summary>div{display:flex;align-items:center;gap:12px}.plantao-summary strong{font-size:15px;color:#2c2824}.plantao-summary p{margin:3px 0 0;font-size:12px;color:#81786f}.plantao-dot{width:12px;height:12px;border-radius:50%;background:#a49d95;box-shadow:0 0 0 5px #f0ece7}.plantao-dot.on{background:#258c5a;box-shadow:0 0 0 5px #e2f3e9}
      .plantao-switch{display:flex;align-items:center;gap:10px;cursor:pointer;color:#4b443e;font-size:12px}.plantao-switch input{position:absolute;opacity:0}.plantao-switch span{width:42px;height:24px;border-radius:999px;background:#c9c3bc;position:relative;transition:.2s}.plantao-switch span:after{content:'';position:absolute;width:18px;height:18px;border-radius:50%;background:#fff;top:3px;left:3px;box-shadow:0 1px 3px #0003;transition:.2s}.plantao-switch input:checked+span{background:#258c5a}.plantao-switch input:checked+span:after{transform:translateX(18px)}
      .plantao-card{overflow:hidden}.plantao-card header{padding:18px 20px 14px;display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:1px solid #eee9e3}.plantao-card h2{font-size:17px;margin:0;color:#2d2925}.plantao-card header p{font-size:12px;color:#7c746c;margin:5px 0 0}.plantao-presets{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.plantao-presets button{border:1px solid #d9d3cc;background:#faf8f5;border-radius:8px;padding:7px 9px;color:#5f574f;font-size:11px;font-weight:700;cursor:pointer}.plantao-presets button:hover{background:#f0ece7}
      .plantao-grid-scroll{padding:18px 20px;overflow-x:auto}.plantao-grid{min-width:960px;display:flex;flex-direction:column;gap:5px}.plantao-row{display:grid;grid-template-columns:58px repeat(24,minmax(28px,1fr));gap:4px;align-items:center}.plantao-day{height:27px;border:0;background:transparent;text-align:left;font-size:11px;font-weight:800;color:#5f574f;cursor:pointer}.plantao-day.weekend{color:#9a5d25}.plantao-hour{text-align:center;font-size:9px;color:#9a9189}.plantao-cell{height:27px;border:1px solid #ded8d1;border-radius:5px;background:#f5f2ee;cursor:pointer;position:relative}.plantao-cell:hover{border-color:#8f877e}.plantao-cell.on{background:#2e9363;border-color:#2e9363}.plantao-cell.now:after{content:'';position:absolute;inset:3px;border:2px solid #f2b34d;border-radius:3px}.plantao-hours{margin-bottom:2px}
      .plantao-card footer{padding:14px 20px;border-top:1px solid #eee9e3;display:flex;align-items:center;justify-content:space-between;gap:18px;background:#fcfbf9}.plantao-legend{display:flex;align-items:center;gap:20px;flex-wrap:wrap;font-size:11px;color:#70685f}.plantao-legend span{display:flex;align-items:center;gap:5px}.plantao-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;background:#f0ece7;border:1px solid #d8d2cb}.plantao-legend i.ai{background:#2e9363;border-color:#2e9363}.plantao-save{border:0;border-radius:9px;background:#1f6b52;color:#fff;padding:10px 15px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}.plantao-save:disabled{opacity:.6;cursor:wait}.plantao-message{margin:0 20px 16px;padding:10px 12px;border-radius:8px;background:#edf6f1;color:#31634e;font-size:12px}.plantao-help{padding:16px 18px}.plantao-help strong{font-size:13px;color:#403a35}.plantao-help p{font-size:12px;color:#756d65;line-height:1.55;margin:5px 0 0;max-width:1000px}
      @media(max-width:900px){.plantao-summary,.plantao-card header,.plantao-card footer{align-items:flex-start;flex-direction:column}.plantao-presets{justify-content:flex-start}.plantao-save{width:100%}.plantao-switch{align-self:flex-start}}
    `}</style>
  </div>;
}
