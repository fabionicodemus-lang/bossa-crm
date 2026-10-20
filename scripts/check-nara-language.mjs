import assert from 'node:assert/strict';
import { ensureFirstTurnIntroduction, enforceNaraTriage } from '../src/lib/ai.ts';
import { postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { collapseRepeatedNaraIntroductions, naraConversationLanguage, requestedNaraLanguage } from '../src/lib/nara-language.ts';

function turn(reply) {
  return {
    reply, classification: 'frio', score: 0, stage: 'ia', summary: '', next_action: '',
    handoff: false, attachment_ids: [], extracted: {
      enterprise: '', purpose: '', typology: '', budget: '', deadline: '',
      decision_maker: '', company: '', creci: '', region: '', client_status: '',
    },
  };
}
const lead = { id: 'test', kind: 'cliente', name: 'Fabio', stage: 'ia', owner_mode: 'ai', ai_enabled: true, metadata: {} };
const first = [{ role: 'user', content: 'Hola! Soy Fabio de Chile' }];
assert.equal(naraConversationLanguage(first), 'es');
let response = ensureFirstTurnIntroduction('¿Buscas un apartamento?', first, {});
response = ensureFirstTurnIntroduction(response, first, {});
response = ensureFirstTurnIntroduction(response, first, {});
assert.equal((response.match(/soy nara/gi) || []).length, 1, 'A saudação da primeira mensagem só ocorre uma vez');
assert.match(response, /^¡Hola, Fabio! Soy Nara, de Bossa/);
const duplicated = '¡Hola, Fabio! Soy Nara, de Bossa 😊 ¡Hola, Fabio! Soy Nara, de Bossa 😊 ¡Hola, Fabio! Soy Nara, de Bossa 😊 ¿Qué necesitas?';
const deduped = collapseRepeatedNaraIntroductions(duplicated);
assert.equal((deduped.match(/Soy Nara/gi) || []).length, 1, 'Corrige até o texto repetido produzido pelo modelo');
const namedPortuguese = ensureFirstTurnIntroduction('Oi! Aqui é a Nara, da Bossa. Vi seu interesse no Flow. Você busca para morar ou investir?', [{role:'user',content:'Vi o anúncio e me interessei, sou a Juliana'}], {});
assert.match(namedPortuguese, /^Oi, Juliana! Aqui é a Nara, da Bossa/);
assert.equal((namedPortuguese.match(/Aqui é a Nara/g) || []).length, 1);
const triage = enforceNaraTriage(turn('¿En qué te puedo ayudar?'), lead, first, {});
assert.match(triage.reply, /^¡Hola, Fabio! Soy Nara, de Bossa/);
assert.doesNotMatch(triage.reply, /¿Buscas un departamento para comprar/);
assert.doesNotMatch(triage.reply, /você|procurando|outro assunto/i);
const followup = [...first,{ role: 'assistant', content: triage.reply },{ role: 'user', content: 'Podes hablar en español?' }];
assert.equal(requestedNaraLanguage('Podes hablar en español?'), 'es');
const switched = enforceNaraTriage(turn('Lo siento, voy a transferirte.'), lead, followup, {});
assert.equal(switched.handoff, false, 'Idioma solicitado não pode disparar transferência');
assert.match(switched.reply, /Podemos conversar en español/);
assert.doesNotMatch(switched.reply, /Vou encaminhar|atendente|para o time|outro assunto/i);
const processed = postProcessNaraTurn(switched, followup);
assert.equal(processed.handoff, false, 'Pós-processamento não altera a decisão do turno de idioma');
assert.equal(processed.reply, switched.reply);
assert.equal((processed.reply.match(/Soy Nara/gi) || []).length, 0, 'Não repetir apresentação depois de iniciar conversa');
const noMoreIntroductions = ensureFirstTurnIntroduction('¡Hola, Fabio! Soy Nara, de Bossa 😊 Te muestro el Flow.', followup, {});
assert.equal(noMoreIntroductions, 'Te muestro el Flow.');
assert.equal(naraConversationLanguage([...followup, {role:'assistant',content:processed.reply},{role:'user',content:'¿Cuánto cuesta el Flow?'}]),'es');
assert.equal(requestedNaraLanguage('Podes falar em português?'),'pt');
assert.equal(naraConversationLanguage([{role:'user',content:'Hello, I am Jack'}]),'en');
console.log('Nara: primeira saudação única, sem pergunta de triagem e troca de idioma sem transferência — OK.');
