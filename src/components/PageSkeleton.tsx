// Esqueleto exibido instantaneamente ao trocar de tela, enquanto o servidor
// busca os dados. Mostra o título real para o usuário saber onde está.
type Variant = 'board' | 'dashboard' | 'list' | 'detail' | 'chat' | 'plain';

function Bar({ w, h = 12 }: { w: string; h?: number }) {
  return <span className="sk-bar" style={{ width: w, height: h }} />;
}

function Board() {
  const columns = [4, 3, 5, 2, 3];
  return (
    <div className="sk-board">
      {columns.map((cards, col) => (
        <div className="sk-column" key={col}>
          <Bar w="55%" h={13} />
          {Array.from({ length: cards }, (_, i) => (
            <div className="sk-card" key={i}>
              <Bar w="70%" />
              <Bar w="45%" h={10} />
              <Bar w="85%" h={10} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  return (
    <>
      <div className="sk-stats">
        {Array.from({ length: 5 }, (_, i) => (
          <div className="sk-panel" key={i}><Bar w="50%" h={10} /><Bar w="35%" h={26} /></div>
        ))}
      </div>
      <div className="sk-split">
        <div className="sk-panel sk-tall"><Bar w="30%" h={13} />{Array.from({ length: 6 }, (_, i) => <Bar key={i} w={`${90 - i * 8}%`} h={10} />)}</div>
        <div className="sk-panel sk-tall"><Bar w="40%" h={13} />{Array.from({ length: 6 }, (_, i) => <Bar key={i} w={`${60 + (i % 3) * 12}%`} h={10} />)}</div>
      </div>
    </>
  );
}

function List() {
  return (
    <div className="sk-panel">
      {Array.from({ length: 8 }, (_, i) => (
        <div className="sk-row" key={i}>
          <Bar w="28%" /><Bar w="18%" h={10} /><Bar w="22%" h={10} />
        </div>
      ))}
    </div>
  );
}

function Detail() {
  return (
    <div className="sk-split sk-detail">
      <div className="sk-panel sk-tall">{Array.from({ length: 7 }, (_, i) => <Bar key={i} w={`${80 - (i % 3) * 15}%`} h={i === 0 ? 18 : 10} />)}</div>
      <Chat />
    </div>
  );
}

function Chat() {
  return (
    <div className="sk-panel sk-tall sk-chat">
      {Array.from({ length: 6 }, (_, i) => (
        <span className={`sk-bubble ${i % 2 ? 'sk-out' : ''}`} key={i} style={{ width: `${40 + (i * 13) % 35}%` }} />
      ))}
    </div>
  );
}

export function PageSkeleton({ title, subtitle, variant = 'plain' }: { title?: string; subtitle?: string; variant?: Variant }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <header className="topbar">
        <div>
          {title ? <h1>{title}</h1> : <Bar w="180px" h={20} />}
          {subtitle ? <p>{subtitle}</p> : <p><Bar w="260px" h={10} /></p>}
        </div>
      </header>
      <div className="page-content">
        <span className="sk-sr">Carregando…</span>
        {variant === 'board' && <Board />}
        {variant === 'dashboard' && <Dashboard />}
        {variant === 'list' && <List />}
        {variant === 'detail' && <Detail />}
        {variant === 'chat' && <Chat />}
        {variant === 'plain' && <List />}
      </div>
    </div>
  );
}
