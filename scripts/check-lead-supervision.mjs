import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
assert.match(detail, /supervis/);
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

console.log('Supervisão de lead validada: transferência humana e orientação interna da Nara sem troca de dono.');
