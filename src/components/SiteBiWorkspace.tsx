'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowDownUp, BarChart3, ChevronDown, ChevronLeft, ChevronRight, Download, Filter, Plus, RefreshCw, Table2, X } from 'lucide-react';
import { AMBIENTES_SITE, type AmbienteSite } from '@/lib/site-analytics';
import {
  compararDimensao, DIMENSOES_BI, formatarDimensao, linhaCsvBi, MAX_LINHAS_BI,
  METRICAS_BI, nomeDimensao, nomeMetrica, periodoBi, validarConfigBi, valorBi,
  type ConfigBi, type DimensaoBi, type MetricaBi, type ResultadoBi,
} from '@/lib/site-bi';
import styles from './SiteBiWorkspace.module.css';

const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [365, '12 meses']] as const;
const FILTROS_INICIAIS: DimensaoBi[] = ['origem', 'cidade', 'estado'];
const num = (n: number) => n.toLocaleString('pt-BR');

function FiltroValores({ campo, opcoes, selecionados, onChange, onRemove }: {
  campo: DimensaoBi; opcoes: string[]; selecionados: string[];
  onChange: (valores: string[]) => void; onRemove: () => void;
}) {
  const [busca, setBusca] = useState('');
  const conjunto = new Set(selecionados);
  const lista = [...new Set([...opcoes, ...selecionados])].filter((v) =>
    formatarDimensao(campo, v).toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')));
  const descricao = selecionados.length === 1 ? formatarDimensao(campo, selecionados[0])
    : selecionados.length ? `${selecionados.length} selecionados` : 'Todos';
  return (
    <div className={styles.filter}>
      <details className={styles.filterDetails}>
        <summary>
          <span><strong>{nomeDimensao(campo)}</strong><small title={descricao}>{descricao}</small></span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className={styles.filterBody}>
          <input className="input" type="search" aria-label={`Buscar ${nomeDimensao(campo).toLowerCase()}`}
            placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>Todos os valores</button>
          <div className={styles.filterOptions}>
            {lista.length === 0 ? <span className="muted">Nenhum valor encontrado.</span> : lista.map((valor) => (
              <label className={styles.check} key={valor}>
                <input type="checkbox" checked={conjunto.has(valor)} onChange={() =>
                  onChange(conjunto.has(valor) ? selecionados.filter((v) => v !== valor) : [...selecionados, valor])} />
                <span>{formatarDimensao(campo, valor)}</span>
              </label>
            ))}
          </div>
        </div>
      </details>
      <button className={styles.iconButton} type="button" title={`Remover filtro de ${nomeDimensao(campo)}`}
        aria-label={`Remover filtro de ${nomeDimensao(campo)}`} onClick={onRemove}><X size={14} /></button>
    </div>
  );
}

function DimensaoSelect({ label, value, indisponiveis, placeholder, onChange }: {
  label: string; value: DimensaoBi | ''; indisponiveis: DimensaoBi[];
  placeholder?: string; onChange: (d: DimensaoBi | '') => void;
}) {
  return (
    <select className="select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as DimensaoBi | '')}>
      <option value="">{placeholder ?? 'Nenhuma'}</option>
      {DIMENSOES_BI.filter(([d]) => d === value || !indisponiveis.includes(d)).map(([d, nome]) =>
        <option key={d} value={d}>{nome}</option>)}
    </select>
  );
}

function valoresCelula(linha: ResultadoBi['linhas'][number], coluna: string, metricas: MetricaBi[]) {
  return Object.hasOwn(linha.celulas, coluna) ? linha.celulas[coluna] : metricas.map((m) => m === 'conversao' ? null : 0);
}

function exportarBi(resultado: ResultadoBi, linhas: ResultadoBi['linhas']) {
  const { config, colunas } = resultado;
  const eixos = config.linhas.length ? config.linhas.map(nomeDimensao) : ['Grupo'];
  const cabecalho = [...eixos];
  if (config.coluna) for (const c of colunas) {
    for (const m of config.metricas) cabecalho.push(`${formatarDimensao(config.coluna, c.id)} · ${nomeMetrica(m)}`);
  }
  cabecalho.push(...config.metricas.map((m) => config.coluna ? `Total · ${nomeMetrica(m)}` : nomeMetrica(m)));
  const formatar = (valores: (number | null)[]) => valores.map((v, i) =>
    v == null ? '' : v.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 1 }) + (config.metricas[i] === 'conversao' ? '%' : ''));
  const arquivo = [linhaCsvBi(cabecalho)];
  for (const l of linhas) {
    const campos = config.linhas.length ? l.rotulos.map((v, i) => formatarDimensao(config.linhas[i], v)) : ['Total'];
    for (const c of colunas) campos.push(...formatar(valoresCelula(l, c.id, config.metricas)));
    campos.push(...formatar(l.total));
    arquivo.push(linhaCsvBi(campos));
  }
  const total = ['Total geral', ...eixos.slice(1).map(() => '')];
  for (const c of colunas) total.push(...formatar(c.total));
  total.push(...formatar(resultado.total));
  if (config.linhas.length) arquivo.push(linhaCsvBi(total));
  const url = URL.createObjectURL(new Blob(['\ufeff', arquivo.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `bossa-site-bi-${config.de}-${config.ate}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RelatorioBi({ resultado, ocupado, podeExportar }: {
  resultado: ResultadoBi; ocupado: boolean; podeExportar: boolean;
}) {
  const { config, colunas, total } = resultado;
  const [visualizacao, setVisualizacao] = useState<'tabela' | 'grafico'>('tabela');
  const [ordem, setOrdem] = useState<'rotulo' | 'desc' | 'asc'>('rotulo');
  const [metricaOrdem, setMetricaOrdem] = useState<MetricaBi>(config.metricas[0]);
  const [calor, setCalor] = useState(true);
  const [pagina, setPagina] = useState(0);
  const [paginaColunas, setPaginaColunas] = useState(0);
  const [porPagina, setPorPagina] = useState(30);
  const indice = Math.max(0, config.metricas.indexOf(metricaOrdem));
  const linhas = useMemo(() => {
    function comparar(a: ResultadoBi['linhas'][number], b: ResultadoBi['linhas'][number]) {
      if (ordem !== 'rotulo') {
        const diferenca = (a.total[indice] ?? 0) - (b.total[indice] ?? 0);
        if (diferenca) return ordem === 'desc' ? -diferenca : diferenca;
      }
      for (const [i, d] of config.linhas.entries()) {
        const diferenca = compararDimensao(d, a.rotulos[i], b.rotulos[i]);
        if (diferenca) return diferenca;
      }
      return 0;
    }
    return [...resultado.linhas].sort(comparar);
  }, [resultado.linhas, config.linhas, indice, ordem]);
  const totalPaginas = Math.max(1, Math.ceil(linhas.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const exibidas = linhas.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina);
  const destaque = useMemo(() => [...linhas].sort((a, b) => (b.total[indice] ?? 0) - (a.total[indice] ?? 0)).slice(0, 12), [linhas, indice]);
  const maior = Math.max(0, ...destaque.map((l) => l.total[indice] ?? 0));
  const eixoLinhas = config.linhas.length ? config.linhas.map(nomeDimensao) : ['Grupo'];
  const largura = config.metricas.length;
  const comColunas = config.coluna !== null && colunas.length > 0;
  const porPaginaColunas = Math.max(1, Math.floor(36 / largura));
  const totalPaginasColunas = Math.max(1, Math.ceil(colunas.length / porPaginaColunas));
  const paginaColunasAtual = Math.min(paginaColunas, totalPaginasColunas - 1);
  const colunasVisiveis = colunas.slice(paginaColunasAtual * porPaginaColunas, (paginaColunasAtual + 1) * porPaginaColunas);

  function celulas(valores: (number | null)[], referencia: (number | null)[], prefixo: string, ehTotal = false) {
    return valores.map((v, i) => {
      const max = config.metricas[i] === 'conversao' ? 100 : referencia[i] ?? 0;
      const intensidade = v != null && max > 0 ? Math.min(1, v / max) * 21 : 0;
      const style = calor && intensidade && !ehTotal ? { backgroundColor: `color-mix(in srgb, var(--blue) ${intensidade}%, var(--panel))` } : undefined;
      return <td key={`${prefixo}:${i}`} className={ehTotal ? styles.totalCell : styles.numberCell}
        style={style}>{valorBi(v, config.metricas[i])}</td>;
    });
  }

  return (
    <div className={styles.report} aria-busy={ocupado}>
      <div className={styles.summary} aria-label="Totais da consulta">
        {config.metricas.map((m, i) => (
          <div className={styles.metric} key={m}>
            <span>{nomeMetrica(m)}</span>
            <strong>{valorBi(total[i], m)}</strong>
          </div>
        ))}
      </div>
      <section className="card">
        <div className={styles.resultsHead}>
          <div>
            <h3>Tabela dinâmica</h3>
            <div className="muted">{formatarDimensao('dia', config.de)} a {formatarDimensao('dia', config.ate)} · {num(linhas.length)} grupos</div>
          </div>
          <div className={styles.actions}>
            <div className={styles.segmented} aria-label="Visualização">
              <button type="button" aria-pressed={visualizacao === 'tabela'} onClick={() => setVisualizacao('tabela')}><Table2 size={14} /> Tabela</button>
              <button type="button" aria-pressed={visualizacao === 'grafico'} onClick={() => setVisualizacao('grafico')}><BarChart3 size={14} /> Gráfico</button>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" disabled={!podeExportar || linhas.length === 0} onClick={() => exportarBi(resultado, linhas)}>
              <Download size={15} /> Exportar CSV
            </button>
          </div>
        </div>
        {linhas.length === 0 ? <div className={styles.empty}><strong>Nenhum dado neste recorte</strong><p>Altere os filtros, o ambiente ou as datas para explorar outros resultados.</p></div> : (
          <>
            <div className={styles.tableTools}>
              <div className={styles.sort}>
                <ArrowDownUp size={15} aria-hidden="true" />
                <select className="select" aria-label="Ordem das linhas" value={ordem}
                  onChange={(e) => { setOrdem(e.target.value as typeof ordem); setPagina(0); }}>
                  <option value="rotulo">Por dimensão</option><option value="desc">Maior primeiro</option><option value="asc">Menor primeiro</option>
                </select>
                <select className="select" aria-label="Indicador de ordenação e gráfico" value={config.metricas[indice]}
                  onChange={(e) => { setMetricaOrdem(e.target.value as MetricaBi); setPagina(0); }}>
                  {config.metricas.map((m) => <option value={m} key={m}>{nomeMetrica(m)}</option>)}
                </select>
              </div>
              {visualizacao === 'tabela' && <label className={styles.check}><input type="checkbox" checked={calor}
                onChange={(e) => setCalor(e.target.checked)} /> Mapa de calor</label>}
            </div>
            {visualizacao === 'tabela' && totalPaginasColunas > 1 && (
              <div className={styles.columnPagination}>
                <span>Colunas {paginaColunasAtual * porPaginaColunas + 1}–{Math.min(colunas.length, (paginaColunasAtual + 1) * porPaginaColunas)} de {colunas.length}</span>
                <div className={styles.actions}>
                  <button type="button" className={styles.iconButton} aria-label="Colunas anteriores" disabled={paginaColunasAtual === 0}
                    onClick={() => setPaginaColunas(paginaColunasAtual - 1)}><ChevronLeft size={16} /></button>
                  <button type="button" className={styles.iconButton} aria-label="Próximas colunas" disabled={paginaColunasAtual >= totalPaginasColunas - 1}
                    onClick={() => setPaginaColunas(paginaColunasAtual + 1)}><ChevronRight size={16} /></button>
                </div>
              </div>
            )}
            {visualizacao === 'tabela' ? (
              <>
                <div className={styles.tableScroll} tabIndex={0} aria-label="Resultados da tabela dinâmica">
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {eixoLinhas.map((t, i) => <th key={t} scope="col" rowSpan={comColunas ? 2 : 1} className={i === 0 ? styles.firstColumn : undefined}>{t}</th>)}
                        {comColunas ? (
                          <>
                            {colunasVisiveis.map((c) => <th key={c.id} scope="colgroup" colSpan={largura} className={styles.groupHead}>
                              {formatarDimensao(config.coluna!, c.id)}</th>)}
                            <th colSpan={largura} scope="colgroup" className={styles.totalHead}>Total</th>
                          </>
                        ) : config.metricas.map((m) => <th key={m} scope="col" className={styles.metricHead}>{nomeMetrica(m)}</th>)}
                      </tr>
                      {comColunas && <tr>
                        {[...colunasVisiveis.map((c) => c.id), 'Total'].flatMap((c, i) => config.metricas.map((m) =>
                          <th key={`${i}:${c}:${m}`} scope="col" className={styles.metricHead}>{nomeMetrica(m)}</th>))}
                      </tr>}
                    </thead>
                    <tbody>
                      {exibidas.map((l) => {
                        const rotulos = config.linhas.length ? l.rotulos.map((v, i) => formatarDimensao(config.linhas[i], v)) : ['Total'];
                        return <tr key={l.id}>
                          <th scope="row" className={styles.firstColumn}>{rotulos[0]}</th>
                          {rotulos.slice(1).map((v, i) => <td key={i} className={styles.rowLabel}>{v}</td>)}
                          {colunasVisiveis.flatMap((c, i) => celulas(valoresCelula(l, c.id, config.metricas), c.total, `c${i}`))}
                          {celulas(l.total, total, 'linha-total', comColunas)}
                        </tr>;
                      })}
                    </tbody>
                    {config.linhas.length > 0 && <tfoot>
                      <tr>
                        <th colSpan={eixoLinhas.length} scope="row">Total geral</th>
                        {colunasVisiveis.flatMap((c, i) => celulas(c.total, c.total, `t${i}`, true))}
                        {celulas(total, total, 'geral', true)}
                      </tr>
                    </tfoot>}
                  </table>
                </div>
                <div className={styles.pagination}>
                  <span className="muted">{num(paginaAtual * porPagina + 1)}–{num(Math.min(linhas.length, (paginaAtual + 1) * porPagina))} de {num(linhas.length)} grupos</span>
                  <div className={styles.actions}>
                    <select className="select" aria-label="Linhas por página" value={porPagina}
                      onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(0); }}>
                      {[30, 60, 100].map((n) => <option value={n} key={n}>{n} por página</option>)}
                    </select>
                    <button type="button" className={styles.iconButton} aria-label="Página anterior" disabled={paginaAtual === 0}
                      onClick={() => setPagina(paginaAtual - 1)}><ChevronLeft size={17} /></button>
                    <button type="button" className={styles.iconButton} aria-label="Próxima página" disabled={paginaAtual >= totalPaginas - 1}
                      onClick={() => setPagina(paginaAtual + 1)}><ChevronRight size={17} /></button>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.chart}>
                <div className="muted">{nomeMetrica(config.metricas[indice])} · até 12 maiores grupos por total da linha</div>
                {destaque.map((l) => (
                  <div className={styles.chartRow} key={l.id}>
                    <span>{l.rotulos.map((v, i) => formatarDimensao(config.linhas[i], v)).join(' · ') || 'Total'}</span>
                    <div className={styles.barTrack} aria-hidden="true">
                      <div className={styles.bar} style={{ '--bar-width': `${maior > 0 ? (l.total[indice] ?? 0) / maior * 100 : 0}%` } as CSSProperties} />
                    </div>
                    <strong>{valorBi(l.total[indice], config.metricas[indice])}</strong>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className={styles.note}>
          Os totais de visitantes e visitas são deduplicados em cada recorte. Um visitante pode chegar por várias origens e uma visita pode aparecer em diferentes ações ou dias.
          {config.coluna && <span> As colunas representam {nomeDimensao(config.coluna).toLowerCase()}.</span>}
        </div>
      </section>
      <details className={styles.method}>
        <summary>Como os indicadores são calculados</summary>
        <p>Visitantes únicos são códigos anônimos de navegação. Visitas são sessões com atividade nas datas escolhidas. Os eventos e páginas são contados na data em que ocorreram, no horário de Brasília. Ao filtrar por ação, página acessada ou empreendimento, entram os registros correspondentes; os números de visitantes e visitas são recalculados.</p>
        <p>Passeios 3D são aberturas iniciadas no site. Contatos são visitantes que clicaram no WhatsApp ou enviaram formulário; a taxa usa esses visitantes divididos pelos visitantes únicos.</p>
        <p>Leads vinculados são cadastros únicos associados aos visitantes do recorte. Qualificação, reunião, proposta e venda consideram os marcos registrados no CRM para esses leads, inclusive se aconteceram depois da visita.</p>
        <p>A localização é estimada pela conexão, e o dispositivo é o último registrado no código de visita. A origem usa a referência e as tags de campanha disponíveis.
          {resultado.cobertura.eventosSemSessao > 0 && ` Há ${num(resultado.cobertura.eventosSemSessao)} eventos selecionados sem sessão identificada.`}
        </p>
      </details>
    </div>
  );
}

type Consulta = { chave: string; rodada: number; dados: ResultadoBi | null; erro: string };

export function SiteBiWorkspace({ initial }: { initial: ConfigBi }) {
  const [config, setConfig] = useState(initial);
  const [camposFiltro, setCamposFiltro] = useState<DimensaoBi[]>(FILTROS_INICIAIS);
  const [rodada, setRodada] = useState(0);
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const chave = JSON.stringify(config);
  const ocupado = !consulta || consulta.chave !== chave || consulta.rodada !== rodada;
  const resultado = consulta?.dados ?? null;
  const erro = !ocupado ? consulta?.erro : '';
  const ativos = Object.values(config.filtros).filter((v) => v.length).length;
  const eixos = [...config.linhas, ...(config.coluna ? [config.coluna] : [])];

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const validada = validarConfigBi(JSON.parse(chave));
        const response = await fetch('/api/site/bi', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validada), cache: 'no-store', signal: controller.signal,
        });
        const dados = await response.json();
        if (!response.ok) throw new Error(dados.error || 'Não foi possível consultar as estatísticas.');
        if (!controller.signal.aborted) setConsulta({ chave, rodada, dados: dados as ResultadoBi, erro: '' });
      } catch (cause) {
        if (!controller.signal.aborted) setConsulta((antiga) => ({
          chave, rodada, dados: antiga?.dados ?? null, erro: cause instanceof Error ? cause.message : 'Falha na consulta.',
        }));
      }
    }, 240);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [chave, rodada]);

  function ajustarFiltro(campo: DimensaoBi, valores: string[]) {
    setConfig((atual) => {
      const filtros = { ...atual.filtros };
      if (valores.length) filtros[campo] = valores;
      else delete filtros[campo];
      return { ...atual, filtros };
    });
  }

  function visao(tipo: 'origens' | 'cidades' | 'passeios' | 'tempo' | 'campanhas') {
    const visoes: Record<typeof tipo, Pick<ConfigBi, 'linhas' | 'coluna' | 'metricas' | 'filtros'>> = {
      origens: { linhas: ['origem', 'cidade'], coluna: null, metricas: ['visitantes', 'visitas', 'passeios', 'contatos'], filtros: {} },
      cidades: { linhas: ['cidade', 'estado'], coluna: 'origem', metricas: ['visitantes'], filtros: {} },
      passeios: { linhas: ['empreendimento'], coluna: 'origem', metricas: ['passeios', 'aberturas'], filtros: { acao: ['Abriu passeio 3D'] } },
      tempo: { linhas: ['dia'], coluna: 'canal', metricas: ['visitas'], filtros: {} },
      campanhas: { linhas: ['origem', 'campanha'], coluna: 'canal', metricas: ['visitas', 'contatos'], filtros: {} },
    };
    setConfig((atual) => ({ ...atual, ...visoes[tipo] }));
    setCamposFiltro([...new Set([...FILTROS_INICIAIS, ...Object.keys(visoes[tipo].filtros) as DimensaoBi[]])]);
  }

  return (
    <div className={`page-content ${styles.workspace}`}>
      <section className={`card ${styles.toolbar}`}>
        <div className={styles.toolbarMain}>
          <div className={styles.actions}>
            <span className={styles.label}>Período</span>
            <div className={styles.segmented}>
              {PERIODOS.map(([dias, nome]) => {
                const periodo = periodoBi(dias);
                return <button key={dias} type="button" aria-pressed={periodo.de === config.de && periodo.ate === config.ate}
                  onClick={() => setConfig((atual) => ({ ...atual, ...periodoBi(dias) }))}>{nome}</button>;
              })}
            </div>
          </div>
          <div className={styles.dateFields}>
            <label>De<input className="input" type="date" value={config.de}
              onChange={(e) => setConfig((atual) => ({ ...atual, de: e.target.value }))} /></label>
            <label>Até<input className="input" type="date" value={config.ate}
              onChange={(e) => setConfig((atual) => ({ ...atual, ate: e.target.value }))} /></label>
            <label>Ambiente<select className="select" value={config.ambiente}
              onChange={(e) => setConfig((atual) => ({ ...atual, ambiente: e.target.value as AmbienteSite }))}>
              {AMBIENTES_SITE.map((a) => <option value={a.k} key={a.k}>{a.t}</option>)}
            </select></label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRodada((n) => n + 1)} disabled={ocupado}>
              <RefreshCw size={14} aria-hidden="true" /> Atualizar
            </button>
          </div>
        </div>
        <div className={styles.presets}>
          <span className={styles.label}>Visões rápidas</span>
          {([['origens', 'Origem e cidade'], ['cidades', 'Cidades × origens'], ['passeios', 'Passeios 3D'], ['tempo', 'Evolução diária'], ['campanhas', 'Campanhas']] as const)
            .map(([k, nome]) => <button className="btn btn-ghost btn-sm" type="button" key={k} onClick={() => visao(k)}>{nome}</button>)}
        </div>
      </section>

      <div className={styles.layout}>
        <aside className={`card ${styles.builder}`} aria-label="Configurar tabela dinâmica">
          <div className={styles.builderHead}><h3>Configurar tabela</h3><button type="button" className="btn btn-ghost btn-sm" onClick={() => visao('origens')}>Restaurar</button></div>
          <div className={styles.builderSection}>
            <h4>Linhas</h4>
            {config.linhas.map((d, i) => <div className={styles.axis} key={i}>
              <DimensaoSelect label={`Dimensão da linha ${i + 1}`} value={d} indisponiveis={eixos}
                onChange={(valor) => setConfig((atual) => ({ ...atual, linhas: valor ? atual.linhas.map((x, j) => j === i ? valor : x) : atual.linhas.filter((_, j) => j !== i) }))} />
              <button className={styles.iconButton} type="button" aria-label={`Remover dimensão ${nomeDimensao(d)}`}
                onClick={() => setConfig((atual) => ({ ...atual, linhas: atual.linhas.filter((_, j) => j !== i) }))}><X size={15} /></button>
            </div>)}
            {config.linhas.length < MAX_LINHAS_BI && <DimensaoSelect label="Adicionar dimensão nas linhas" value="" indisponiveis={eixos}
              placeholder="+ Adicionar dimensão" onChange={(d) => { if (d) setConfig((atual) => ({ ...atual, linhas: [...atual.linhas, d] })); }} />}
            <h4>Colunas</h4>
            <DimensaoSelect label="Dimensão das colunas" value={config.coluna ?? ''} indisponiveis={config.linhas}
              placeholder="Sem divisão em colunas" onChange={(d) => setConfig((atual) => ({ ...atual, coluna: d || null }))} />
          </div>
          <div className={styles.builderSection}>
            <h4>Indicadores <small>{config.metricas.length} selecionados</small></h4>
            <div className={styles.metricOptions}>
              {METRICAS_BI.map(([m, nome]) => <label className={styles.check} key={m}>
                <input type="checkbox" checked={config.metricas.includes(m)} disabled={config.metricas.length === 1 && config.metricas.includes(m)}
                  onChange={() => setConfig((atual) => ({ ...atual, metricas: atual.metricas.includes(m) ? atual.metricas.filter((v) => v !== m) : [...atual.metricas, m] }))} />
                <span>{nome}</span>
              </label>)}
            </div>
          </div>
          <div className={styles.builderSection}>
            <div className={styles.filterHead}><h4><Filter size={14} /> Filtros {ativos > 0 ? `(${ativos})` : ''}</h4>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfig((atual) => ({ ...atual, filtros: {} }))} disabled={!ativos}>Limpar</button></div>
            {camposFiltro.map((campo) => <FiltroValores key={campo} campo={campo} opcoes={resultado?.opcoes[campo] ?? []}
              selecionados={config.filtros[campo] ?? []} onChange={(valores) => ajustarFiltro(campo, valores)}
              onRemove={() => { ajustarFiltro(campo, []); setCamposFiltro((campos) => campos.filter((c) => c !== campo)); }} />)}
            <div className={styles.axis}>
              <Plus size={15} aria-hidden="true" />
              <DimensaoSelect label="Adicionar filtro" value="" indisponiveis={camposFiltro} placeholder="Adicionar filtro"
                onChange={(d) => { if (d) setCamposFiltro((campos) => [...campos, d]); }} />
            </div>
            <div className={styles.builderNote}>Escolha vários valores de cada campo para combinar a consulta.</div>
          </div>
        </aside>

        <section className={styles.results} aria-label="Resultado da análise">
          <div className={styles.status} role="status">
            {ocupado ? <><span className={styles.spinner} /> Atualizando a análise…</> :
              erro ? 'Consulta não concluída' : <><span className={styles.readyDot} /> Dados atualizados</>}
          </div>
          {erro && <div className="error-box" role="alert">{erro}{resultado ? ' A última consulta concluída continua exibida abaixo.' : ''}</div>}
          {resultado ? <RelatorioBi resultado={resultado} ocupado={ocupado} podeExportar={!ocupado && !erro} /> :
            !erro && <section className={`card ${styles.empty}`} aria-busy="true"><span className={styles.spinner} /> Carregando estatísticas…</section>}
        </section>
      </div>
    </div>
  );
}
