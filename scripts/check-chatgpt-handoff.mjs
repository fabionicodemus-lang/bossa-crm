import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildChatGPTCampaignPrompt, buildChatGPTDesktopLink, buildChatGPTRunnerUrl,
  chatGPTBatchLimit, validChatGPTCampaignId,
} from '../src/lib/chatgpt-browser-campaign.ts';

const id = '12345678-1234-1234-1234-123456789abc';
const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
assert.equal(validChatGPTCampaignId(id), true);
assert.equal(validChatGPTCampaignId('../outro-tenant'), false);
assert.equal(chatGPTBatchLimit('20'), 20);
assert.equal(chatGPTBatchLimit('600'), 600, 'uma instrução pode cobrir todos os corretores aprovados da campanha');
assert.equal(chatGPTBatchLimit('601'), 2, 'não aceitar mais que 600 destinatários');
assert.equal(chatGPTBatchLimit(null), 2);

const runner = buildChatGPTRunnerUrl('https://crm.bossaempreendimentos.com.br', id, 2, runId);
const url = new URL(runner);
assert.equal(url.pathname, '/transmissoes/navegador/assistente');
assert.equal(url.searchParams.get('campaign'), id);
assert.equal(url.searchParams.get('limit'), '2');
assert.equal(url.searchParams.get('run'), runId);
assert.throws(() => buildChatGPTRunnerUrl('https://crm.bossaempreendimentos.com.br', '../fora', 2, runId));
assert.throws(() => buildChatGPTRunnerUrl('http://example.com', id, 2, runId), /HTTPS/);

const prompt = buildChatGPTCampaignPrompt(runner, '5547999999999', 2);
assert.match(prompt, /extensão OFICIAL do ChatGPT/);
assert.match(prompt, /EXATAMENTE ao telefone/);
assert.match(prompt, /Não peça conferência nem nova confirmação do remetente/);
assert.doesNotMatch(prompt, /confirme.*que o remetente é|confirmação humana do remetente/i);
assert.match(prompt, /NÃO passe ao próximo contato com pendência/i);
assert.match(prompt, /Não ultrapasse o limite da campanha/);
assert.match(prompt, /Registrar contato concluído/);
assert.match(prompt, /15 minutos sem novo registro/);
assert.doesNotMatch(prompt, /{{nome}}|Bearer |service_role|senha/i, 'instrução não contém segredo ou dados da fila');
assert.throws(() => buildChatGPTCampaignPrompt(runner, 'remetente-invalido', 2));

const deepLink = buildChatGPTDesktopLink(prompt);
assert.equal(deepLink.startsWith('codex://new?prompt='), true);
assert.equal(decodeURIComponent(deepLink.slice('codex://new?prompt='.length)), prompt);

const root = resolve(import.meta.dirname, '..');
const runnerSource = readFileSync(resolve(root, 'src/components/ChatGPTCampaignRunner.tsx'), 'utf8');
assert.doesNotMatch(runnerSource, /confirmar a conversa individual e o remetente autorizado|Confira antes de enviar:<\/strong> remetente/);
assert.match(runnerSource, /action: 'claim'/);
assert.match(runnerSource, /action: 'heartbeat'/);
assert.match(runnerSource, /action: 'ack'/);
assert.match(runnerSource, /ack\('observed'\)/);
assert.match(runnerSource, /ack\('uncertain'\)/);
assert.match(runnerSource, /Parar e marcar para conferir/);

console.log('Handoff ChatGPT: deep link, origem autenticada, limites e trilha de confirmação OK; sem envios reais.');
