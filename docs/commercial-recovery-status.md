# F1.5 — recuperação durável dos salvamentos humanos

## Entrega

A tentativa do formulário principal de propostas e da criação humana da agenda é preparada no servidor, antes da gravação. Recarregar, fechar a página ou entrar em outro dispositivo com o **mesmo usuário e organização** permite descobrir a tentativa. Nenhum payload de proposta, credencial ou token é persistido no armazenamento do navegador por esta entrega. Não é uma fila offline: preparar exige conexão e o banco disponível.

A tela mostra um painel de conferência. Consultar a pendência é somente leitura: não executa a proposta nem chama Outlook. Retomar exige confirmação explícita e usa o payload original do servidor, a mesma chave e a sessão atual, com RLS. Não aceita substituição de dados pelo navegador. A nova rota é `/api/commercial/recovery`, com respostas privadas sem cache.

Há uma tentativa sem conferência por tipo (proposta ou agenda), usuário e organização. Uma segunda aba/dispositivo não pode contorná-la criando outra chave pelo fluxo preparado. Uma vez confirmada a gravação, o cliente reconhece o recibo; uma confirmação de recebimento perdida permanece visível para conferência, sem novo salvamento. Esse limite não se aplica a usuários diferentes nem a produtores legados ainda não migrados.

## Estados e ações

- **Pendente**: ainda não há recibo confirmado. Não significa fracasso; a transação pode estar em andamento.
- **Confirmada**: recibo existente, com leitura do registro atual. Não desfaz edições, cancelamentos ou versões posteriores.
- **Confirmada, registro indisponível**: há recibo, mas a origem foi removida ou não está acessível. Não cria substituto.
- **Conferida**: o usuário recebeu/conferiu o resultado. Fecha o aviso sem apagar origem ou recibo.
- **Abandonada**: o usuário encerrou uma tentativa sem recibo. A mesma chave fica impedida de executar depois, inclusive pelo RPC antigo de salvamento.

Abandonar e salvar usam o mesmo bloqueio transacional. Se o salvamento vencer, o abandono devolve o estado confirmado e não apaga nada. Se o abandono vencer, a escrita tardia falha e reverte origem, itens, atividade e recibo. Não é simplesmente apagar uma chave do navegador. O descarte não cancela eventos ou contratos; cancelamentos comerciais continuam nos fluxos próprios.

## Limites operacionais

- Não há worker, reenvio em segundo plano ou retentativa automática. Retomar depende da ação humana.
- Recuperar uma proposta não repete a mudança legada de etapa do contato nem abre automaticamente o PDF. Esses efeitos continuam separados e são informados na tela.
- Recuperação da agenda usa o handler humano existente. Uma gravação já confirmada não chama o Outlook novamente; uma tentativa ainda não gravada repassa pela disponibilidade e autorização. O convite/sincronização continuam fora da transação do CRM e precisam de conferência própria.
- Uma tentativa validada mas ainda não gravada pode se tornar inválida depois (contato arquivado, horário ocupado, versão antiga, permissão revogada). A nova tentativa não contorna validações atuais.
- Preparar não cria fatos comerciais e não é qualificação, proposta enviada, visita, contrato ou recebimento.
- O status rápido de propostas também usa esta recuperação desde `20261021203000_commercial_proposal_status_once.sql`; a retomada lê o comando original no servidor e respeita a revisão observada. Produtores IA/importações e remarcação/edição da agenda continuam pendentes. A relação revisada entre contatos duplicados é parcial e não é deduplicação global.
- Dados do comando e encerramento são preservados no servidor para rastreabilidade, com RLS por autor/organização e privilégios do chamador. Política completa de retenção/expurgo deve ser definida antes de produção; não apagar tombstones para permitir reexecução de chaves encerradas.

## Migração e verificação

Nona migração aditiva: `20261021182758_commercial_recoverable_requests.sql`, gerada pelo Supabase CLI 2.121.0 no ambiente descartável de Actions #39652886937. As oito anteriores foram preservadas. Não houve gravação em projeto de produção, ativação de automação ou mensagem/convite real.

Testes adicionados: 24 cenários em PGlite com as nove migrações, 18 cenários isolados de endpoint/helpers/estrutura e 7 disputas em PostgreSQL 17 com conexões independentes/barreira observável. API da agenda ampliada de 43 para 46 cenários. O workflow permanente tem apenas leitura do repositório. Resultados devem ser conferidos por SHA no PR, não herdados da revisão anterior.

Os testes isolados não substituem navegador autenticado, schema integral/advisors, carga ou Outlook/WhatsApp reais. Homologar as nove migrações e a aplicação coordenadamente. Antes disso, manter o PR em rascunho.

## Progresso

A lacuna de recuperação após recarregamento dos dois caminhos humanos foi implementada nesta subentrega. F1.5 ainda inclui outros produtores e reconciliação de identidades; não a marcar inteira como concluída. Mantido o checklist de **12/24 (50%)**, com esta subentrega registrada separadamente.
