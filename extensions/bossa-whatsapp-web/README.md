# Bossa CRM · Transmissão pelo WhatsApp Web (piloto)

Extensão Chrome Manifest V3 que **clica na interface visível do WhatsApp Web** após o operador aprovar uma campanha no Bossa CRM. Não utiliza a API oficial do WhatsApp, bibliotecas não oficiais de sessão ou uma API de computador da OpenAI. A OpenAI é usada somente para sugerir variações de texto, pelo servidor do CRM.

## Instalação na equipe

1. No CRM, acesse **Transmissões → Pelo navegador** e baixe `bossa-whatsapp-web.zip`.
2. Descompacte o arquivo em uma pasta permanente do computador.
3. No Google Chrome, abra `chrome://extensions`, habilite o **Modo do desenvolvedor**, clique em **Carregar sem compactação** e selecione a pasta que contém `manifest.json`.
4. Abra o CRM em `https://crm.bossaempreendimentos.com.br` e o WhatsApp Web em `https://web.whatsapp.com`. Entre com o WhatsApp que fará os envios.
5. Atualize a página do CRM; deve aparecer **Extensão: conectada**.

Cada operador precisa instalar a extensão em seu próprio Chrome. A fila fica no Supabase, vinculada à organização; não é armazenada na extensão. Se duas pessoas usarem o mesmo número, o banco reserva apenas um destinatário por vez para aquele número.

## Operação

1. Escolha até 600 corretores elegíveis. O CRM remove telefones duplicados, contatos com opt-out ou pausados e identidades incompatíveis.
2. Defina o número do **remetente com DDI**, a mensagem e até três PDFs de 8 MB. A IA pode propor quatro variantes; revise-as antes de criar o rascunho.
3. Crie o rascunho e confira a lista de destinatários e o conteúdo. Um responsável deve atestar o consentimento para este tipo de comunicação e aprovar.
4. Libere a fila e clique em **Executar neste Chrome**. Confirme que o WhatsApp aberto é o número indicado.
5. Deixe as abas do CRM e WhatsApp abertas, com a sessão iniciada. A extensão abre o chat, tenta conferir o telefone nos detalhes, insere o texto ou PDF, clica e procura o conteúdo na conversa. Cada execução processa até **25 contatos**; revise os resultados antes de iniciar o próximo lote.
6. Se houver erro ou perda de confirmação, o contato passa a **Conferir**. Abra o WhatsApp, veja o que aconteceu e use **Conferi: enviado** ou **Conferi: não enviado**. A fila não repete automaticamente o envio. Após uma queda de sessão, o remetente fica bloqueado até alguém confirmar que o Chrome anterior parou e clicar em **Liberar número após conferência**.

O estado **Observado na tela** significa somente que o conteúdo foi visto na conversa após um clique. O CRM não tem confirmação de entrega ou leitura nesta modalidade.

## Implantação e testes obrigatórios

1. Aplicar `supabase/migrations/20261106150629_browser_campaigns.sql` em **ambiente de homologação**. O CLI Supabase v3 exige `--remote` para a base hospedada. Não aplicar automaticamente no banco de produção a partir do desenvolvimento.
2. Configurar `OPENAI_API_KEY` no servidor se desejar as quatro variações. Sem a chave, continua possível enviar o texto original. A chave nunca chega ao navegador.
3. Verificar, no Chrome com WhatsApp de teste, identificação correta de chat salvo e não salvo, painel de dados do contato, editor de mensagem, prévia do PDF e bolhas de saída.
4. Verificar cenários de ausência de login, destinatário inexistente, troca de chat, rede desconectada e falha após o clique: todos devem ficar em **Conferir** sem reenvio automático.
5. Conferir a reserva concorrente entre dois operadores com o mesmo número, pausa durante envio, queda do navegador por mais de três minutos e reconciliação manual.
6. Após homologar uma campanha com contatos próprios de teste e autorização explícita, publicar a extensão para a equipe e executar as campanhas reais em lotes supervisionados.

## Limitações técnicas

- A interface DOM do WhatsApp Web muda sem aviso. O adaptador prefere **interromper** quando não consegue verificar o telefone ou o PDF; precisa de manutenção e nova homologação após alterações.
- A extensão opera somente nas origens do CRM de produção, `localhost:3000` (desenvolvimento) e `web.whatsapp.com`.
- O Chrome e as duas páginas devem permanecer abertos; atualizar ou fechar a página durante uma etapa pode deixar seu estado incerto. Após três minutos sem atividade, o registro é separado para revisão humana.
- A extensão usa uma tentativa por etapa e não implementa alteração de impressão digital, atrasos aleatórios, simulação de digitação humana ou mecanismos para contornar restrições do WhatsApp. O uso em volume pode ser bloqueado pela plataforma mesmo com consentimento.
- O arquivo de distribuição é gerado a partir desta pasta. Atualizações exigem que os operadores substituam a extensão instalada e recarreguem o CRM.

## Privacidade e segurança

- A autenticação e o controle de organização continuam no CRM.
- A fila é protegida por RLS para leitura e por chamadas transacionais que verificam o papel do operador.
- O arquivo chega à extensão como bytes fornecidos pela página já autenticada; não são transmitidos tokens ou cookies do CRM.
- O hash SHA-256 do PDF é salvo no rascunho e conferido ao recuperá-lo para envio.
- O navegador não abre páginas arbitrárias; o serviço da extensão só navega para `web.whatsapp.com/send?phone=<número>`.

## Distribuição

Depois de alterar esta pasta, recrie o ZIP para download público do CRM:

```sh
npm run package:browser-extension
```
