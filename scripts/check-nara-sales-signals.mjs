import assert from 'node:assert/strict';
import {
  financialNegotiationIntent,
  refusesHandoff,
  explicitHumanRequest,
} from '../src/lib/nara-conversation-signals.ts';
import {
  isAssistedSaleSignal,
  isBrokerRoutingSignal,
  isPostSaleRoutingSignal,
  isSupplierRoutingSignal,
} from '../src/lib/nara-contact-routing.ts';

const financialMessages = [
  'Qual é o valor da entrada do Flow?',
  'Tenho R$ 200.000 para dar de entrada.',
  'Tenho R$ 200.000 de entrada do apartamento.',
  'A entrada do apartamento seria 200 mil?',
  'Qual a entrada mínima?',
  'Qual é o valor da entrada do apartamento?',
  'Qual a entrada do apartamento?',
  'Qual é a entrada do apartamento?',
  'Qual é a entrada da planta maior?',
  'Qual seria a entrada da unidade?',
  'Qual a entrada do apartamento com a sala maior?',
  'A entrada da planta maior dá para a sala? E qual a entrada do apartamento?',
  'A entrada da unidade dá para a sala, e qual é a entrada da planta maior?',
  'A entrada do empreendimento é pela rua principal? Qual a entrada do apartamento?',
  'Qual a entrada do apartamento? A entrada física abre para a sala?',
  'Quanto preciso dar de entrada do apartamento?',
  'A entrada pode ser menor?',
  'Não tenho entrada. Dá para conversar?',
  'Consigo comprar sem entrada?',
  'Quanto fica a parcela?',
  'Dá para parcelar? Quero um parcelamento mais longo.',
  'Dá para parcelar?',
  'Consigo pagar R$ 5.000 por mês.',
  'Eu consigo 5 mil por mês.',
  'Quanto fica por mês?',
  'Vocês fazem em 100x?',
  'Pode ser em 60 vezes?',
  'Como funcionam os reforços?',
  'Posso fazer dois reforços anuais?',
  'Qual o valor nas chaves?',
  'Quanto eu pago na entrega das chaves?',
  'As chaves têm pagamento?',
  'E o saldo do imóvel?',
  'E o saldo?',
  'Qual o saldo restante?',
  'Quero pagar o restante depois.',
  'Quanto preciso dar de sinal?',
  'O sinal é de 50 mil?',
  'Qual a forma de pagamento?',
  'Como funciona a condição de pagamento?',
  'Como funciona o pagamento?',
  'Qual o fluxo de pagamento do Alma?',
  'Posso pagar direto com a construtora?',
  'Tem financiamento?',
  'À vista tem um valor diferente?',
  'À vista?',
  'E à vista?',
  'Qual o preço à vista?',
  'Se eu pagar à vista, melhora?',
  'R$ 900.000 à vista.',
  'À vista 900 mil.',
  'Eu pago R$ 900 mil à vista.',
  'Fechamos por 900 mil?',
  'Ofereço 900 mil.',
  'Consigo dar 200 mil.',
  'Vocês aceitam permuta?',
  'Podem aceitar meu apartamento como parte do pagamento?',
  'Meu imóvel serviria como parte do pagamento?',
  'Aceitam carro?',
  'Vocês aceitariam um terreno no negócio?',
  'Gostaria de um pagamento combinado: parte imóvel e parte dinheiro.',
  '¿Aceptan mi apartamento como parte del pago?',
  'Can I use my apartment as part payment?',
  'Tem desconto?',
  'Estou pensando em fazer uma proposta.',
  'Quero montar uma contraproposta.',
  'Gostei. Vamos negociar.',
  'Não quero fazer uma proposta agora, mas qual seria a entrada?',
  'Quero saber a entrada, mas sem corretor.',
  'Tenho 200 mil para entrada, mas não me passe para ninguém agora. Ainda não vou fazer proposta.',
  'Tem juros ou correção?',
  'Dá para ser sem correção?',
  'CUB até as chaves e IPCA depois?',
  'Como é o reajuste?',
  'Gostei da entrada do prédio. Qual o valor da entrada para comprar?',
  'A porta tem 100 x 80 cm. E o apartamento pode ser em 100x?',
  '¿Cuánto es el anticipo?',
  '¿Se puede pagar en cuotas?',
  '¿Aceptan una propuesta?',
  '¿Cuál es el plan de pago?',
  '¿Hay descuento al contado?',
  'How much is the down payment?',
  'Can I pay in installments?',
  'What are the payment terms?',
  'Is there a cash price?',
  'I can offer 900000.',
  'I want to make an offer.',
];
for (const message of financialMessages) {
  assert.equal(financialNegotiationIntent(message), true, `Deveria encaminhar condição comercial: ${message}`);
}

