import assert from 'node:assert/strict';
import {
  leadNameLooksGeneric,
  normalizeLeadIdentity,
  splitLeadFullName,
} from '../src/lib/lead-identity.ts';

assert.equal(leadNameLooksGeneric('554799632223', '554799632223'), true);
assert.equal(leadNameLooksGeneric('Corretor', '554799632223'), true);
assert.equal(leadNameLooksGeneric('Diego Crispim', '554799632223'), false);

let identity = normalizeLeadIdentity('Diego Crispim Corretor Itapema');
assert.equal(identity.fullName, 'Diego Crispim');
assert.equal(identity.firstName, 'Diego');
assert.equal(identity.lastName, 'Crispim');

identity = normalizeLeadIdentity('Leonardo Taylor - SUPREMO AÇOS');
assert.equal(identity.fullName, 'Leonardo Taylor');
assert.equal(identity.firstName, 'Leonardo');
assert.equal(identity.lastName, 'Taylor');
assert.equal(identity.company, 'SUPREMO AÇOS');

identity = normalizeLeadIdentity('Breno Mauricio | Corretor de Imóveis juliana imoveis');
assert.equal(identity.fullName, 'Breno Mauricio');
assert.equal(identity.firstName, 'Breno');
assert.equal(identity.lastName, 'Mauricio');
assert.match(String(identity.company), /juliana imoveis/i);

identity = normalizeLeadIdentity('Fabio Albuquerque. Fundador e CEO da FA Investimento.');
assert.equal(identity.fullName, 'Fabio Albuquerque');

identity = normalizeLeadIdentity('marliwursterimoveis');
assert.equal(identity.fullName, null);
assert.equal(identity.firstName, null);
assert.equal(identity.company, 'marliwursterimoveis');

identity = normalizeLeadIdentity('Litoral Catarinense qualidade de vida CRECI 59131F');
assert.equal(identity.creci, '59131F');

identity = normalizeLeadIdentity('Eng. Patrícia Gomez - Homrich Engenharia');
assert.equal(identity.fullName, 'Patrícia Gomez');
assert.equal(identity.firstName, 'Patrícia');
assert.equal(identity.company, 'Homrich Engenharia');

identity = normalizeLeadIdentity('Alan Davoglio | CRECI 57241');
assert.equal(identity.fullName, 'Alan Davoglio');
assert.equal(identity.company, null);
assert.equal(identity.creci, '57241');

const split = splitLeadFullName('Luiz Alberto Almeida');
assert.equal(split.firstName, 'Luiz');
assert.equal(split.lastName, 'Alberto Almeida');

console.log('Identidade de leads validada: telefone genérico, primeiro nome, restante do nome, empresa e CRECI.');
