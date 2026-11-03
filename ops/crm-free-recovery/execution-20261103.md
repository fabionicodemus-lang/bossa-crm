# Execução de recuperação autorizada — 2026-11-03

Gatilho único para o job de recuperação somente leitura da produção, com restauração local sem rede. Nenhuma migração ou implantação comercial é aplicada por este commit.

Acesso temporário ao projeto `bossa-site` renovado pelo proprietário; manter token exclusivamente no segredo do ambiente GitHub, sem registrar seu valor. A saída autorizada é exclusivamente o pacote criptografado de retenção curta, nunca o dump em texto claro. Falha na conferência do backup bloqueia a liberação da V1.
