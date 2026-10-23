import assert from 'node:assert/strict';
import { proposeContactReconciliation, reviewContactReconciliation } from '../../src/app/(crm)/gestao/contatos/actions.ts';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const org = id(1), proposer = id(10), reviewer = id(12), first = id(40), second = id(41), reviewId = id(90);
const reason = 'Identidade conferida por contrato e documento apresentado presencialmente.';
const evidence = 'Contrato assinado e documento conferido';
const form = values => {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
};
const proposal = values => form({ first, second, preferred: first, reason, evidence, ...values });
const decision = values => form({ id: reviewId, decision: 'confirm', reason, ...values });
const fixture = (role = 'comercial', userId = proposer) => {
  const state = { context: role ? { role, userId, organization: { id: org } } : null,
    calls: [], revalidated: [], result: { status: 'pending' }, error: null };
  globalThis.reconciliationActionFixture = state;
  return state;
};
const redirected = async (task, expected) => {
  await assert.rejects(task, error => error.message === 'REDIRECT' && error.url === expected);
};
let count = 0;
const check = async (name, task) => { await task(); console.log(`PASS reconciliation actions ${++count}: ${name}`); };

await check('a complete UUID reaches the proposal RPC with all expected parameters', async () => {
  const state = fixture();
  await redirected(() => proposeContactReconciliation(proposal()), '/gestao/contatos?ok=1');
  assert.deepEqual(state.calls, [{ name: 'commercial_propose_contact_reconciliation', params: {
    p_org: org, p_first: first, p_second: second, p_preferred: first, p_reason: reason, p_evidence: evidence,
  } }]);
  assert.deepEqual(state.revalidated, ['/gestao/contatos']);
});
await check('incomplete proposal UUIDs are rejected before opening the database', async () => {
  for (const values of [{ first: first.slice(0, -1) }, { second: second.slice(0, -1) }, { preferred: first.slice(0, -1) }]) {
    const state = fixture();
    await redirected(() => proposeContactReconciliation(proposal(values)),
      '/gestao/contatos?error=Informe%20duas%20fichas%20diferentes%2C%20qual%20manter%20como%20refer%C3%AAncia%2C%20justificativa%20e%20evid%C3%AAncia%20confer%C3%ADvel.');
    assert.equal(state.calls.length, 0);
  }
});
await check('commercial may propose; viewer and anonymous users stop before the database', async () => {
  for (const role of ['viewer', null]) {
    const state = fixture(role);
    await assert.rejects(() => proposeContactReconciliation(proposal()), /REDIRECT/);
    assert.equal(state.calls.length, 0);
  }
});
await check('complete UUID reaches both confirmation and rejection RPCs as an admin', async () => {
  for (const [choice, confirmed] of [['confirm', true], ['reject', false]]) {
    const state = fixture('admin', reviewer);
    await redirected(() => reviewContactReconciliation(decision({ decision: choice })), '/gestao/contatos?ok=1');
    assert.deepEqual(state.calls, [{ name: 'commercial_review_contact_reconciliation', params: {
      p_org: org, p_id: reviewId, p_confirm: confirmed, p_reason: reason,
    } }]);
  }
});
await check('incomplete review UUID and a non-admin reviewer stop before the database', async () => {
  let state = fixture('admin', reviewer);
  await assert.rejects(() => reviewContactReconciliation(decision({ id: reviewId.slice(0, -1) })), /REDIRECT/);
  assert.equal(state.calls.length, 0);
  state = fixture('comercial', reviewer);
  await assert.rejects(() => reviewContactReconciliation(decision()), /REDIRECT/);
  assert.equal(state.calls.length, 0);
});
await check('self-review and database errors never become success', async () => {
  for (const task of [() => proposeContactReconciliation(proposal()), () => reviewContactReconciliation(decision())]) {
    const state = fixture('admin', proposer);
    state.error = { code: '42501', message: 'COMMERCIAL_RECONCILIATION_SELF_REVIEW' };
    await assert.rejects(task, error => error.message === 'REDIRECT' && error.url.includes('error=') && !error.url.includes('ok=1'));
    assert.equal(state.calls.length, 1);
    assert.deepEqual(state.revalidated, []);
  }
});
console.log(`PASS: ${count} real server-action regression scenarios with isolated auth and database adapters.`);
