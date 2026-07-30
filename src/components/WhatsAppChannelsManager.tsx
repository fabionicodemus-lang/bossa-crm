'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type WhatsAppChannelSummary = {
  id: string;
  label: string;
  role: 'cliente' | 'corretor';
  provider: string;
  business_id: string | null;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  status: string;
  messaging_limit: string | null;
  registered_at: string | null;
  app_subscribed_at: string | null;
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppMonthlyCount = {
  channel_id: string;
  channel_label: string;
  role: 'cliente' | 'corretor';
  month: string;
  category: string;
  message_count: number;
};

type FormState = {
  label: string;
  role: 'cliente' | 'corretor';
  businessId: string;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
};

type Validation = {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimit: string | null;
};

function defaultLabel(role: 'cliente' | 'corretor') {
  return role === 'cliente' ? 'Clientes finais · Nara' : 'Corretores · Plantão';
}

function emptyForm(role: 'cliente' | 'corretor'): FormState {
  return {
    label: defaultLabel(role),
    role,
    businessId: '',
    wabaId: '',
    phoneNumberId: '',
    accessToken: '',
  };
}

function roleTitle(role: 'cliente' | 'corretor') {
  return role === 'cliente' ? 'Canal de clientes · Nara' : 'Canal de corretores · Plantão';
}

function statusLabel(status: string) {
  if (status === 'connected') return 'Conectado';
  if (status === 'pending_registration') return 'Aguardando registro';
  if (status === 'error') return 'Com erro';
  return 'Desconectado';
}

function categoryLabel(category: string) {
  if (category === 'service') return 'Serviço';
  if (category === 'marketing') return 'Marketing';
  if (category === 'utility') return 'Utilidade';
  if (category === 'authentication') return 'Autenticação';
  return category;
}

