import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildChatGPTCampaignPrompt, buildChatGPTDesktopLink, buildChatGPTRunnerUrl, buildChatGPTStandalonePrompt,
  buildChatGPTCampaignMarkdown, chatGPTCampaignMarkdownFilename,
  chatGPTBatchLimit, validChatGPTCampaignId,
} from '../src/lib/chatgpt-browser-campaign.ts';

const id = '12345678-1234-1234-1234-123456789abc';
const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
assert.equal(validChatGPTCampaignId(id), true);
assert.equal(validChatGPTCampaignId('../outro-tenant'), false);
assert.equal(chatGPTBatchLimit('20'), 20);
assert.equal(chatGPTBatchLimit('1150'), 1150, 'incluir a base inteira autorizada');
assert.equal(chatGPTBatchLimit('1500'), 1500, 'limite técnico ampliado');
assert.equal(chatGPTBatchLimit('1501'), 2, 'não aceitar mais de 1.500 destinatários');
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

const standaloneRun = {
  runId,
  createdAt: '2026-11-09T12:00:00.000Z',
  status: 'active',
  manifest: {
    campaignId: id, senderPhone: '5547999999999',
    recipients: [
      { name: 'Ana Silva', phone: '5547999990001', position: 0,
        text: 'Olá, Ana! Aqui estão o Flow e o Alma. 📄\nConte comigo!' },
      { name: 'Bruno Souza', phone: '5547999990002', position: 1,
        text: 'Oi, Bruno! Novidades do *Flow Aptos* e do Alma.' },
    ],
    media: [
      { filename: 'Tabela Flow.pdf', sha256: 'a'.repeat(64) },
      { filename: 'Tabela Alma.pdf', sha256: 'b'.repeat(64) },
    ],
  },
};
const standalone = buildChatGPTStandalonePrompt('https://crm.bossaempreendimentos.com.br', standaloneRun);
assert.match(standalone, /extensão OFICIAL do ChatGPT/);
assert.match(standalone, /TODOS os 2 destinatários/);
assert.match(standalone, /BAIXE cada PDF exatamente UMA vez/);
assert.match(standalone, /SOMENTE no WhatsApp Web/);
assert.match(standalone, /Não acesse novamente o Bossa CRM/);
assert.match(standalone, /Não peça nova confirmação do remetente/);
assert.match(standalone, /Olá, Ana! Aqui estão o Flow e o Alma/);
assert.match(standalone, /Oi, Bruno! Novidades do \*Flow Aptos\*/);
assert.match(standalone, /5547999990001/);
assert.match(standalone, /5547999990002/);
assert.equal((standalone.match(/\/api\/transmissoes\/navegador\/arquivo\?/g) ?? []).length, 2);
assert.doesNotMatch(standalone, /Registrar contato concluído|Reservar próximo corretor|action: 'ack'|heartbeat/i);
assert.doesNotMatch(standalone, /Bearer |service_role|senha|\{\{nome\}\}/i);
assert.throws(() => buildChatGPTStandalonePrompt('http://website.com', standaloneRun), /HTTPS/);
assert.throws(() => buildChatGPTStandalonePrompt('https://crm.bossaempreendimentos.com.br', {
  ...standaloneRun, status: 'completed',
}), /não está disponível/);
assert.throws(() => buildChatGPTStandalonePrompt('https://crm.bossaempreendimentos.com.br', {
  ...standaloneRun, manifest: { ...standaloneRun.manifest, recipients: [
    ...standaloneRun.manifest.recipients, standaloneRun.manifest.recipients[0],
  ] },
}), /inválida/);
assert.throws(() => buildChatGPTStandalonePrompt('https://crm.bossaempreendimentos.com.br', {
  ...standaloneRun, manifest: { ...standaloneRun.manifest, recipients: [{
    name: 'Ana', phone: '5547999990001', text: 'Olá, {{nome}}!', position: 0,
  }] },
}), /inválida/);
const manyRecipients = Array.from({ length: 1150 }, (_, index) => ({
  name: `Corretor ${index + 1}`, phone: `5547${String(900000000 + index)}`,
  text: `Olá, pessoa ${index + 1}!`, position: index,
}));
const largePrompt = buildChatGPTStandalonePrompt('https://crm.bossaempreendimentos.com.br', {
  ...standaloneRun, manifest: { ...standaloneRun.manifest, recipients: manyRecipients },
});
assert.match(largePrompt, /TODOS os 1150 destinatários/);
assert.match(largePrompt, /pessoa 1150!/);
assert.throws(() => buildChatGPTStandalonePrompt('https://crm.bossaempreendimentos.com.br', {
  ...standaloneRun, manifest: { ...standaloneRun.manifest, recipients: [...manyRecipients, manyRecipients[0]] },
}), /inválida/, 'telefone duplicado deve falhar');
const overflow = Array.from({ length: 1501 }, (_, index) => ({
  name: `Pessoa ${index}`, phone: `5547${String(900000000 + index)}`,
  text: `Mensagem ${index}`, position: index,
}));
assert.throws(() => buildChatGPTStandalonePrompt('https://crm.bossaempreendimentos.com.br', {
  ...standaloneRun, manifest: { ...standaloneRun.manifest, recipients: overflow },
}), /não está disponível/);

const markdown = buildChatGPTCampaignMarkdown(standalone, 'Tabelas Flow e Alma', 2);
assert.match(markdown, /^# Bossa Empreendimentos — Tabelas Flow e Alma/);
assert.match(markdown, /\*\*Destinatários:\*\* 2/);
assert.ok(markdown.includes(standalone), 'arquivo .md deve conter toda a instrução exata');
assert.match(markdown, /\/api\/transmissoes\/navegador\/arquivo/);
assert.equal(chatGPTCampaignMarkdownFilename(id), `bossa-transmissao-${id}.md`);
assert.throws(() => chatGPTCampaignMarkdownFilename('../campanha'));
assert.throws(() => buildChatGPTCampaignMarkdown('', 'Teste', 2));

const root = resolve(import.meta.dirname, '..');
const managerSource = readFileSync(resolve(root, 'src/components/BrowserCampaignManager.tsx'), 'utf8');
assert.match(managerSource, /MAX_RECIPIENTS = 1500/);
assert.match(managerSource, /Baixar instrução \.md/);
assert.match(managerSource, /new Blob\(\[markdown\]/);
assert.match(managerSource, /URL\.createObjectURL\(blob\)/);
const routeSource = readFileSync(resolve(root, 'src/app/api/transmissoes/navegador/route.ts'), 'utf8');
assert.match(routeSource, /MAX_RECIPIENTS = 1500/);
assert.match(routeSource, /\.range\(offset, offset \+ Math\.min\(499/);

const runnerSource = readFileSync(resolve(root, 'src/components/ChatGPTCampaignRunner.tsx'), 'utf8');
assert.doesNotMatch(runnerSource, /confirmar a conversa individual e o remetente autorizado|Confira antes de enviar:<\/strong> remetente/);
assert.match(runnerSource, /action: 'claim'/);
assert.match(runnerSource, /action: 'heartbeat'/);
assert.match(runnerSource, /action: 'ack'/);
assert.match(runnerSource, /ack\('observed'\)/);
assert.match(runnerSource, /ack\('uncertain'\)/);
assert.match(runnerSource, /Parar e marcar para conferir/);

console.log('Handoff ChatGPT: deep link, origem autenticada, limites e trilha de confirmação OK; sem envios reais.');
