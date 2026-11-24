type SessaoOrigem = {
  visitor_code: string;
  utm: Record<string, string> | null;
  referrer: string | null;
};

type EventoSite = {
  visitor_code: string;
  name: string;
  props: Record<string, unknown> | null;
};

type Origem = { nome: string; canal: string };
type Fonte = { nome: string; tipo: 'busca' | 'social' | 'mensagens' | 'ia' };

const normalizar = (valor: string) => valor.trim().toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu, '');
const chave = (valor: string) => normalizar(valor).replace(/[^a-z0-9]/g, '');
const texto = (valor: unknown) => typeof valor === 'string' ? valor.trim() : '';

function dominio(valor: string): string {
  if (!valor) return '';
  try {
    const url = new URL(valor.includes('://') ? valor : `https://${valor}`);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.')) return '';
    return url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  } catch { return ''; }
}

function pertence(host: string, raiz: string) {
  return host === raiz || host.endsWith(`.${raiz}`);
}

function fonteConhecida(valor: string): Fonte | null {
  const host = dominio(valor);
  const id = chave(valor);
  if (['chatgpt', 'openai'].includes(id) || pertence(host, 'chatgpt.com') || pertence(host, 'openai.com')) return { nome: 'ChatGPT', tipo: 'ia' };
  if (id === 'gemini' || host === 'gemini.google.com') return { nome: 'Gemini', tipo: 'ia' };
  if (id === 'perplexity' || pertence(host, 'perplexity.ai')) return { nome: 'Perplexity', tipo: 'ia' };
  if (id === 'claude' || pertence(host, 'claude.ai')) return { nome: 'Claude', tipo: 'ia' };
  if (id === 'copilot' || host === 'copilot.microsoft.com') return { nome: 'Copilot', tipo: 'ia' };
  if (['google', 'googleads', 'googlemeunegocio', 'googlebusinessprofile', 'googlemaps', 'adwords'].includes(id) ||
      /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host) || pertence(host, 'googleadservices.com')) return { nome: 'Google', tipo: 'busca' };
  if (['bing', 'microsoftads', 'bingads'].includes(id) || pertence(host, 'bing.com')) return { nome: 'Bing', tipo: 'busca' };
  if (id === 'yahoo' || pertence(host, 'yahoo.com')) return { nome: 'Yahoo', tipo: 'busca' };
  if (id === 'duckduckgo' || pertence(host, 'duckduckgo.com')) return { nome: 'DuckDuckGo', tipo: 'busca' };
  if (['ig', 'insta', 'instagram', 'instagramads'].includes(id) || pertence(host, 'instagram.com')) return { nome: 'Instagram', tipo: 'social' };
  if (['fb', 'facebook', 'facebookads', 'fbads'].includes(id) || pertence(host, 'facebook.com') || pertence(host, 'fb.com') || pertence(host, 'fb.me')) return { nome: 'Facebook', tipo: 'social' };
  if (['meta', 'metaads'].includes(id) || pertence(host, 'meta.com')) return { nome: 'Meta', tipo: 'social' };
  if (id === 'tiktok' || id === 'tiktokads' || pertence(host, 'tiktok.com')) return { nome: 'TikTok', tipo: 'social' };
  if (id === 'linkedin' || id === 'linkedinads' || pertence(host, 'linkedin.com') || pertence(host, 'lnkd.in')) return { nome: 'LinkedIn', tipo: 'social' };
  if (id === 'youtube' || pertence(host, 'youtube.com') || pertence(host, 'youtu.be')) return { nome: 'YouTube', tipo: 'social' };
  if (id === 'whatsapp' || id === 'wa' || pertence(host, 'whatsapp.com') || pertence(host, 'wa.me')) return { nome: 'WhatsApp', tipo: 'mensagens' };
  if (['teams', 'microsoftteams'].includes(id) || pertence(host, 'teams.microsoft.com') || host === 'teams.public.onecdn.static.microsoft') return { nome: 'Microsoft Teams', tipo: 'mensagens' };
  return null;
}

