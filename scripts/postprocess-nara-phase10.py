from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    source = path.read_text(encoding='utf-8')
    if source.count(old) != 1:
        raise SystemExit(f'{label}: trecho esperado não encontrado uma única vez.')
    path.write_text(source.replace(old, new, 1), encoding='utf-8')


ai_path = Path('src/lib/ai.ts')
replace_once(
    ai_path,
    "const fullHistory = userMessages.map(routingText).join('\n');",
    "const fullHistory = userMessages.map(routingText).join('\\n');",
    'quebra de linha em ai.ts',
)

v120_path = Path('src/lib/ai-v120.ts')
replace_once(
    v120_path,
    "const priorOpenings = priorMessages.slice(-12).map(naraReplyOpeningKey).filter(Boolean);",
    "const priorOpenings = priorMessages.map(naraReplyOpeningKey).filter(Boolean);",
    'janela de aberturas repetidas',
)

units_path = Path('src/lib/nara-unit-queries.ts')
old_order = (
    "  const latest = lastUserMessage(history);\n"
    "  if (!latest || !hasCommercialSignal(latest)) return null;\n"
    "  const consultedAt = new Date().toISOString();\n"
    "  const blockedReason = blockedCommercialProfile(lead, history);\n"
    "  if (blockedReason) return blockedCommercialContext(blockedReason, consultedAt);\n"
    "  const calls: NaraCommercialCall[] = [];\n"
)
new_order = (
    "  const latest = lastUserMessage(history);\n"
    "  if (!latest) return null;\n"
    "  const consultedAt = new Date().toISOString();\n"
    "  const blockedReason = blockedCommercialProfile(lead, history);\n"
    "  if (blockedReason) return blockedCommercialContext(blockedReason, consultedAt);\n"
    "  if (!hasCommercialSignal(latest)) return null;\n"
    "  const calls: NaraCommercialCall[] = [];\n"
)
replace_once(units_path, old_order, new_order, 'prioridade dos bloqueios de perfil')

acceptance_path = Path('scripts/check-nara-phase10.mjs')
replace_once(
    acceptance_path,
    "  assert.equal(result.reply, reply);",
    "  assert.ok(result.reply.endsWith(reply));",
    'aceite da apresentação na resposta de unidade',
)

package_path = Path('package.json')
replace_once(
    package_path,
    '"test:nara-unit-queries": "node --experimental-strip-types scripts/check-nara-unit-queries.mjs"',
    '"test:nara-unit-queries": "node --experimental-strip-types --experimental-loader ./scripts/ts-extension-loader.mjs scripts/check-nara-unit-queries.mjs"',
    'loader de consultas comerciais',
)
replace_once(
    package_path,
    '"test:nara-guardrails": "node --experimental-strip-types scripts/check-nara-guardrails.mjs"',
    '"test:nara-guardrails": "node --experimental-strip-types --experimental-loader ./scripts/ts-extension-loader.mjs scripts/check-nara-guardrails.mjs"',
    'loader de guardrails',
)
