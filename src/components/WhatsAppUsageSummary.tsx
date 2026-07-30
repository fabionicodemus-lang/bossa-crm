export type WhatsAppMonthlyCount = {
  channel_id: string;
  channel_label: string;
  role: 'cliente' | 'corretor';
  month: string;
  category: string;
  message_count: number;
};

function categoryLabel(category: string) {
  if (category === 'service') return 'Serviço';
  if (category === 'marketing') return 'Marketing';
  if (category === 'utility') return 'Utilidade';
  if (category === 'authentication') return 'Autenticação';
  return category;
}

export function WhatsAppUsageSummary({ counts }: { counts: WhatsAppMonthlyCount[] }) {
  const currentMonth = counts[0]?.month
    ? new Date(counts[0].month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : null;

  return <section className="card" style={{ marginTop: 14 }}>
    <div className="card-head">
      <div>
        <h3>Mensagens enviadas pela API</h3>
        <small className="faint">
          {currentMonth ? `Contagem de ${currentMonth}` : 'A contagem aparecerá após os primeiros envios.'}
        </small>
      </div>
    </div>
    <div className="card-body">
      <div className="info-box" style={{ marginTop: 0, marginBottom: 14 }}>
        Mensagens enviadas diretamente pelo aplicativo WhatsApp Business aparecem no histórico do CRM, mas não entram nesta contagem de API.
      </div>
      {counts.length === 0
        ? <div className="empty-state">Ainda não há mensagens da API categorizadas no período.</div>
        : <div className="table-wrap">
          <table>
            <thead><tr><th>Canal</th><th>Categoria</th><th>Quantidade</th></tr></thead>
            <tbody>
              {counts.map((item) => <tr key={`${item.channel_id}-${item.category}`}>
                <td>{item.channel_label}</td>
                <td>{categoryLabel(item.category)}</td>
                <td><strong>{Number(item.message_count).toLocaleString('pt-BR')}</strong></td>
              </tr>)}
            </tbody>
          </table>
        </div>}
    </div>
  </section>;
}