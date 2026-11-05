import assert from 'node:assert/strict';
import {
  DEFAULT_NARA_CONSULTATIVE_PROMPT,
  NARA_COMMERCIAL_SAFETY_POLICY,
  NARA_CONVERSATION_POLICY,
  buildNaraConversationInstructions,
} from '../src/lib/nara-conversation-policy.ts';
import {
  NARA_PROMPT_MARKER,
  extractNaraPrompt,
  naraKnowledgeForEditor,
  naraPromptPhase9Issues,
  normalizeNaraKnowledge,
  upgradeNaraPromptPhase9,
} from '../src/lib/nara-prompt-config.ts';
import { postProcessNaraTurn } from '../src/lib/ai-v120.ts';
import { firstMessageBody } from '../src/lib/nara-first-message.ts';

// A new/empty configuration gets a complete, editable prompt, without silently
// persisting a new version or changing the storage contract.
assert.equal(buildNaraConversationInstructions(), DEFAULT_NARA_CONSULTATIVE_PROMPT);
assert.equal(buildNaraConversationInstructions('  '), DEFAULT_NARA_CONSULTATIVE_PROMPT);
assert.equal(buildNaraConversationInstructions(DEFAULT_NARA_CONSULTATIVE_PROMPT), DEFAULT_NARA_CONSULTATIVE_PROMPT);
assert.ok(DEFAULT_NARA_CONSULTATIVE_PROMPT.startsWith(NARA_PROMPT_MARKER));
assert.deepEqual(naraPromptPhase9Issues(DEFAULT_NARA_CONSULTATIVE_PROMPT), []);
assert.equal(naraKnowledgeForEditor({}).triagem_pergunta_inicial, DEFAULT_NARA_CONSULTATIVE_PROMPT);
assert.equal(extractNaraPrompt({}), '');

// Saved manager-specific instructions remain intact in storage and in the UI.
// Obsolete style/source rules are subordinated to the current runtime policy.
const savedPrompt = `${NARA_PROMPT_MARKER}\n\nFale espanhol com contatos que usam espanhol.\nUse no máximo duas frases e 45 palavras.\nUse os valores já informados na conversa.`;
const savedKnowledge = { prompt_final: savedPrompt, diferenciais: 'Use apenas o catálogo oficial.' };
const before = JSON.stringify(savedKnowledge);
const effective = buildNaraConversationInstructions(extractNaraPrompt(savedKnowledge));
assert.ok(effective.includes(savedPrompt));
assert.ok(effective.indexOf(NARA_CONVERSATION_POLICY) > effective.indexOf(savedPrompt));
assert.ok(effective.indexOf(NARA_COMMERCIAL_SAFETY_POLICY) > effective.indexOf(savedPrompt));
assert.equal(effective.split(NARA_COMMERCIAL_SAFETY_POLICY).length - 1, 1);
assert.equal(naraKnowledgeForEditor(savedKnowledge).triagem_pergunta_inicial, savedPrompt);
assert.equal(normalizeNaraKnowledge(savedKnowledge).prompt_final, savedPrompt);
assert.equal(JSON.stringify(savedKnowledge), before);

// Saving the offered default through the legacy editor field round-trips to
// prompt_final. Restoring an older prompt does not remove the runtime policy.
const normalizedDefault = normalizeNaraKnowledge({
  triagem_pergunta_inicial: DEFAULT_NARA_CONSULTATIVE_PROMPT,
});
assert.equal(normalizedDefault.prompt_final, DEFAULT_NARA_CONSULTATIVE_PROMPT);
assert.equal(extractNaraPrompt(normalizedDefault), DEFAULT_NARA_CONSULTATIVE_PROMPT);
assert.ok(buildNaraConversationInstructions(savedPrompt).endsWith(NARA_COMMERCIAL_SAFETY_POLICY));

