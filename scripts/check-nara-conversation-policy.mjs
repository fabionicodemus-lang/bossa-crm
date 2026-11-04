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

// Upgrading a known legacy scoring rubric must not recreate the old prerequisite
// that a customer disclose intended use before receiving a unit's current price.
const legacyScore = `${NARA_PROMPT_MARKER}\n\n### Pontuação\nUSO definido **+2**; 9 ou mais = quente\n\n---\n\n## 7. PREÇO\n\n**Nunca pule para o nível 3 antes de saber o uso.** Valor de apartamento específico sem contexto é só um número grande — e número grande sozinho afasta.`;
const upgraded = upgradeNaraPromptPhase9(legacyScore);
assert.doesNotMatch(upgraded, /Nunca pule para o nível 3 antes de saber o uso|exige USO e intenção confirmados/);
assert.deepEqual(naraPromptPhase9Issues(upgraded), []);
assert.equal(upgradeNaraPromptPhase9(upgraded), upgraded);

console.log('Política consultiva validada: prompt padrão, personalização preservada, prioridade atual e migração sem qualificação obrigatória.');
