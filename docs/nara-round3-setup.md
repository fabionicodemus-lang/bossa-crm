# Nara — rodada 3

## Ativar visitas ao decorado

Preencha as variáveis operacionais da Nara no CRM:

- Endereço do escritório e decorados: `Rua São José, 163, Perequê, Porto Belo - SC`.
- Visitas de segunda a sexta: `08:00-18:00`.
- Visitas aos sábados mediante agendamento: `08:00-18:00`. O escritório não abre regularmente no sábado, mas atende o cliente com visita marcada.

Sem endereço ou expediente confirmado, a Nara não cria visita; solicita confirmação do time. Domingo fica fechado. A agenda consulta conflitos no CRM e na Microsoft, oferece até três horários livres e só confirma após gravar o evento. O endereço no evento e na mensagem vem da variável configurada. Visita à obra requer fluxo próprio e não deve ser apresentada como visita ao escritório.

## Pendências de negócio

- Definir o responsável pelo pós-venda/obra; a passagem comercial à Taís foi suprimida para esses casos.
- Confirmar política de permuta e financiamento por empreendimento antes de responder com regras específicas.
- Confirmar distâncias oficiais à praia em uma fonte única.
- Para detalhar entrada, mensais, reforços e chaves, preencher um plano completo da unidade; a Nara informa só o total enquanto a soma não fecha.
- Lembrete de visita ainda depende da definição do horário de envio e modelo WhatsApp aprovado quando fora da janela de 24 horas.

## Verificação

`npm run typecheck && npm run test:nara-phase10 && npm run test:nara-round3`

Os logs de produção de 24/09 por volta das 19h de Brasília mostraram um timeout de 60 segundos no webhook e, depois, uma resposta rejeitada por exceder 45 palavras. A resposta fixa de compra no exterior foi encurtada; a bateria deve ser repetida após implantação.