// Consultative selling must help the buyer decide, without inventing
// urgency or demanding a budget in exchange for basic information.
assert.match(NARA_CONVERSATION_POLICY, /CONDUÇÃO DE PRÉ-VENDA/);
assert.match(NARA_CONVERSATION_POLICY, /primeiro entregue a resposta/i);
assert.match(NARA_CONVERSATION_POLICY, /Não faça essas perguntas em sequência/);
assert.match(NARA_CONVERSATION_POLICY, /Nunca invente desconto/);
assert.match(NARA_CONVERSATION_POLICY, /a referência oficial é 300 m do mar/);
const almaOpening = firstMessageBody({ intro: 'Oi, sou Nara.', language: 'pt', development: 'alma', place: '' });
assert.match(almaOpening, /300 m do mar/);
assert.doesNotMatch(almaOpening, /4 minutos|4 min/);

const customerTurn = (reply) => ({
  reply, classification: 'morno', score: 30, stage: 'ia', summary: '', next_action: '', handoff: false,
  attachment_ids: [], extracted: { enterprise: '', purpose: '', typology: '', budget: '', deadline: '', decision_maker: '', company: '', creci: '', region: '', client_status: '' },
});
const browsing = postProcessNaraTurn(
  customerTurn('Vou transferir você para um vendedor.'),
  [{ role: 'user', content: 'Não quero comprar agora, mas gostaria de saber onde fica o Flow.' }],
  {},
);
assert.equal(browsing.handoff, false);
assert.match(browsing.reply, /maps\/search/);
const declined = postProcessNaraTurn(
  customerTurn('Vou transferir você para um vendedor.'),
  [{ role: 'user', content: 'Não quero comprar.' }],
  {},
);
assert.equal(declined.handoff, false);
assert.equal(declined.classification, 'sem_interesse');
assert.match(declined.reply, /Não vou insistir/);

const beachObjection = postProcessNaraTurn(
  customerTurn('Para ir com criança pequena, 800 m podem pesar mesmo. O Flow tem dois pavimentos de lazer; vale comparar o uso que vocês fariam.'),
  [
    { role: 'user', content: 'Procuramos três quartos no Flow para a família.' },
    { role: 'assistant', content: 'O Flow tem duplex de 93 e 117,7 m². Para quando vocês pretendem se mudar?' },
    { role: 'user', content: 'Tenho criança pequena e 800 metros é longe com carrinho. Será que vale a pena?' },
  ],
  {},
);
assert.match(beachObjection.reply, /800 m podem pesar/);
assert.doesNotMatch(beachObjection.reply, /planta do Flow|Te explico as plantas/);
const offPlanRisk = postProcessNaraTurn(
  customerTurn('Comprar na planta envolve riscos; vale olhar histórico de entregas e andamento da obra.'),
  [{ role: 'user', content: 'Gostei do Flow' }, { role: 'assistant', content: 'O Flow está em construção.' }, { role: 'user', content: 'Comprar na planta é arriscado no Flow?' }],
  {},
);
assert.match(offPlanRisk.reply, /envolve riscos/);
assert.doesNotMatch(offPlanRisk.reply, /planta do Flow|Te explico as plantas/);

// Upgrading a known legacy scoring rubric must not recreate the old prerequisite
// that a customer disclose intended use before receiving a unit's current price.
const legacyScore = `${NARA_PROMPT_MARKER}\n\n### Pontuação\nUSO definido **+2**; 9 ou mais = quente\n\n---\n\n## 7. PREÇO\n\n**Nunca pule para o nível 3 antes de saber o uso.** Valor de apartamento específico sem contexto é só um número grande — e número grande sozinho afasta.`;
const upgraded = upgradeNaraPromptPhase9(legacyScore);
assert.doesNotMatch(upgraded, /Nunca pule para o nível 3 antes de saber o uso|exige USO e intenção confirmados/);
assert.deepEqual(naraPromptPhase9Issues(upgraded), []);
assert.equal(upgradeNaraPromptPhase9(upgraded), upgraded);

console.log('Política consultiva validada: prompt padrão, personalização preservada, prioridade atual e migração sem qualificação obrigatória.');
