// Rodada 3 de testes da Nara (04/11/2026): cenários 16 a 25, clientes no exterior vindos do Alma.
// Cada caso usa a resposta problemática observada no simulador e confere que o pós-processamento
// a corrige: preço consistente, contexto mantido, planta enviada e explicada, sem "robô",
// sem apresentação duplicada e transferência respeitando a recusa do cliente.
import assert from 'node:assert/strict';
import { ensureFirstTurnIntroduction } from '../src/lib/ai.ts';
import { postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { loadNaraCommercialTurnContext } from '../src/lib/nara-unit-queries.ts';
import {
  declaredFirstName,
  enterpriseInFocus,
  explicitHumanRequest,
  qualificationPaused,
  refusesHandoff,
} from '../src/lib/nara-conversation-signals.ts';
import { resolvePlantRequest } from '../src/lib/nara-plant-catalog.ts';
import { deriveHybridDecision } from '../src/lib/hybrid.ts';

const passed = [];
function accept(title, run) {
  run();
  passed.push(title);
}

function turn(overrides = {}) {
  return {
    reply: 'Posso te ajudar com isso.', classification: 'morno', score: 45, stage: 'ia',
    summary: '', next_action: '', handoff: false, attachment_ids: [],
    extracted: { enterprise: '', purpose: '', typology: '', budget: '', deadline: '', decision_maker: '', company: '', creci: '', region: '', client_status: '' },
    ...overrides,
  };
}

const file = (id, category, title, keywords, original = `${id}.jpg`) => ({
  id, category, title, description: null, trigger_keywords: keywords,
  storage_bucket: 'ai-files', storage_path: `x/${id}`, original_name: original, mime_type: 'image/jpeg',
});
const files = [
  file('alma-tipo-01', 'planta', 'Planta Tipo 01', ['Alma', 'plantas', 'tipo', '3 suítes'], 'Tipo 01.jpg'),
  file('alma-tipo-02', 'planta', 'Plantas Tipo 02', ['Alma', 'plantas', 'tipo', '3 suítes'], 'Tipo 02.jpg'),
  file('alma-duplex', 'planta', 'Planta Duplex Tipo 1', ['Alma', 'duplex', '4 suítes'], 'Duplex Tipo 1.jpg'),
  file('alma-fachada', 'imagem', 'Fachada Alma', ['Alma', 'fachada'], 'fachada-alma.jpg'),
  // Nomes reais da biblioteca (rodada 4): duplex do Alma sem a palavra "tipo".
  file('alma-duplex-02', 'imagem', 'Planta Duplex 02', ['Alma', 'planta', 'duplex', 'imagens'], 'Duplex 02.jpg'),
  file('soul-piscina', 'imagem', 'Piscina Soul', ['Soul', 'piscina'], 'piscina-soul.jpg'),
  file('tabela-alma', 'tabela', 'Tabela de vendas · Alma Seahouses Ago26', ['Alma', 'tabela'], 'tabela.pdf'),
];
const almaRange = { name: 'faixa_empreendimento', arguments: { empreendimento: 'alma' }, result: { empreendimento: 'Alma Seahouses', valor_minimo: 1285350.85, valor_maximo: 2565800.5, entrada_minima: 192000, qtd_disponiveis: 20 } };
const soulEmpty = { name: 'faixa_empreendimento', arguments: { empreendimento: 'soul' }, result: null };
const alma = { files, commercial: { calls: [almaRange], source_text: '' } };
const soulNoPrice = { files, commercial: { calls: [soulEmpty], source_text: '' } };

const u = (content) => ({ role: 'user', content });
const a = (content) => ({ role: 'assistant', content });
const oneQuestionMax = (reply) => assert.ok((reply.match(/\?/g) ?? []).length <= 1, `mais de uma pergunta: ${reply}`);

// ---------- Sinais de conversa ----------
accept('Nome: "robô ou pessoa" não vira nome; "sou de Londres" também não', () => {
  assert.equal(declaredFirstName('Isso aqui é robô ou pessoa? Quero tirar uma dúvida do Alma.'), '');
  assert.equal(declaredFirstName('Sou de Londres. Esse Soul pronto começa em quanto?'), '');
  assert.equal(declaredFirstName('Oi, sou a Camila, vi o Alma.'), 'Camila');
  assert.equal(declaredFirstName('Me chamo Ricardo'), 'Ricardo');
});

accept('Empreendimento em discussão é o último citado (Soul depois do Alma)', () => {
  assert.equal(enterpriseInFocus([u('Quando entrega o Alma?'), a('Julho de 2030.'), u('Esse Soul pronto começa em quanto?')]), 'soul');
  assert.equal(enterpriseInFocus([u('O Alma tem algo até 1 milhão?'), a('Temos o Soul, em Itapema, pronto para morar.'), u('Sem preço não adianta.')]), 'soul');
  assert.equal(enterpriseInFocus([u('Alma'), a('O Soul é pronto e não sei se é mais barato que o Alma.'), u('E o preço?')]), 'alma');
});

accept('Recusa de encaminhamento e pedido de pessoa são lidos com negação', () => {
  assert.equal(refusesHandoff('Vou deixar pra depois. Não encaminha e não precisa me chamar.'), true);
  assert.equal(refusesHandoff('Não escolhi unidade. Não precisa pedir proposta pra ninguém.'), true);
  assert.equal(refusesHandoff('Videochamada não. Só queria saber preço mesmo. Eu volto depois.'), true);
  assert.equal(explicitHumanRequest('Calma, não pedi vendedor. Só quero o total.'), false);
  assert.equal(explicitHumanRequest('Quero alguém que confirme, então. Só mensagem, sem ligação.'), true);
  assert.equal(qualificationPaused([u('Tô em Dublin. Não sei as suítes. Quero só conhecer a empresa primeiro.')]), true);
});

accept('Planta pela metragem, "o menor", suítes e duplex sem nome interno', () => {
  assert.deepEqual(resolvePlantRequest('alma', 'Manda a planta de 103 m², só pra olhar.').entries.map((e) => e.label), ['Tipo 02']);
  assert.deepEqual(resolvePlantRequest('alma', 'Manda a planta desse menor').entries.map((e) => e.label), ['Tipo 02']);
  assert.deepEqual(resolvePlantRequest('alma', '3 suítes').entries.map((e) => e.label), ['Tipo 02', 'Tipo 01']);
  assert.deepEqual(resolvePlantRequest('alma', 'tem planta do duplex?').entries.map((e) => e.label), ['Duplex Tipo 2', 'Duplex Tipo 1']);
  assert.deepEqual(resolvePlantRequest('flow', 'planta de 73 m2').entries.map((e) => e.label), ['Tipo 1']);
});

// ---------- Cenários do relatório ----------
accept('16 Boston: correção de preço anterior é preservada com clareza', () => {
  const history = [
    u('Oi. Quanto tá o menor do Alma?'),
    a('Oi, sou a Nara, da Bossa; o menor do Alma tem 103 m² e 3 suítes. Você pensa nele para morar ou aproveitar a praia?'),
    u('Só quero saber se cabe no bolso. Precisa responder isso pra ter preço?'),
    a('Não precisa. No Alma Seahouses, os valores partem de R$ 1.285.350,85.'),
    u('Tá. E sobe durante a obra?'),
  ];
  const reply = 'O saldo é corrigido pelo CUB durante a obra. Desculpe: o valor que mencionei antes também não estava validado e precisa de confirmação.';
  const result = postProcessNaraTurn(turn({ reply }), history, alma);
  assert.match(result.reply, /n[aã]o estava validado/i);
  assert.match(result.reply, /CUB/);
  assert.equal(result.reply, reply, 'o pós-processamento não deve esconder a correção');
});

accept('16 Boston: "não pedi reserva" e "não encaminha" desligam a transferência', () => {
  const base = [u('Oi. Quanto tá o menor do Alma?'), a('O Alma começa em R$ 1.285.350,85.')];
  const r4 = postProcessNaraTurn(turn({ reply: 'Você tem razão, entendi que está em Boston e só pesquisando.', handoff: true }), [...base, u('Tô em Boston e só pesquisando. Não pedi reserva.')], alma);
  assert.equal(r4.handoff, false);
  const r5 = postProcessNaraTurn(turn({ reply: 'Claro, não vou encaminhar seu contato.', handoff: true, classification: 'quente', score: 80 }), [...base, u('Vou deixar pra depois. Não encaminha e não precisa me chamar.')], alma);
  assert.equal(r5.handoff, false);
  assert.notEqual(r5.classification, 'quente');
});

accept('17 Orlando: teto de R$ 1 milhão recebe a faixa real e a resposta certa', () => {
  const history = [u('O Alma tem alguma coisa até 1 milhão? Só queria saber isso.')];
  const result = postProcessNaraTurn(turn({ reply: 'Não tenho os valores atuais confirmados do Alma para dizer se há opções até R$ 1 milhão.' }), history, alma);
  const final = ensureFirstTurnIntroduction(result.reply, history, {});
  assert.match(final, /R\$\s1\.285\.350,85/);
  assert.match(final, /n[aã]o tem op[cç][aã]o/i);
  assert.doesNotMatch(final, /\?/, 'cliente só queria saber isso; sem pergunta');
  assert.equal((final.match(/Nara/g) ?? []).length, 1);
});

accept('17 Orlando: conversa no Soul não volta ao preço do Alma', () => {
  const history = [
    u('O Alma tem alguma coisa até 1 milhão?'),
    a('O Alma começa em R$ 1.285.350,85, então até R$ 1 milhão ele não tem opção.'),
    u('Tem algum menor pronto nessa faixa? Sem corretor por enquanto.'),
    a('Temos o Soul, em Itapema, pronto para morar, com 70 m² e duas suítes.'),
    u('Sem preço não adianta. Deixa pra lá, eu volto se quiser.'),
  ];
  const result = postProcessNaraTurn(turn({ reply: 'O Alma Seahouses tem opções a partir de R$ 1.285.350,85. Desculpe por não ter informado o preço antes.' }), history, soulNoPrice);
  assert.doesNotMatch(result.reply, /Alma/);
  assert.match(result.reply, /Soul/);
  assert.equal(result.handoff, false);
  oneQuestionMax(result.reply);
});

accept('18 Miami: "total ou balão?" responde o total vigente sem encaminhamento automático', () => {
  const history = [
    u('Vi o anúncio do Alma. Falam da condição, mas qual é o valor total mesmo?'),
    a('Oi! Aqui é a Nara, da Bossa 😊 No Alma Seahouses, o valor total parte de R$ 1.285.350,85.'),
    u('Esse é o total ou tem balão por fora?'),
  ];
  const result = postProcessNaraTurn(turn({
    reply: 'Desculpe, o valor que mencionei não estava confirmado. Vou encaminhar à equipe comercial para confirmar o total.',
    handoff: true,
  }), history, alma);
  assert.match(result.reply, /R\$\s1\.285\.350,85/);
  assert.match(result.reply, /pre[cç]o total/i);
  assert.doesNotMatch(result.reply, /encaminhar/i);
  assert.equal(result.handoff, false);
});

accept('18 Miami: pedir alguém para confirmar encaminha, mas não vira lead quente', () => {
  const history = [u('Vi o anúncio do Alma. Qual é o valor total?'), a('O Alma começa em R$ 1.285.350,85.'), u('Quero alguém que confirme, então. Só mensagem, sem ligação. Tô em Miami.')];
  const result = postProcessNaraTurn(turn({ reply: 'Vou encaminhar à equipe comercial para confirmar por mensagem, sem ligação.', handoff: true, classification: 'quente', score: 80 }), history, alma);
  assert.equal(result.handoff, true);
  assert.equal(result.classification, 'morno');
  assert.ok(result.score <= 50);
});

accept('19 Paris: "ainda não sei" não apaga a pergunta sobre o trajeto', () => {
  const history = [u('Esse Alma é pé na areia mesmo? E começa em quanto?'), a('O Alma fica a 300 m do mar, cerca de quatro minutos a pé. Você procura três ou quatro suítes?'), u('Ainda não sei. Esse caminho até a praia é plano?')];
  const reply = 'Não tenho confirmação se o trajeto até a praia é plano; o time da Bossa pode verificar esse detalhe para você.';
  const result = postProcessNaraTurn(turn({ reply }), history, alma);
  assert.match(result.reply, /trajeto/);
  assert.doesNotMatch(result.reply, /conhecer primeiro|por onde prefere come[cç]ar/i);
});

accept('20 Newark: planta de 103 m² é enviada e explicada, sem pedir Tipo 01/02', () => {
  const history = [
    u('Pode mandar a tabela do Alma? Não quero ligação.'),
    a('A tabela disponível é de agosto de 2026.'),
    u('Só pesquisando. Moro em Newark. Tem metragem nessa tabela?'),
    a('No Alma, as plantas de três suítes têm 103 ou 114 m², e os duplex de quatro suítes, 145 ou 168 m².'),
    u('Manda a planta de 103 m², só pra olhar. Sem encaminhar.'),
  ];
  const result = postProcessNaraTurn(turn({ reply: 'Tenho as plantas. Para te enviar a correta, quantas suítes você procura?' }), history, alma);
  assert.deepEqual(result.attachment_ids, ['alma-tipo-02']);
  assert.match(result.reply, /103 m²/);
  assert.match(result.reply, /3 su[ií]tes/);
  assert.doesNotMatch(result.reply, /\?/);
  assert.equal(result.handoff, false);
});

accept('21 Lisboa: "o total do menor, não a entrada" responde o total, sem escolher unidade', () => {
  const history = [u('Alma. Dá pra pagar em euro ou é tudo em real?'), a('No Alma, o contrato e os valores são em reais.'), u('Tô em Lisboa. E o mais barato dá quanto em reais?'), a('Você pensa nele para morar ou aproveitar as férias?'), u('Não sei ainda. Quero o total do menor, não a entrada.')];
  const result = postProcessNaraTurn(turn({ reply: 'Vou pedir ao comercial o valor total e o plano completo do Alma Seahouses 1002, incluindo entrada, mensais, reforços e saldo nas chaves.', handoff: true }), history, alma);
  assert.match(result.reply, /R\$\s1\.285\.350,85/);
  assert.doesNotMatch(result.reply, /1002|vou pedir ao comercial/i);
  assert.equal(result.handoff, false);
  const r4 = postProcessNaraTurn(turn({ reply: 'Entendi, sem proposta.', handoff: true }), [...history, a(result.reply), u('Não escolhi unidade. Não precisa pedir proposta pra ninguém.')], alma);
  assert.equal(r4.handoff, false);
});

accept('22 Londres: preço do Soul não volta para o Alma e "volto depois" encerra sem transferência', () => {
  const history = [
    u('Quando entrega o Alma e qual o preço inicial?'),
    a('A entrega do Alma está prevista para julho de 2030.'),
    u('2030 é longe. Tem algo de vocês pronto e mais barato?'),
    a('O Soul Residence, em Itapema, está pronto e tem 2 suítes com 70 m².'),
    u('Sou de Londres. Esse Soul pronto começa em quanto?'),
    a('Estando em Londres, você também pode conhecer o apartamento por videochamada.'),
    u('Videochamada não. Só queria saber preço mesmo. Eu volto depois.'),
  ];
  const result = postProcessNaraTurn(turn({ reply: 'Alma Seahouses: a partir de R$ 1.285.350,85.', handoff: true }), history, soulNoPrice);
  assert.doesNotMatch(result.reply, /Alma/);
  assert.match(result.reply, /Soul/);
  assert.equal(result.handoff, false);
});

accept('22 Londres: "qual o preço inicial?" responde direto, sem pedir permissão', () => {
  const history = [u('Quando entrega o Alma e qual o preço inicial?')];
  const result = postProcessNaraTurn(turn({ reply: 'Posso verificar a previsão de entrega e o preço inicial do Alma Seahouses para você?' }), history, alma);
  assert.match(result.reply, /O Alma Seahouses começa em R\$\s1\.285\.350,85/);
  assert.doesNotMatch(result.reply, /Posso verificar/);
});

accept('23 Dublin: não insiste nas suítes depois de o cliente recusar', () => {
  const history = [
    u('Vocês já entregaram algum prédio? Vi o anúncio do Alma, mas não conheço a empresa.'),
    a('Entregamos o Jazz em 2019 e o Soul em 2023. Você pensa no Alma para morar ou aproveitar com a família?'),
    u('Não decidi nada. Tem foto desses prédios prontos?'),
    a('Tenho imagens do Soul, já entregue. Quantas suítes você procura?'),
    u('Tô em Dublin. Não sei as suítes. Quero só conhecer a empresa primeiro.'),
  ];
  const result = postProcessNaraTurn(turn({
    reply: 'Para conhecer a Bossa com calma, aqui estão fotos do Soul, entregue em Itapema em dezembro de 2023, no prazo mesmo com a pandemia. Quantas suítes você procura?',
    attachment_ids: ['soul-piscina'],
  }), history, alma);
  assert.deepEqual(result.attachment_ids, ['soul-piscina']);
  assert.doesNotMatch(result.reply, /su[ií]tes/i);
  assert.match(result.reply, /fotos do Soul/);
});

accept('24 Seattle: "robô ou pessoa?" não vira nome e a resposta segue a dúvida', () => {
  const history = [u('Isso aqui é robô ou pessoa? Quero tirar uma dúvida do Alma só por mensagem.')];
  const result = postProcessNaraTurn(turn({ reply: 'Oi, robô! sou a Nara, assistente digital da Bossa Empreendimentos. Qual é sua dúvida sobre o Alma?' }), history, alma);
  const final = ensureFirstTurnIntroduction(result.reply, history, {});
  assert.doesNotMatch(final, /rob[oô]!/i);
  assert.match(final, /assistente digital/);
  assert.equal((final.match(/Nara/g) ?? []).length, 1);
  assert.equal(result.handoff, false);
});

accept('24 Seattle: pedido de preço depois de "Posso verificar?" é respondido', () => {
  const history = [u('Isso aqui é robô ou pessoa? Quero tirar uma dúvida do Alma só por mensagem.'), a('Oi! Sou a Nara, assistente digital da Bossa 🙂 Qual é a sua dúvida?'), u('Robô não é meu nome rs. Só queria uma ideia do preço.')];
  const result = postProcessNaraTurn(turn({ reply: 'Posso verificar os valores do Alma Seahouses para você?' }), history, alma);
  assert.match(result.reply, /R\$\s1\.285\.350,85/);
});

accept('24 Seattle: "manda só uma foto da fachada" envia a fachada', () => {
  const history = [u('Isso aqui é robô ou pessoa? Quero tirar uma dúvida do Alma.'), a('Sou a Nara, assistente digital da Bossa.'), u('Não sei ainda. Manda só uma foto da fachada, por favor.')];
  const result = postProcessNaraTurn(turn({ reply: 'Sem problema — você pode conhecer primeiro, sem decidir agora.' }), history, alma);
  assert.deepEqual(result.attachment_ids, ['alma-fachada']);
  assert.match(result.reply, /fachada do Alma/);
  assert.doesNotMatch(result.reply, /\?/);
});

accept('25 Madrid: apresentação não duplica e "o menor de 3" recebe o preço sem "Qual deles"', () => {
  const first = [u('Qual valor do Alma de 2 quartos? Só pesquisando.')];
  const duplicated = 'Oi! Aqui é a Nara, da Bossa 😊 Olá, sou a Nara, da Bossa Empreendimentos, e o Alma tem opções de 3 ou 4 suítes, não de 2 quartos.';
  const r1 = postProcessNaraTurn(turn({ reply: duplicated }), first, { files, commercial: { calls: [{ name: 'buscar_apartamentos', arguments: {}, result: [] }] } });
  assert.equal((r1.reply.match(/Nara/g) ?? []).length, 1, r1.reply);
  const history = [...first, a('Oi! Aqui é a Nara, da Bossa 😊 O Alma tem opções de 3 ou 4 suítes, não de 2 quartos.'), u('Depende do preço. O menor de 3 fica em quanto?')];
  const r2 = postProcessNaraTurn(turn({ reply: 'Alma Seahouses: a partir de R$ 1.285.350,85. Qual deles te interessa mais?' }), history, alma);
  assert.doesNotMatch(r2.reply, /Qual deles/);
  assert.match(r2.reply, /R\$\s1\.285\.350,85/);
});

accept('25 Madrid: "manda a planta desse menor, sem cadastro" envia Tipo 02 sem perguntar finalidade', () => {
  const history = [
    u('Qual valor do Alma de 2 quartos? Só pesquisando.'),
    a('O Alma começa em R$ 1.285.350,85.'),
    u('Esse menor mesmo. Tem varanda?'),
    a('O menor de 3 suítes tem 103 m², living integrado à cozinha e churrasqueira a carvão.'),
    u('Moro em Madrid. Manda a planta desse menor, sem cadastro.'),
  ];
  const result = postProcessNaraTurn(turn({ reply: 'Claro, você pode conhecer a planta de 103 m² sem cadastro. Você pensa no apartamento para férias ou para morar?' }), history, alma);
  assert.deepEqual(result.attachment_ids, ['alma-tipo-02']);
  assert.match(result.reply, /103 m²/);
  assert.doesNotMatch(result.reply, /f[eé]rias|morar\?/i);
});

accept('Planta sem especificar: manda as duas de 3 suítes e oferece o duplex', () => {
  const history = [u('Vi o Alma. Me manda as plantas?')];
  const result = postProcessNaraTurn(turn({ reply: 'Claro!' }), history, alma);
  assert.deepEqual([...result.attachment_ids].sort(), ['alma-tipo-01', 'alma-tipo-02']);
  assert.match(result.reply, /103 m².*114 m²/);
  assert.match(result.reply, /duplex/i);
  const final = ensureFirstTurnIntroduction(result.reply, history, {});
  oneQuestionMax(final);
  const yes = postProcessNaraTurn(turn({ reply: 'Claro!' }), [...history, a(result.reply), u('Quero ver')], alma);
  assert.deepEqual([...yes.attachment_ids].sort(), ['alma-duplex', 'alma-duplex-02']);
  assert.match(yes.reply, /145 m².*168 m²/);
});


// ---------- Rodada 4 (testes ao vivo, cenários 26–35) ----------
accept('26/27: depois de mandar planta não acrescenta "Quantas suítes você procura?"', () => {
  const history = [u('Boa tarde! Me manda as plantas do Alma?'), a('Te mando as plantas do Alma: 103 m² (Tipo 02) e 114 m² (Tipo 01), as duas com 3 suítes. Também tem duplex de 4 suítes, de 145 m² e 168 m². Quer ver?'), u('Gostei da maior de 3 suítes. Manda só ela?')];
  const result = postProcessNaraTurn(turn({ reply: 'Claro!' }), history, alma);
  assert.deepEqual(result.attachment_ids, ['alma-tipo-01']);
  assert.match(result.reply, /114 m²/);
  assert.doesNotMatch(result.reply, /103 m²|\?/);
});

accept('27: "Esse valor sobe até a entrega?" não vira tabela de preço', () => {
  const history = [u('Me manda as plantas do Alma?'), a('O Alma começa em R$ 1.285.350,85.'), u('Esse valor sobe até a entrega?')];
  const reply = 'O saldo direto com a construtora é corrigido pelo CUB até a entrega.';
  const result = postProcessNaraTurn(turn({ reply }), history, alma);
  assert.equal(result.reply, reply);
});

accept('27: "Quero reservar, como faço?" não é "sim" para a oferta de planta', () => {
  const history = [u('Me manda as plantas do Alma?'), a('O Alma começa em R$ 1.285.350,85. Quer que eu te mande a planta da opção de menor valor?'), u('Quero reservar, como faço?')];
  const reply = 'Que ótimo! Vou chamar a Taís do comercial para cuidar da sua reserva.';
  const result = postProcessNaraTurn(turn({ reply, handoff: true }), history, alma);
  assert.equal(result.reply, reply);
  assert.equal(result.handoff, true);
  assert.deepEqual(result.attachment_ids, []);
});

accept('31: "Manda a planta do duplex de 145" acha "Planta Duplex 02" da biblioteca', () => {
  const result = postProcessNaraTurn(turn({ reply: 'Claro.' }), [u('Oi, só pesquisando o Alma.'), a('O Alma fica a 300 m do mar.'), u('Manda a planta do duplex de 145.')], alma);
  assert.deepEqual(result.attachment_ids, ['alma-duplex-02']);
  assert.match(result.reply, /145 m²/);
  assert.doesNotMatch(result.reply, /168/);
});

accept('34: corretor continua no Plantão, sem frase repetida sem sentido', () => {
  const routing = 'Vou direcionar você para o Plantão da Bossa, que atende corretores parceiros.';
  const history = [u('Boa tarde, sou corretor da imobiliária Mar Azul e tenho um cliente pro Alma.'), a(`Oi! Aqui é a Nara, da Bossa 😊 ${routing}`), u('Qual a tabela?'), a(routing), u('Ok, quem me atende?')];
  const result = postProcessNaraTurn(turn({ reply: routing, handoff: true }), history, alma);
  assert.match(result.reply, /Plant[aã]o/);
  assert.doesNotMatch(result.reply, /Sobre a sua d[uú]vida/);
  assert.equal(result.handoff, true);
  const tabela = postProcessNaraTurn(turn({ reply: 'Vou direcionar você.', handoff: true }), history.slice(0, 3), alma);
  assert.equal(tabela.handoff, true, 'pedido de tabela de corretor não desfaz a passagem');
});

accept('Transferência forçada só com pedido real (Soul, entrada, videochamada não)', () => {
  const lead = { id: 'l', organization_id: 'org', kind: 'cliente', stage: 'qualificacao_ia', owner_mode: 'ai', ai_enabled: true, metadata: {} };
  const t = (handoff = false) => turn({ handoff, classification: 'morno', score: 45 });
  for (const message of ['Quanto custa esse Soul?', 'Como fica o pagamento dela? Entrada e parcelas.', 'Videochamada não. Só queria saber preço mesmo. Eu volto depois.', 'Tô em Boston e só pesquisando. Não pedi reserva.', 'Vocês têm algo pronto pra morar?']) {
    assert.equal(deriveHybridDecision({ lead, turn: t(), lastUserMessage: message }).handoffRequired, false, message);
  }
  for (const message of ['Quero reservar, como faço?', 'Quero falar com uma pessoa, pode me ligar amanhã de manhã?']) {
    assert.equal(deriveHybridDecision({ lead, turn: t(), lastUserMessage: message }).handoffRequired, true, message);
  }
});

// ---------- Consulta comercial acompanha a conversa ----------
class Query {
  constructor(rows) { this.rows = rows; this.filters = []; }
  select() { return this; }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
  gt(column, value) { this.filters.push((row) => Number(row[column]) > Number(value)); return this; }
  gte() { return this; }
  lte() { return this; }
  in(column, values) { this.filters.push((row) => values.includes(row[column])); return this; }
  order() { return this; }
  limit() { return this; }
  then(resolve, reject) { return Promise.resolve({ data: this.rows.filter((row) => this.filters.every((f) => f(row))), error: null }).then(resolve, reject); }
  maybeSingle() { return Promise.resolve({ data: this.rows.filter((row) => this.filters.every((f) => f(row)))[0] ?? null, error: null }); }
}
const db = {
  developments: [
    { id: 'alma', organization_id: 'org', name: 'Alma Seahouses', slug: 'alma-seahouses', code: 'ALMA', active: true },
    { id: 'soul', organization_id: 'org', name: 'Soul Residence', slug: 'soul', code: 'SOUL', active: true },
  ],
  development_typologies: [],
  development_units: [
    { id: 'a1002', organization_id: 'org', development_id: 'alma', typology_id: null, unit_code: '1002', floor: 10, status: 'disponivel', list_price: 1285350.85, entry_amount: 192000, installment_count: 80, installment_amount: 5140, payment_plan: {}, price_updated_at: null },
    { id: 's301', organization_id: 'org', development_id: 'soul', typology_id: null, unit_code: '301', floor: 3, status: 'disponivel', list_price: 990000, entry_amount: 200000, installment_count: 36, installment_amount: 10000, payment_plan: {}, price_updated_at: null },
  ],
};
const client = { from: (name) => new Query(db[name] ?? []) };
const lead = { id: 'l', organization_id: 'org', kind: 'cliente', name: 'Teste', enterprise: 'Alma Seahouses', metadata: {} };

const followUp = await loadNaraCommercialTurnContext(client, 'org', lead, [
  u('Oi. Quanto tá o menor do Alma?'), a('O Alma começa em R$ 1.285.350,85.'), u('Tá. E sobe durante a obra?'),
]);
assert.equal(followUp?.calls[0]?.name, 'faixa_empreendimento');
assert.equal(followUp?.calls[0]?.result?.empreendimento, 'Alma Seahouses');
passed.push('Pergunta seguinte ("E sobe durante a obra?") mantém a faixa de preço disponível');

const soulTurn = await loadNaraCommercialTurnContext(client, 'org', lead, [
  u('Quando entrega o Alma?'), a('O Soul está pronto em Itapema.'), u('Esse Soul pronto começa em quanto?'),
]);
assert.equal(soulTurn?.calls[0]?.result?.empreendimento, 'Soul Residence');
passed.push('Pergunta do Soul consulta o Soul, não o Alma do anúncio');

const noPrice = await loadNaraCommercialTurnContext(client, 'org', lead, [u('Isso aqui é robô ou pessoa?')]);
assert.equal(noPrice, null);
passed.push('Conversa sem assunto de preço não consulta tabela');

for (const title of passed) console.log(`✓ ${title}`);
console.log(`Nara rodada 3 (cenários 16–25): ${passed.length} verificações aprovadas.`);
