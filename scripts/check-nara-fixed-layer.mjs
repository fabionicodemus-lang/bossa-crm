import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
const naraStart = source.indexOf("if (lead.kind === 'cliente')");
const plantaoStart = source.indexOf('\n\n  return `${shared}', naraStart);
assert.notEqual(naraStart, -1);
assert.notEqual(plantaoStart, -1);

const naraLayer = source.slice(naraStart, plantaoStart);
const plantaoLayer = source.slice(plantaoStart);

assert.match(source, /extractNaraPrompt/);
assert.match(source, /PROMPT FINAL DEFINIDO PELO GESTOR — CAMADA PRINCIPAL DE COMPORTAMENTO/);
assert.match(source, /delete generalKnowledge\.prompt_final/);
assert.match(source, /!finalPrompt && persona/);
assert.match(source, /!finalPrompt && context\.config\?\.first_message/);
assert.doesNotMatch(source, /A qualificação só pode começar/);
assert.match(source, /A pergunta direta de triagem é exceção/);
assert.match(naraLayer, /O Prompt final define o ritmo, o tom, a ordem da conversa e o tamanho das mensagens/);
assert.match(naraLayer, /sem checklist e sem ordem obrigatória/);
assert.doesNotMatch(naraLayer, /Sua ordem obrigatória é/);
assert.doesNotMatch(naraLayer, /ETAPA 1 — TRIAGEM OBRIGATÓRIA/);
assert.doesNotMatch(naraLayer, /ETAPA 2 — QUALIFICAÇÃO/);
assert.doesNotMatch(naraLayer, /Use no máximo duas frases curtas/);
assert.match(plantaoLayer, /Use no máximo duas frases curtas e uma pergunta por mensagem/);

console.log('Camada fixa da Nara validada sem sequência rígida nem limite duplicado.');
