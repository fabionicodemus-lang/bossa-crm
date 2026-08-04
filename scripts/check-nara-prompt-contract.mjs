import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/nara-prompt-config.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const contract = await import(moduleUrl);

const legacyPrompt = `${contract.NARA_PROMPT_MARKER}\n\n<PERGUNTA_TRIAGEM>\nVocê está buscando um imóvel para comprar?\n</PERGUNTA_TRIAGEM>\n\nConteúdo operacional.`;
const migrated = contract.normalizeNaraKnowledge({
  triagem_pergunta_inicial: legacyPrompt,
  missao: 'Atender bem.',
});
assert.equal(migrated.prompt_final, legacyPrompt);
assert.equal(migrated.triagem_pergunta_inicial, 'Você está buscando um imóvel para comprar?');
assert.equal(migrated.missao, 'Atender bem.');

const editor = contract.naraKnowledgeForEditor(migrated);
assert.equal(editor.triagem_pergunta_inicial, legacyPrompt);
assert.equal(editor.prompt_final, undefined);

const current = contract.normalizeNaraKnowledge({
  prompt_final: legacyPrompt,
  triagem_pergunta_inicial: 'Pergunta antiga?',
});
assert.equal(current.prompt_final, legacyPrompt);
assert.equal(current.triagem_pergunta_inicial, 'Você está buscando um imóvel para comprar?');

assert.equal(contract.extractMarkedTriageQuestion('# PROMPT FINAL DA NARA\nSem marcador.'), '');
assert.equal(contract.extractMarkedTriageQuestion('<PERGUNTA_TRIAGEM>Sem fechamento?'), '');
assert.equal(contract.extractMarkedTriageQuestion('<PERGUNTA_TRIAGEM>Texto sem interrogação</PERGUNTA_TRIAGEM>'), '');

const withoutMarker = contract.normalizeNaraKnowledge({
  prompt_final: `${contract.NARA_PROMPT_MARKER}\nPrompt sem pergunta marcada.`,
});
assert.equal(withoutMarker.triagem_pergunta_inicial, contract.DEFAULT_NARA_TRIAGE_QUESTION);

const promptV3Sized = `${contract.NARA_PROMPT_MARKER}\n${'x'.repeat(34_410)}`;
assert.doesNotThrow(() => contract.normalizeNaraKnowledge({ prompt_final: promptV3Sized }));
assert.throws(
  () => contract.normalizeNaraKnowledge({
    prompt_final: `${contract.NARA_PROMPT_MARKER}\n${'x'.repeat(contract.NARA_PROMPT_MAX_LENGTH)}`,
  }),
  /ultrapassa o limite/,
);

console.log('Contrato do prompt final da Nara validado.');
