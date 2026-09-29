import assert from 'node:assert/strict';
import { metaWaId, normalizeManualPhone, normalizeWaId, phoneMatchVariants } from '../src/lib/whatsapp/utils.ts';

const same = (a, b) => phoneMatchVariants(a).some((item) => phoneMatchVariants(b).includes(item));

// Caso real: formulário com nono dígito x WhatsApp sem nono dígito (DDD 47).
assert.ok(same('+55 47 99933-3634', '554799333634'), 'Formulário e WhatsApp da mesma pessoa');
assert.ok(same('554799333634', '5547999333634'), 'Ordem inversa');
assert.ok(same('(47) 99933-3634', '5547999333634'), 'Número digitado sem DDI');
// Não pode juntar números diferentes.
assert.ok(!same('5547999333634', '5547999333635'), 'Números diferentes');
// Fixo (começa com 2–5) não ganha nono dígito.
assert.deepEqual(phoneMatchVariants('554733681234'), ['554733681234']);
// Estrangeiro (EUA): o número vindo da Meta fica intacto e continua sendo encontrado.
assert.equal(metaWaId('14075551234'), '14075551234');
assert.equal(normalizeWaId('18563947763'), '18563947763', 'wa_id dos EUA não ganha DDI 55');
assert.equal(normalizeWaId('4552325091'), '4552325091', 'wa_id histórico permanece intacto');
assert.equal(normalizeWaId('554552325091'), '554552325091', 'conversa duplicada não é alterada');
assert.equal(normalizeManualPhone('(47) 99933-3634'), '5547999333634');
assert.equal(normalizeManualPhone('(47) 3333-1234'), '554733331234');
assert.equal(normalizeManualPhone('+1 856 394 7763'), '18563947763');
assert.equal(normalizeManualPhone('18563947763'), '18563947763', 'DDD 18 com local inválido não vira Brasil');
assert.equal(normalizeManualPhone('1055551234'), '1055551234', 'DDD inválido não ganha DDI');
assert.ok(phoneMatchVariants('14075551234').includes('14075551234'));
// Número brasileiro vindo da Meta continua igual ao normalizado de antes.
assert.equal(metaWaId('554799333634'), normalizeWaId('554799333634'));
assert.equal(metaWaId('5547999333634'), normalizeWaId('5547999333634'));
assert.deepEqual(phoneMatchVariants(''), []);
console.log('Telefones validados: celular com e sem nono dígito é reconhecido como o mesmo contato.');