const informationMessages = [
  'Quanto custa o apartamento mais barato do Flow?',
  'Qual o valor total?',
  'Só quero o preço do Alma.',
  'Tenho um orçamento total de 1,5 milhão.',
  'Tenho 200 mil.',
  'Até 900 mil.',
  'Qual unidade tem três suítes?',
  'Como é a entrada do prédio?',
  'A entrada social é acessível?',
  'Pode mandar foto da entrada?',
  'Qual a largura da entrada?',
  'O hall de entrada tem pé-direito duplo?',
  'A entrada é acessível?',
  'A entrada da garagem tem rampa?',
  'A entrada da planta maior dá para a sala ou para um corredor?',
  'A entrada da unidade dá para a sala ou para um corredor?',
  'A entrada do apto dá acesso à sala?',
  'A entrada da casa abre para a cozinha?',
  'A entrada do imóvel dá para a sala?',
  'A entrada do empreendimento é pela rua principal?',
  'A entrada da torre dá acesso ao hall?',
  'Qual é a entrada do apartamento: a que abre para a sala ou para o corredor?',
  'Qual é a entrada da planta maior, a que dá para a sala ou para o corredor?',
  'Qual é a entrada do apartamento mais iluminada?',
  'Qual entrada devo usar?',
  'Qual é a entrada que devo usar?',
  'Por qual entrada eu entro?',
  'Por onde entra no apartamento?',
  'A entrada fica por onde?',
  'A entrada dá acesso à sala?',
  'A entrada principal fica na rua da frente?',
  'A porta tem 100 x 80 cm?',
  'Como ficou o reforço estrutural?',
  'Qual a proposta arquitetônica do empreendimento?',
  'Qual a proposta de lazer?',
  'Qual a proposta da construtora para a área de lazer?',
  'Tem sinal de celular no prédio?',
  'Quando entregam as chaves?',
  'Como funciona a entrega das chaves?',
  'Como é a vista do apartamento?',
  'A vista do mar é definitiva?',
  'Me mostra a vista da sacada.',
  'Qual o valor mensal do condomínio?',
  'Quanto custa o condomínio por mês?',
  'Alma fica a 300m do mar?',
  'Quero uma visita presencial.',
  'Podemos fazer uma videochamada?',
  'Gostei da planta, pode enviar.',
  'Não quero proposta, só a planta.',
  'Não quero fazer uma proposta.',
  'Não quero receber proposta nem desconto.',
  'Não quero negociar.',
  'Não estou pensando em proposta.',
  'Não quero falar de entrada agora, só o preço total.',
  'Não quero discutir as parcelas agora.',
  'Não sei ainda. Quero o total do menor, não a entrada.',
  'Quero o valor total, não o valor da entrada.',
  'Não quero falar da forma de pagamento.',
  'Não quero discutir a condição de pagamento agora.',
  'Não quero saber de entrada nem parcelas.',
  'Sem proposta por enquanto.',
  'Proposta não. Só quero conhecer a Bossa.',
  'Já sou cliente. Preciso da segunda via do boleto.',
  'Quero saber sobre assistência técnica.',
  '¿Cómo es la entrada del edificio?',
  'No quiero una propuesta, solo información.',
  'What is the total price?',
  "I don't want to make an offer.",
  'No proposal for now.',
];
for (const message of informationMessages) {
  assert.equal(financialNegotiationIntent(message), false, `Não deveria transformar informação/recusa em negociação: ${message}`);
}

const entryQuestion = [{ role: 'assistant', content: 'Quanto você pretende dar de entrada?' }];
for (const answer of ['200 mil', 'R$ 200.000', 'Tenho 200000', '20%', 'Duzentos mil', 'Até 100 mil']) {
  assert.equal(financialNegotiationIntent(answer, entryQuestion), true, `Resposta financeira curta: ${answer}`);
  assert.equal(financialNegotiationIntent(answer, [...entryQuestion, { role: 'user', content: answer }]), true);
}
const offerQuestion = [{ role: 'assistant', content: 'Quer apresentar uma proposta para o comercial avaliar?' }];
for (const answer of ['Sim', 'Pode ser', 'Vamos', 'Quero', 'Claro', 'Sim, pode ser', 'Sim, pode chamar']) {
  assert.equal(financialNegotiationIntent(answer, offerQuestion), true);
}
assert.equal(financialNegotiationIntent('Não', offerQuestion), false);
assert.equal(financialNegotiationIntent('Não sei ainda', offerQuestion), false);
assert.equal(financialNegotiationIntent('Não quero', offerQuestion), false);
assert.equal(financialNegotiationIntent('Não, só a planta', entryQuestion), false);
assert.equal(financialNegotiationIntent('200', [{ role: 'assistant', content: 'Qual é a unidade?' }]), false);
assert.equal(financialNegotiationIntent('Sim', [{ role: 'assistant', content: 'Quer marcar uma visita?' }]), false);
assert.equal(financialNegotiationIntent('Sim', [{ role: 'assistant', content: 'A tabela tem parcelas. Quer conhecer a planta?' }]), false);
assert.equal(financialNegotiationIntent('200 mil', [
  ...entryQuestion,
  { role: 'user', content: 'Vamos mudar de assunto.' },
]), false);

