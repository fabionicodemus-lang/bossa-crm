import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/openai-model-routing.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const routing = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const settings = routing.aiModelRoutingSettings({});
assert.deepEqual(settings, { primary: 'gpt-6.1-sol', light: 'gpt-6-luna', fallback: 'gpt-6-luna' });
assert.deepEqual(routing.selectAiModels(settings, 'conversation'), { primary: 'gpt-6.1-sol', fallback: 'gpt-6-luna' });
assert.deepEqual(routing.selectAiModels(settings, 'background'), { primary: 'gpt-6-luna', fallback: null });
const overridden = routing.aiModelRoutingSettings({
  OPENAI_MODEL: ' gpt-6.1-sol ',
  OPENAI_MODEL_LIGHT: 'gpt-6-luna',
  OPENAI_MODEL_FALLBACK: 'gpt-5.6-luna',
});
assert.equal(routing.selectAiModels(overridden, 'conversation').fallback, 'gpt-5.6-luna');
assert.equal(routing.selectAiModels(overridden, 'background').fallback, 'gpt-5.6-luna');
assert.equal(routing.supportsExplicitCaching('gpt-6.1-sol'), true);
assert.equal(routing.supportsExplicitCaching('gpt-6-luna'), true);
assert.equal(routing.supportsExplicitCaching('gpt-5.6-luna'), true);
assert.equal(routing.supportsExplicitCaching('gpt-5-mini'), false);
assert.deepEqual(routing.pricingFor('gpt-6.1-sol'), { input: 2, cached: 0.1, write: 2.5, output: 10 });
assert.deepEqual(routing.pricingFor('gpt-6-luna'), { input: 0.1, cached: 0.01, write: 0.125, output: 0.5 });
assert.deepEqual(routing.pricingFor('gpt-5.6-luna'), { input: 0.2, cached: 0.02, write: 0.25, output: 1.2 });
console.log('Roteamento Sol/Luna, fallback, cache e preços verificados.');