export function WhatsAppChannelsManager({
  initialChannels,
  monthlyCounts,
  migrationPending = false,
}: {
  initialChannels: WhatsAppChannelSummary[];
  monthlyCounts: WhatsAppMonthlyCount[];
  migrationPending?: boolean;
}) {
  const router = useRouter();
  const [channels, setChannels] = useState(initialChannels);
  const [form, setForm] = useState<FormState>(() => emptyForm('cliente'));
  const [formOpen, setFormOpen] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [registerChannelId, setRegisterChannelId] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setValidation(null);
    setError('');
    setSuccess('');
  }

  function openForm(role: 'cliente' | 'corretor', channel?: WhatsAppChannelSummary) {
    setForm(channel ? {
      label: channel.label,
      role: channel.role,
      businessId: channel.business_id ?? '',
      wabaId: channel.waba_id,
      phoneNumberId: channel.phone_number_id,
      accessToken: '',
    } : emptyForm(role));
    setValidation(null);
    setShowToken(false);
    setError('');
    setSuccess('');
    setFormOpen(true);
  }

  function replaceChannel(channel: WhatsAppChannelSummary) {
    setChannels((current) => [
      ...current.filter((item) => item.role !== channel.role),
      channel,
    ]);
  }

  async function submit(action: 'test' | 'save') {
    setLoading(action);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/meta/whatsapp/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...form }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        validation?: Validation;
        channel?: WhatsAppChannelSummary;
      };
      if (!response.ok || !payload.validation) {
        throw new Error(payload.error || 'Não foi possível validar os dados na Meta.');
      }
      setValidation(payload.validation);
      if (action === 'test') {
        setSuccess('Conexão testada na Graph API. O número pertence ao WABA informado.');
        return;
      }
      if (!payload.channel) throw new Error('O canal foi validado, mas não pôde ser salvo.');
      replaceChannel(payload.channel);
      setForm((current) => ({ ...current, accessToken: '' }));
      setShowToken(false);
      setSuccess('Canal salvo e webhook assinado. Agora registre o número com o PIN de seis dígitos.');
      setRegisterChannelId(payload.channel.id);
      setPin('');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível validar o canal.');
    } finally {
      setLoading(null);
    }
  }

  async function testSaved(channel: WhatsAppChannelSummary) {
    setLoading(`test-${channel.id}`);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/meta/whatsapp/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_saved', channelId: channel.id }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        channel?: WhatsAppChannelSummary;
      };
      if (!response.ok || !payload.channel) throw new Error(payload.error || 'Falha ao testar o canal.');
      replaceChannel(payload.channel);
      setSuccess(`Conexão de “${channel.label}” testada com sucesso na Meta.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao testar o canal.');
    } finally {
      setLoading(null);
    }
  }

  async function registerNumber(channelId: string) {
    setLoading(`register-${channelId}`);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/meta/whatsapp/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, pin }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        registeredAt?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível registrar o número.');
      setChannels((current) => current.map((channel) => channel.id === channelId ? {
        ...channel,
        status: 'connected',
        registered_at: payload.registeredAt ?? new Date().toISOString(),
      } : channel));
      setPin('');
      setRegisterChannelId(null);
      setSuccess('Número registrado e pronto para enviar e receber mensagens pela Cloud API.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar o número.');
    } finally {
      setLoading(null);
    }
  }

  const currentMonth = monthlyCounts[0]?.month
    ? new Date(monthlyCounts[0].month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : null;

  return <>
    {migrationPending && <div className="error-box" style={{ marginBottom: 14 }}>
      A migração 012 ainda não foi executada no Supabase. A tela está em modo de leitura e os novos canais só poderão ser salvos depois da migração.
    </div>}

    <div className="info-box" style={{ marginBottom: 14 }}>
      <strong>Desenvolvedor Direto · Cloud API.</strong> Os dois números são próprios da Bossa, usam uma WABA, um aplicativo Meta e token de Usuário do Sistema. O atendimento ocorre pelo CRM; não há Cadastro Incorporado, BSP ou Coexistência nesta fase.
    </div>

    <div className="grid grid-2">
      {(['cliente', 'corretor'] as const).map((role) => {
        const channel = channels.find((item) => item.role === role);
        return <section className="card" key={role}>
          <div className="card-head">
            <div>
              <h3>{roleTitle(role)}</h3>
              <small className="faint">{channel?.label ?? defaultLabel(role)}</small>
            </div>
            <span className={`connection-pill ${channel?.status === 'connected' ? '' : 'off'}`}>
              {channel ? statusLabel(channel.status) : 'Não configurado'}
            </span>
          </div>
          <div className="card-body">
            {!channel ? <>
              <p className="muted">{role === 'cliente' ? 'Número usado nos anúncios e no atendimento da Nara.' : 'Número dedicado ao relacionamento com corretores pelo Plantão.'}</p>
              <button className="btn btn-primary" disabled={migrationPending} onClick={() => openForm(role)}>Configurar canal</button>
            </> : <div className="info-list">
              <div className="info-row"><span>Número</span><strong>{channel.display_phone_number || '—'}</strong></div>
              <div className="info-row"><span>Nome verificado</span><strong>{channel.verified_name || '—'}</strong></div>
              <div className="info-row"><span>Qualidade</span><strong>{channel.quality_rating || '—'}</strong></div>
              <div className="info-row"><span>WABA ID</span><strong className="mono">{channel.waba_id}</strong></div>
              <div className="info-row"><span>Phone Number ID</span><strong className="mono">{channel.phone_number_id}</strong></div>
              <div className="info-row"><span>Limite de envio</span><strong>{channel.messaging_limit || 'Não informado pela Meta'}</strong></div>
              <div className="page-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" disabled={Boolean(loading) || migrationPending} onClick={() => void testSaved(channel)}>
                  {loading === `test-${channel.id}` ? 'Testando…' : 'Testar conexão'}
                </button>
                <button className="btn btn-ghost btn-sm" disabled={Boolean(loading) || migrationPending} onClick={() => openForm(role, channel)}>Editar credenciais</button>
                {channel.status !== 'connected' && <button className="btn btn-primary btn-sm" disabled={Boolean(loading) || migrationPending} onClick={() => { setRegisterChannelId(channel.id); setPin(''); setError(''); setSuccess(''); }}>
                  Registrar número
                </button>}
              </div>
            </div>}
          </div>
        </section>;
      })}
    </div>

    <div className="info-box" style={{ marginTop: 14 }}>
      <strong>Limite compartilhado.</strong> O campo <span className="mono">whatsapp_business_manager_messaging_limit</span> é calculado no nível do portfólio da Meta. Os dois números consomem o mesmo limite; um número pode utilizar a capacidade disponível para ambos.
    </div>

    {formOpen && <section className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <div><h3>Configurar canal pela Cloud API</h3><small className="faint">O token é usado apenas pelo servidor, criptografado e nunca devolvido ao navegador.</small></div>
        <button className="btn btn-ghost btn-sm" disabled={Boolean(loading)} onClick={() => setFormOpen(false)}>Fechar</button>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 14 }}>
        <div className="grid grid-2">
          <div className="field"><label>Rótulo</label><input className="input" value={form.label} onChange={(event) => update('label', event.target.value)} /></div>
          <div className="field"><label>Papel do canal</label><select className="select" value={form.role} onChange={(event) => update('role', event.target.value as FormState['role'])}><option value="cliente">Cliente · Nara</option><option value="corretor">Corretor · Plantão</option></select></div>
          <div className="field"><label>Business Manager ID <span className="faint">(opcional)</span></label><input className="input mono" inputMode="numeric" value={form.businessId} onChange={(event) => update('businessId', event.target.value.replace(/\D/g, ''))} /></div>
          <div className="field"><label>WABA ID</label><input className="input mono" inputMode="numeric" value={form.wabaId} onChange={(event) => update('wabaId', event.target.value.replace(/\D/g, ''))} /></div>
          <div className="field"><label>Phone Number ID</label><input className="input mono" inputMode="numeric" value={form.phoneNumberId} onChange={(event) => update('phoneNumberId', event.target.value.replace(/\D/g, ''))} /></div>
        </div>
        <div className="field">
          <label>Token do Usuário do Sistema</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input mono" type={showToken ? 'text' : 'password'} autoComplete="off" value={form.accessToken} onChange={(event) => update('accessToken', event.target.value.trim())} placeholder="Cole o token permanente da Meta" />
            <button className="btn btn-ghost" type="button" onClick={() => setShowToken((value) => !value)}>{showToken ? 'Ocultar' : 'Mostrar'}</button>
          </div>
        </div>
        {validation && <div className="success-box"><strong>Credenciais reconhecidas</strong><br />{validation.verifiedName || 'WhatsApp Business'} · {validation.displayPhoneNumber || validation.phoneNumberId} · Qualidade {validation.qualityRating || 'não informada'} · Limite {validation.messagingLimit || 'não informado'}</div>}
        <div className="page-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" disabled={Boolean(loading)} onClick={() => void submit('test')}>{loading === 'test' ? 'Testando…' : 'Testar conexão'}</button>
          <button className="btn btn-primary" disabled={Boolean(loading)} onClick={() => void submit('save')}>{loading === 'save' ? 'Salvando…' : 'Testar e salvar canal'}</button>
        </div>
      </div>
    </section>}

    {registerChannelId && <section className="card" style={{ marginTop: 14 }}>
      <div className="card-head"><div><h3>Registrar número na Cloud API</h3><small className="faint">Etapa obrigatória para o número enviar mensagens.</small></div><button className="btn btn-ghost btn-sm" onClick={() => { setRegisterChannelId(null); setPin(''); }}>Fechar</button></div>
      <div className="card-body">
        <div className="info-box" style={{ marginTop: 0, marginBottom: 14 }}>
          Crie ou informe o PIN de verificação em duas etapas com seis dígitos. O CRM guarda somente um hash para auditoria. Guarde o PIN original no gerenciador de senhas da Bossa, fora do sistema.
        </div>
        <div className="field" style={{ maxWidth: 320 }}><label>PIN de seis dígitos</label><input className="input mono" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
        <button className="btn btn-primary" disabled={Boolean(loading) || pin.length !== 6} onClick={() => void registerNumber(registerChannelId)}>{loading === `register-${registerChannelId}` ? 'Registrando…' : 'Registrar número'}</button>
      </div>
    </section>}

    {error && <div className="error-box" style={{ marginTop: 14 }}>{error}</div>}
    {success && <div className="success-box" style={{ marginTop: 14 }}>{success}</div>}

    <section className="card" style={{ marginTop: 14 }}>
      <div className="card-head"><div><h3>Mensagens enviadas por categoria</h3><small className="faint">{currentMonth ? `Contagem de ${currentMonth}` : 'A contagem aparecerá após os primeiros envios.'}</small></div></div>
      <div className="card-body">
        {monthlyCounts.length === 0 ? <div className="empty-state">Ainda não há mensagens categorizadas no período.</div> : <div className="table-wrap"><table><thead><tr><th>Canal</th><th>Categoria</th><th>Quantidade</th></tr></thead><tbody>{monthlyCounts.map((item) => <tr key={`${item.channel_id}-${item.category}`}><td>{item.channel_label}</td><td>{categoryLabel(item.category)}</td><td><strong>{Number(item.message_count).toLocaleString('pt-BR')}</strong></td></tr>)}</tbody></table></div>}
      </div>
    </section>
  </>;
}
