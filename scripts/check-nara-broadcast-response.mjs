import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  broadcastResponseAction,
  clientNoReplyReason,
  shouldForceBroadcastReply,
} from '../src/lib/nara-broadcast-rules.ts';
import { agendaActionFromText } from '../src/lib/nara-agenda-intent.ts';
import {
  isGenericPortfolioInterest,
  selectPortfolioFacadeIds,
} from '../src/lib/nara-generic-interest.ts';

const base = {
  stage: 'futuro',
  owner_mode: 'ai',
  ai_enabled: true,
  automation_paused: false,
  opt_out: false,
};

assert.equal(broadcastResponseAction(base, true), 'reactivate_ai');
assert.equal(shouldForceBroadcastReply('reactivate_ai', true), true);

assert.equal(
  broadcastResponseAction({ ...base, stage: 'encerrado', owner_mode: 'none', ai_enabled: false }, true),
  'reactivate_ai',
);

assert.equal(
  broadcastResponseAction({ ...base, stage: 'fechado_ganho', owner_mode: 'none', ai_enabled: false }, true),
  'handoff_closed_won',
);
assert.equal(shouldForceBroadcastReply('handoff_closed_won', true), false);

assert.equal(
  broadcastResponseAction({ ...base, stage: 'humano_ativo', owner_mode: 'human', ai_enabled: false }, true),
  'notify_human',
);
assert.equal(
  broadcastResponseAction({ ...base, stage: 'nutricao_ativa', owner_mode: 'human', ai_enabled: false }, true),
  'notify_human',
);

assert.equal(
  broadcastResponseAction({ ...base, opt_out: true }, true),
  'ignore_opt_out',
);
assert.equal(
  broadcastResponseAction(base, true, true),
  'ignore_opt_out',
);

const endedWithoutBroadcast = { ...base, stage: 'encerrado', owner_mode: 'none', ai_enabled: false };
assert.equal(broadcastResponseAction(endedWithoutBroadcast, false), 'none');
assert.equal(clientNoReplyReason(endedWithoutBroadcast), 'lead encerrado');
assert.equal(shouldForceBroadcastReply('none', false), false);

assert.equal(agendaActionFromText('Quero conhecer'), 'none');
assert.equal(agendaActionFromText('Quero conhecer os empreendimentos'), 'none');
assert.equal(agendaActionFromText('Quero conhecer pessoalmente'), 'schedule');
assert.equal(agendaActionFromText('Quero visitar o decorado'), 'schedule');

const broadcastHistory = [
  { role: 'assistant', content: 'Hoje temos novas oportunidades em Porto Belo. Gostaria de conhecer as oportunidades disponíveis?' },
  { role: 'user', content: 'Quero conhecer' },
];
assert.equal(isGenericPortfolioInterest(broadcastHistory), true);
assert.equal(isGenericPortfolioInterest([
  { role: 'assistant', content: 'Quer agendar uma visita ao decorado?' },
  { role: 'user', content: 'Quero conhecer' },
]), false);

const facadeIds = selectPortfolioFacadeIds([
  { id: 'flow-fachada', category: 'imagem', title: 'Fachada Flow', description: null, trigger_keywords: ['fachada', 'flow'], storage_bucket: '', storage_path: '', original_name: 'flow.jpg', mime_type: 'image/jpeg' },
  { id: 'alma-fachada', category: 'imagem', title: 'Fachada Alma', description: null, trigger_keywords: ['fachada', 'alma'], storage_bucket: '', storage_path: '', original_name: 'alma.jpg', mime_type: 'image/jpeg' },
  { id: 'flow-planta', category: 'planta', title: 'Planta Flow', description: null, trigger_keywords: ['flow'], storage_bucket: '', storage_path: '', original_name: 'planta.jpg', mime_type: 'image/jpeg' },
]);
assert.deepEqual(facadeIds, ['flow-fachada', 'alma-fachada']);

const processor = readFileSync(new URL('../src/lib/whatsapp/webhookProcessor.ts', import.meta.url), 'utf8');
const safety = readFileSync(new URL('../src/lib/whatsapp/aiTurnSafety.ts', import.meta.url), 'utf8');
const broadcastUi = readFileSync(new URL('../src/components/BroadcastsManager.tsx', import.meta.url), 'utf8');

assert.match(processor, /whatsappClaimAiTurn/);
assert.match(processor, /whatsappMarkAiTurnSent/);
assert.match(processor, /findRecentBroadcastForLead/);
assert.match(processor, /reactivateLeadFromBroadcast/);
assert.match(processor, /queueBroadcastAttention/);
assert.match(processor, /recordClientNoReplySafetyNet/);
assert.match(safety, /claim_whatsapp_ai_turn/);
assert.match(safety, /whatsapp_ai_turn_mark_sent/);
assert.match(broadcastUi, /Número do Plantão/);

console.log('Resposta à transmissão validada: reativação, fechado ganho, consultor, opt-out, rede de segurança e claim da IA.');
