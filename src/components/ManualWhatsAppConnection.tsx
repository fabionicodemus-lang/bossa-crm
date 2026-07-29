'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Connection } from '@/components/WhatsAppSettings';

type Channel = 'clientes' | 'corretores';
type Action = 'test' | 'save';

type ManualForm = {
  channel: Channel;
  wabaId: string;
  phoneNumberId: string;
  businessId: string;
  accessToken: string;
};

type ManualValidation = {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
};

type ManualResponse = {
  error?: string;
  validation?: ManualValidation;
  connection?: Connection;
};

const emptyForm = (channel: Channel): ManualForm => ({
  channel,
  wabaId: '',
  phoneNumberId: '',
  businessId: '',
  accessToken: '',
});

function channelLabel(channel: Channel) {
  return channel === 'clientes' ? 'Clientes finais' : 'Corretores';
}

export function ManualWhatsAppConnection({ initialConnections }: { initialConnections: Connection[] }) {
  const router = useRouter();
  const [connections, setConnections] = useState(initialConnections);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ManualForm>(() => emptyForm('clientes'));
  const [validation, setValidation] = useState<ManualValidation | null>(null);
  const [loading, setLoading] = useState<Action | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const currentConnection = connections.find((item) => item.channel === form.channel);

  function update<K extends keyof ManualForm>(key: K, value: ManualForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setValidation(null);
    setError('');
    setSuccess('');
  }

  function start(channel: Channel = 'clientes') {
    setForm(emptyForm(channel));
    setValidation(null);
    setShowToken(false);
    setError('');
    setSuccess('');
    setOpen(true);
  }

  async function submit(action: Action) {
    setLoading(action);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/meta/whatsapp/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...form }),
      });
      const payload = await response.json().catch(() => ({})) as ManualResponse;
      if (!response.ok || !payload.validation) {
        throw new Error(payload.error || 'Não foi possível validar os dados na Meta.');
      }

      setValidation(payload.validation);
      if (action === 'test') {
        setSuccess('Credenciais validadas. O número pertence ao WABA informado e pode ser salvo neste canal.');
        return;
      }

      if (!payload.connection) throw new Error('A conexão foi validada, mas não pôde ser salva.');
      setConnections((current) => [
        ...current.filter((item) => item.channel !== form.channel),
        payload.connection as Connection,
      ]);
      setForm((current) => ({ ...current, accessToken: '' }));
      setShowToken(false);
      setSuccess(`Canal de ${channelLabel(form.channel).toLowerCase()} conectado pela Cloud API e inscrito nos webhooks da Meta.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível validar os dados na Meta.');
    } finally {
      setLoading(null);
    }
  }

  return <section className="card" style={{ marginTop: 14 }}>
    <div className="card-head">
      <div>
        <h3>Conexão provisória · Cloud API</h3>
        <small className="faint">Use para testar o CRM enquanto o Cadastro Incorporado da Meta não está liberado.</small>
      </div>
      {!open && <button className="btn btn-primary btn-sm" type="button" onClick={() => start()}>Configurar conexão manual</button>}
      {open && <button className="btn btn-ghost btn-sm" type="button" disabled={Boolean(loading)} onClick={() => setOpen(false)}>Fechar</button>}
    </div>

    {!open ? <div className="card-body">
      <div className="info-box" style={{ marginTop: 0 }}>
        Informe o <strong>WABA ID</strong>, o <strong>Phone Number ID</strong> e o <strong>token de acesso</strong> exibidos em WhatsApp → Configuração da API no painel da Meta. O CRM testa os dados na Meta antes de salvar.
      </div>
      <div className="page-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => start('clientes')}>Conectar número de teste aos clientes</button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => start('corretores')}>Conectar número de teste aos corretores</button>
      </div>
    </div> : <div className="card-body" style={{ display: 'grid', gap: 14 }}>
      <div className="info-box" style={{ marginTop: 0 }}>
        Este modo é indicado para o <strong>número de teste ou provisório da Cloud API</strong>. Ele não conecta um número que já está ativo no aplicativo WhatsApp Business em modo de coexistência.
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label>Canal do CRM</label>
          <select className="select" value={form.channel} onChange={(event) => update('channel', event.target.value as Channel)}>
            <option value="clientes">Clientes finais</option>
            <option value="corretores">Corretores</option>
          </select>
          <small className="faint">{currentConnection ? `Este canal está conectado a ${currentConnection.display_phone_number || currentConnection.verified_name || 'outro número'}. Ao salvar, ele será substituído.` : 'Este canal ainda não possui número conectado.'}</small>
        </div>
        <div className="field">
          <label>Business Manager ID <span className="faint">(opcional)</span></label>
          <input className="input mono" inputMode="numeric" value={form.businessId} onChange={(event) => update('businessId', event.target.value.replace(/\D/g, ''))} placeholder="Ex.: 123456789012345" />
        </div>
        <div className="field">
          <label>WhatsApp Business Account ID · WABA ID</label>
          <input className="input mono" inputMode="numeric" value={form.wabaId} onChange={(event) => update('wabaId', event.target.value.replace(/\D/g, ''))} placeholder="Ex.: 123456789012345" />
        </div>
        <div className="field">
          <label>Phone Number ID</label>
          <input className="input mono" inputMode="numeric" value={form.phoneNumberId} onChange={(event) => update('phoneNumberId', event.target.value.replace(/\D/g, ''))} placeholder="Ex.: 123456789012345" />
        </div>
      </div>

      <div className="field">
        <label>Token de acesso da Meta</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input mono"
            type={showToken ? 'text' : 'password'}
            autoComplete="off"
            value={form.accessToken}
            onChange={(event) => update('accessToken', event.target.value.trim())}
            placeholder="Cole o token temporário ou permanente"
          />
          <button className="btn btn-ghost" type="button" onClick={() => setShowToken((value) => !value)}>{showToken ? 'Ocultar' : 'Mostrar'}</button>
        </div>
        <small className="faint">O token é enviado somente ao servidor, criptografado antes de ser salvo e nunca retorna ao navegador.</small>
      </div>

      {validation && <div className="success-box">
        <strong>Credenciais reconhecidas pela Meta</strong><br />
        {validation.verifiedName || 'WhatsApp Business'} · {validation.displayPhoneNumber || validation.phoneNumberId} · Qualidade {validation.qualityRating || 'não informada'}
      </div>}
      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="page-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" type="button" disabled={Boolean(loading)} onClick={() => void submit('test')}>
          {loading === 'test' ? 'Testando na Meta…' : 'Testar credenciais'}
        </button>
        <button className="btn btn-primary" type="button" disabled={Boolean(loading)} onClick={() => void submit('save')}>
          {loading === 'save' ? 'Testando e salvando…' : 'Testar e salvar canal'}
        </button>
      </div>
    </div>}
  </section>;
}