const physicalEntryHistory = [
  { role:'user', content:'A entrada da planta maior dá para a sala ou para um corredor?' },
  { role:'assistant', content:'Para confirmar se ela abre para a sala ou um corredor, posso mostrar a planta.' },
];
for (const question of ['Qual a entrada do apartamento?', 'Qual é a entrada do apartamento?', 'Qual é a entrada da planta maior?']) {
  assert.equal(financialNegotiationIntent(question, physicalEntryHistory), true, `Pergunta financeira atual não herda contexto físico: ${question}`);
  assert.equal(financialNegotiationIntent(question, [...physicalEntryHistory, {role:'user',content:question}]), true);
}
for (const question of ['Qual entrada devo usar?', 'Qual é a entrada do apartamento: a que abre para a sala ou para o corredor?']) {
  assert.equal(financialNegotiationIntent(question, physicalEntryHistory), false, `Acesso físico inequívoco não é negociação: ${question}`);
}

// A conversa financeira é um sinal separado, não uma troca de perfil/consentimento.
assert.equal(refusesHandoff('Quero saber a entrada, mas sem corretor.'), true);
for (const message of [
  'Tenho 200 mil para entrada, mas não me passe para ninguém agora. Ainda não vou fazer proposta.',
  'Não me passa para o comercial agora.',
  'Não me passe adiante.',
  'Não me passe.',
  'Não me transfira para ninguém.',
  'Não precisa me transferir agora.',
  'Não quero ser transferida.',
  'Não passe meu contato para ninguém.',
  'No me pase a un vendedor ahora.',
  'No me transfiera a nadie.',
  'No me llamen.',
  "Don't transfer me.",
  'Do not contact me.',
  'Please don’t call me.',
  "I don't want to be transferred.",
]) {
  assert.equal(refusesHandoff(message), true, `Recusa de encaminhamento/contato não respeitada: ${message}`);
}
for (const message of [
  'Pode me passar para o comercial.',
  'Pode me transferir agora.',
  'Não me passe um preço errado.',
  'No me pase un precio equivocado.',
  'Please call me.',
  'Can you transfer me to the sales team?',
]) {
  assert.equal(refusesHandoff(message), false, `Não é recusa de contato: ${message}`);
}
for (const message of [
  'Tenho 200 mil para entrada, mas não quero falar com uma pessoa.',
  'Quero saber as parcelas, sem atendimento humano.',
  'Não quero atendimento humano, só saber a entrada.',
  'Tenho entrada, mas não quero falar agora com uma pessoa.',
  'Quero entender as parcelas, mas não quero ser atendida por uma pessoa.',
]) {
  assert.equal(financialNegotiationIntent(message), true);
  assert.equal(refusesHandoff(message), true, `Recusa de pessoa/humano não detectada: ${message}`);
  assert.equal(explicitHumanRequest(message), false, `Pedido humano negado não pode vencer a recusa: ${message}`);
}
for (const message of [
  'Não queria antes, mas agora quero falar com alguém.',
  'Não quero uma pessoa agora. Pensando bem, quero falar com uma pessoa.',
  'Não quero atendimento humano por enquanto, mas agora quero falar com o comercial.',
  'Quero falar com uma pessoa.',
]) {
  assert.equal(explicitHumanRequest(message), true, `Pedido positivo posterior deve ser preservado: ${message}`);
}
assert.equal(isAssistedSaleSignal('Tenho 200 mil de entrada.'), false);
assert.equal(isAssistedSaleSignal('Meu corretor me indicou vocês. Tenho 200 mil de entrada.'), true);
assert.equal(isBrokerRoutingSignal('Sou corretor e meu cliente quer uma proposta com 200 mil de entrada.'), true);
assert.equal(isPostSaleRoutingSignal('Já sou cliente, preciso do boleto da minha parcela.'), true);
assert.equal(isSupplierRoutingSignal('Sou fornecedor e quero apresentar uma proposta comercial de esquadrias.'), true);

console.log(`Sinais de negociação validados: ${financialMessages.length} condições comerciais, ${informationMessages.length} informações/recusas, continuidade curta e separação de perfis.`);