export function origemDaSessao(sessao: SessaoOrigem): Origem {
  const utm = sessao.utm ?? {};
  const fonteUtm = texto(utm.utm_source);
  const meio = chave(texto(utm.utm_medium));
  const referencia = dominio(texto(sessao.referrer));
  const externa = referencia && !pertence(referencia, 'bossaempreendimentos.com.br') ? referencia : '';
  const fonteReferida = fonteConhecida(externa);
  const fonteMarcada = fonteConhecida(fonteUtm);
  const fonte = fonteUtm ? fonteMarcada : fonteReferida;
  const pago = /^(cpc|ppc|cpm|cpv|cpa|paid.*|socialpaid|searchpaid|socialads|ads?|anuncios?|trafegopago|sponsored|display|remarketing|retargeting)$/.test(meio) ||
    /^(googleads|adwords|bingads|microsoftads|instagramads|facebookads|fbads|metaads|tiktokads|linkedinads)$/.test(chave(fonteUtm));

  // O identificador de clique do Google indica um anúncio. O do Facebook
  // também aparece em links orgânicos, por isso não determina tráfego pago.
  if (texto(utm.gclid)) return { nome: 'Google', canal: 'Anúncios' };
  if (!fonteUtm && pertence(externa, 'googleadservices.com')) return { nome: 'Google', canal: 'Anúncios' };

  if (['direct', 'direto'].includes(chave(fonteUtm))) return { nome: 'Direto / sem referência', canal: 'Direto' };

  let nome = fonte?.nome ?? (fonteUtm ? dominio(fonteUtm) || fonteUtm.toLowerCase() : externa);
  if (!nome && texto(utm.fbclid)) nome = 'Meta';
  if (!nome && (meio || texto(utm.utm_campaign))) nome = 'Origem não informada';
  if (!nome) return { nome: 'Direto / sem referência', canal: 'Direto' };

  if (pago) return { nome, canal: 'Anúncios' };
  if (/^(email|newsletter)$/.test(meio)) return { nome, canal: 'E-mail' };
  if (/^(whatsapp|messaging|sms|mensagens)$/.test(meio) || fonte?.tipo === 'mensagens') return { nome, canal: 'Mensagens' };
  if (fonte?.tipo === 'ia') return { nome, canal: 'Assistentes de IA' };
  if (fonte?.tipo === 'social' || ['social', 'organicsocial', 'socialmedia', 'socialnetwork'].includes(meio)) return { nome, canal: 'Redes sociais' };
  if (['organic', 'organico', 'organicsearch', 'seo'].includes(meio) ||
      (fonte?.tipo === 'busca' && fonte?.nome === fonteReferida?.nome && !meio)) return { nome, canal: 'Busca orgânica' };
  if ((!fonteUtm && externa) || meio === 'referral') return { nome, canal: 'Link de outro site' };
  return { nome, canal: meio ? 'Outras campanhas' : 'Meio não informado' };
}

/** Cada sessão pertence a uma origem. Um visitante pode retornar por outra. */
export function resumirOrigens(sessoes: SessaoOrigem[], visitantesLigados: ReadonlySet<string>) {
  const grupos = new Map<string, Origem & { visitantes: Set<string>; ligados: Set<string>; visitas: number }>();
  for (const sessao of sessoes) {
    const origem = origemDaSessao(sessao);
    const id = `${origem.nome} · ${origem.canal}`;
    const grupo = grupos.get(id) ?? { ...origem, visitantes: new Set<string>(), ligados: new Set<string>(), visitas: 0 };
    grupo.visitas += 1;
    grupo.visitantes.add(sessao.visitor_code);
    if (visitantesLigados.has(sessao.visitor_code)) grupo.ligados.add(sessao.visitor_code);
    grupos.set(id, grupo);
  }
  return [...grupos.entries()].map(([id, grupo]) => ({
    id, nome: grupo.nome, canal: grupo.canal,
    visitantes: grupo.visitantes.size, visitas: grupo.visitas, ligados: grupo.ligados.size,
  })).sort((a, b) => b.visitas - a.visitas || b.visitantes - a.visitantes || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export const PASSEIOS_3D = [
  { slug: 'flow-aptos', nome: 'Flow Aptos' },
  { slug: 'alma-seahouses', nome: 'Alma Seahouses' },
] as const;

/** Os botões dos passeios registram gallery_interact com esse marcador desde o lançamento. */
export function empreendimentoDoPasseio(evento: EventoSite) {
  const ambiente = evento.props?.ambiente;
  if (evento.name !== 'gallery_interact' || typeof ambiente !== 'string' ||
      !/^passeio virtual 3d(?:\s*·|$)/i.test(ambiente.trim())) return null;
  return PASSEIOS_3D.find((passeio) => passeio.slug === evento.props?.empreendimento)?.slug ?? null;
}

export function resumirPasseios(eventos: EventoSite[]) {
  const visitantes = new Set<string>();
  const porProjeto = new Map(PASSEIOS_3D.map((p) => [p.slug, { visitantes: new Set<string>(), aberturas: 0 }]));
  let aberturas = 0;
  for (const evento of eventos) {
    const projeto = empreendimentoDoPasseio(evento);
    if (!projeto) continue;
    const grupo = porProjeto.get(projeto)!;
    grupo.aberturas += 1;
    grupo.visitantes.add(evento.visitor_code);
    visitantes.add(evento.visitor_code);
    aberturas += 1;
  }
  return {
    visitantes: visitantes.size,
    aberturas,
    projetos: PASSEIOS_3D.map((p) => ({
      ...p, visitantes: porProjeto.get(p.slug)!.visitantes.size, aberturas: porProjeto.get(p.slug)!.aberturas,
    })),
  };
}
