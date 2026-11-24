import assert from 'node:assert/strict';
import { empreendimentoDoPasseio, origemDaSessao, resumirOrigens, resumirPasseios } from '../src/lib/site-analytics.ts';

const sessao = (visitor_code, referrer = null, utm = null) => ({ visitor_code, referrer, utm });
const origem = (referrer, utm) => origemDaSessao(sessao('A', referrer, utm));

for (const [referrer, utm, nome, canal] of [
  ['https://www.google.com.br/search?q=bossa', null, 'Google', 'Busca orgânica'],
  [null, { utm_source: 'google', utm_medium: 'cpc' }, 'Google', 'Anúncios'],
  [null, { gclid: 'teste' }, 'Google', 'Anúncios'],
  [null, { utm_source: 'Google Ads' }, 'Google', 'Anúncios'],
  ['https://www.googleadservices.com/', null, 'Google', 'Anúncios'],
  ['https://l.instagram.com/', { utm_source: 'ig', utm_medium: 'social', fbclid: 'teste' }, 'Instagram', 'Redes sociais'],
  [null, { utm_source: 'facebook', utm_medium: 'paid_social', fbclid: 'teste' }, 'Facebook', 'Anúncios'],
  [null, { utm_source: 'ig', utm_medium: 'social_paid' }, 'Instagram', 'Anúncios'],
  ['https://lm.facebook.com/', { fbclid: 'teste' }, 'Facebook', 'Redes sociais'],
  [null, { fbclid: 'teste' }, 'Meta', 'Meio não informado'],
  [null, { utm_source: 'chatgpt.com' }, 'ChatGPT', 'Assistentes de IA'],
  ['https://gemini.google.com/', null, 'Gemini', 'Assistentes de IA'],
  ['https://www.bing.com/', null, 'Bing', 'Busca orgânica'],
  ['https://wa.me/', null, 'WhatsApp', 'Mensagens'],
  ['https://teams.public.onecdn.static.microsoft/', null, 'Microsoft Teams', 'Mensagens'],
  ['https://newsletter.example.org/', { utm_medium: 'email' }, 'newsletter.example.org', 'E-mail'],
  ['https://www.aocr.org/', null, 'aocr.org', 'Link de outro site'],
  ['https://www.bossaempreendimentos.com.br/empreendimentos', null, 'Direto / sem referência', 'Direto'],
  [null, null, 'Direto / sem referência', 'Direto'],
  [null, { utm_medium: 'paid_social' }, 'Origem não informada', 'Anúncios'],
  [null, { utm_source: 'google' }, 'Google', 'Meio não informado'],
]) {
  assert.deepEqual(origem(referrer, utm), { nome, canal });
}

const origens = resumirOrigens([
  sessao('A', 'https://google.com'),
  sessao('A', 'https://google.com.br'),
  sessao('B', 'https://google.com'),
  sessao('A', 'https://instagram.com'),
], new Set(['A']));
assert.deepEqual(origens.map(({ nome, visitantes, visitas, ligados }) => ({ nome, visitantes, visitas, ligados })), [
  { nome: 'Google', visitantes: 2, visitas: 3, ligados: 1 },
  { nome: 'Instagram', visitantes: 1, visitas: 1, ligados: 1 },
]);
assert.equal(origens.reduce((total, o) => total + o.visitas, 0), 4);
assert.deepEqual(resumirOrigens([], new Set()), []);

const evento = (visitor_code, empreendimento, ambiente, name = 'gallery_interact') => ({
  visitor_code, name, props: { empreendimento, ambiente },
});
const eventos = [
  evento('A', 'flow-aptos', 'Passeio virtual 3D · na página'),
  evento('A', 'flow-aptos', 'Passeio virtual 3D · nova aba pelo modal'),
  evento('B', 'flow-aptos', 'Passeio virtual 3D · celular'),
  evento('A', 'alma-seahouses', 'Passeio virtual 3D · na página'),
  evento('C', 'alma-seahouses', 'Passeio virtual 3D · nova aba'),
  evento('D', 'flow-aptos', 'Rooftop'),
  evento('E', 'flow-aptos', 'Passeio virtual 3D', 'view_project'),
  evento('F', 'soul-residence', 'Passeio virtual 3D · na página'),
];
assert.equal(empreendimentoDoPasseio(eventos[5]), null);
assert.equal(empreendimentoDoPasseio(eventos[6]), null);
assert.deepEqual(resumirPasseios(eventos), {
  visitantes: 3,
  aberturas: 5,
  projetos: [
    { slug: 'flow-aptos', nome: 'Flow Aptos', visitantes: 2, aberturas: 3 },
    { slug: 'alma-seahouses', nome: 'Alma Seahouses', visitantes: 2, aberturas: 2 },
  ],
});
assert.equal(resumirPasseios([]).visitantes, 0);
console.log('Estatísticas do site: origens, atribuição paga, sessões e visitantes únicos dos passeios 3D validados.');
