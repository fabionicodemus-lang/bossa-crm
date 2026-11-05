import assert from 'node:assert/strict';
import { buildAiInstructions } from '../src/lib/ai.ts';
import {
  NARA_COMMERCIAL_SAFETY_POLICY,
  NARA_CONVERSATION_POLICY,
} from '../src/lib/nara-conversation-policy.ts';

const lead = {
  id: 'lead', organization_id: 'org', kind: 'cliente', name: 'Teste',
  stage: 'ia', enterprise: 'Flow Aptos', metadata: {},
};
const naraLayer = buildAiInstructions(lead, {});
const plantaoLayer = buildAiInstructions({ ...lead, kind: 'corretor' }, {});

assert.ok(naraLayer.includes(NARA_CONVERSATION_POLICY));
assert.ok(naraLayer.includes(NARA_COMMERCIAL_SAFETY_POLICY));
assert.doesNotMatch(naraLayer, /Sua ordem obrigatória é/);
assert.doesNotMatch(naraLayer, /ETAPA 1 — TRIAGEM OBRIGATÓRIA/);
assert.doesNotMatch(naraLayer, /ETAPA 2 — QUALIFICAÇÃO/);
assert.doesNotMatch(naraLayer, /Use no máximo duas frases curtas/);
assert.doesNotMatch(naraLayer, /(?:use|deve ter|no máximo)\s+45 palavras/i);
assert.doesNotMatch(naraLayer, /exige USO e intenção confirmados|só podem ser informados quando a intenção de compra estiver confirmada/i);
assert.match(naraLayer, /Distância oficial do Alma ao mar: 300 m/);
assert.doesNotMatch(naraLayer, /cerca de 4 minutos a pé|quem reserva agora garante o preço/i);
assert.match(naraLayer, /Não prometa unilateralmente que a reserva garante preço/);
assert.match(naraLayer, /pré-vendedora digital da Bossa Empreendimentos/);

// Verify the actual prompt sent by the application: manager customization is
// present once, while current source/style policies follow and take precedence.
const managerPrompt = '# PROMPT FINAL DA NARA\n\nPERSONALIZAÇÃO_TESTE: mantenha uma conversa acolhedora.';
const configuredLayer = buildAiInstructions(lead, {
  config: {
    knowledge: { prompt_final: managerPrompt, missao: 'CONHECIMENTO_TESTE: atender bem.' },
    persona: { tone: 'PERSONA_LEGADA_IGNORADA' },
    first_message: 'PRIMEIRA_MENSAGEM_LEGADA_IGNORADA',
  },
});
assert.equal(configuredLayer.split(managerPrompt).length - 1, 1);
assert.ok(configuredLayer.includes('CONHECIMENTO_TESTE: atender bem.'));
assert.ok(configuredLayer.lastIndexOf(NARA_CONVERSATION_POLICY) > configuredLayer.indexOf(managerPrompt));
assert.ok(configuredLayer.lastIndexOf(NARA_COMMERCIAL_SAFETY_POLICY) > configuredLayer.indexOf(managerPrompt));
assert.doesNotMatch(configuredLayer, /PERSONA_LEGADA_IGNORADA|PRIMEIRA_MENSAGEM_LEGADA_IGNORADA/);

// Broker routing and commercial operating rules remain present in its own prompt.
assert.match(plantaoLayer, /QUANDO PASSAR PARA A TAÍS \(somente nestes casos\)/);
assert.match(plantaoLayer, /Comissão padrão: 5%/);
assert.match(plantaoLayer, /entrada é maior que a da tabela/);
assert.match(plantaoLayer, /Corretor NÃO cadastrado/);

console.log('Prompt efetivo validado: política atual, personalização preservada, consulta sem qualificação obrigatória e roteamento do Plantão.');
