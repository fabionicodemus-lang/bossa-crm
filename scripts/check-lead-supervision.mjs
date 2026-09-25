import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  mergeSupervisorAttachmentIds,
  promoteSupervisorFiles,
  requestsAllEnterpriseFacades,
  selectAllEnterpriseFacadeIds,
} from '../src/lib/nara-supervisor-guidance.ts';

const handoff = readFileSync(new URL('../src/app/api/leads/[id]/handoff/route.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/components/LeadDetail.tsx', import.meta.url), 'utf8');
const guidance = readFileSync(new URL('../src/app/api/leads/[id]/ai-guidance/route.ts', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
const v120 = readFileSync(new URL('../src/lib/ai-v120.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/app/(crm)/leads/[id]/page.tsx', import.meta.url), 'utf8');

assert.match(handoff, /\['accept', 'transfer'\]/);
assert.match(handoff, /owner_mode: 'human'/);
assert.match(handoff, /ai_enabled: false/);
assert.match(handoff, /fechado_ganho/);
assert.match(handoff, /owner_name/);

assert.match(detail, /Transferir para…/);
assert.match(detail, /Orientar a \{persona\}/);
assert.match(detail, /api\/leads\/\$\{lead\.id\}\/ai-guidance/);
assert.match(detail, /A instrução é interna/);
assert.match(page, /Cíntia/);

assert.match(guidance, /owner_mode !== 'ai'/);
assert.match(guidance, /generateSupervisedAiTurn/);
assert.match(guidance, /sender_kind: 'ia'/);
assert.match(guidance, /orientacao_ia_manual/);
assert.match(guidance, /supervisor_instruction/);
assert.match(guidance, /rankAiFilesForConversation/);
assert.doesNotMatch(guidance, /owner_mode:\s*'human'/);

assert.match(ai, /supervisor_instruction\?: string \| null/);
assert.match(ai, /ORIENTAÇÃO INTERNA DO GESTOR/);
assert.match(v120, /generateSupervisedAiTurn/);
assert.match(v120, /enforceNaraReplyGuardrails/);
assert.match(ai, /TURNO SUPERVISIONADO PELO GESTOR/);
assert.match(ai, /!context\.supervisor_instruction\?\.trim\(\)/);
assert.match(guidance, /mergeSupervisorAttachmentIds/);
assert.match(guidance, /promoteSupervisorFiles/);

const file = (id, title, keywords) => ({
  id,
  category: 'imagem',
  title,
  description: null,
  trigger_keywords: keywords,
  storage_bucket: 'bucket',
  storage_path: id + '.jpg',
  original_name: id + '.jpg',
  mime_type: 'image/jpeg',
});
const files = [
  file('soul', 'SOUL BOSSA', ['Soul', 'pronto', 'imagens']),
  file('flow', 'Fachada Flow Rua: São José', ['fachada', 'Flow', 'fotos']),
  file('alma', 'Fachada Alma', ['fachada', 'Alma', 'imagens']),
  file('flow-rooftop', 'Flow Rooftop', ['Flow', 'lazer']),
];

const instruction = 'Fale um pouco de cada empreendimento nosso e mande a foto da fachada de cada um.';
assert.equal(requestsAllEnterpriseFacades(instruction), true);
assert.deepEqual(selectAllEnterpriseFacadeIds(instruction, files), ['soul', 'flow', 'alma']);
assert.deepEqual(
  mergeSupervisorAttachmentIds({
    instruction,
    files,
    modelAttachmentIds: ['flow-rooftop'],
  }),
  ['soul', 'flow', 'alma'],
);
assert.deepEqual(
  promoteSupervisorFiles({
    instruction,
    allFiles: files,
    rankedFiles: [files[3]],
    limit: 40,
  }).slice(0, 3).map((item) => item.id),
  ['soul', 'flow', 'alma'],
);

console.log('Supervisão de lead validada: transferência humana, prioridade da orientação e fachadas Soul/Flow/Alma.');
