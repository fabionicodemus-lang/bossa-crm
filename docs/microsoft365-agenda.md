# BOSSA CRM — ativação da Agenda Microsoft 365

A interface e os endpoints estão implementados, mas a sincronização não é ativada enquanto o aplicativo Microsoft Entra e os segredos não forem configurados. Nunca cole segredos ou tokens em conversas, issues ou no GitHub.

## 1. Administrador Microsoft 365

1. Abra https://entra.microsoft.com/ → Identidade → Aplicativos → Registros de aplicativos → Novo registro.
2. Nome: `BOSSA CRM Agenda`; tipo de contas: **Somente contas deste diretório organizacional (locatário único)**.
3. Plataforma **Web** e URI de redirecionamento exata: `https://crm.bossaempreendimentos.com.br/api/microsoft/callback`.
4. Em Permissões de API → Microsoft Graph → **Delegadas**, adicione `User.Read` e `Calendars.ReadWrite`. OAuth solicita também `openid profile email offline_access`.
5. Conceda consentimento do administrador, se exigido pela política da empresa.
6. Copie ID do aplicativo (cliente) e ID do diretório (locatário). Em Certificados e segredos, crie um segredo de cliente e guarde o **valor** somente no ambiente seguro da Vercel. A alternativa com certificado pode ser avaliada para produção em outra revisão.

## 2. Variáveis de ambiente Vercel

Adicione no projeto `bossa-crm`, ambiente **Production**:

- `MICROSOFT_CLIENT_ID`: ID do aplicativo.
- `MICROSOFT_CLIENT_SECRET`: valor do segredo de cliente (não o ID).
- `MICROSOFT_TENANT_ID`: ID do diretório da Bossa (GUID), para restringir a autenticação à organização.
- `MICROSOFT_REDIRECT_URI`: `https://crm.bossaempreendimentos.com.br/api/microsoft/callback`.
- `MICROSOFT_TOKEN_ENCRYPTION_KEY_BASE64`: chave aleatória de **32 bytes em Base64**, exclusiva desta integração; nunca altere após conectar contas sem migrar os tokens, pois os existentes deixarão de ser legíveis.

As variáveis são exclusivas do servidor; não use o prefixo `NEXT_PUBLIC_`. Após salvar, gere uma nova implantação de produção (redeploy).

## 3. Cada colaborador

1. Entre no BOSSA CRM → **Agenda** → **Conectar meu Outlook**.
2. Autorize o e-mail corporativo `@bossaempreendimentos.com.br`. A conexão é individual, nunca compartilhada entre funcionários.
3. Clique **Sincronizar agora** para trazer os eventos; o cron atualiza a cada 15 minutos, condicionado à configuração e execução da Vercel.
4. Faça um teste: crie compromisso no Outlook e sincronize no CRM; reserve horário no CRM e confirme que aparece no Outlook. Em videochamadas, confirme a URL do Teams, que exige que o calendário tenha suporte ao Teams.

## Comportamento e limites

- Antes de criar um evento, o CRM e as IAs consultam os bloqueios locais **e** os compromissos remotos do responsável conectado em tempo real. Falha de disponibilidade remota impede declaração de horário livre.
- Eventos importados aparecem como **Ocupado · Outlook** para não revelar assunto de compromisso pessoal aos demais usuários do CRM. Edite/exclua esses eventos pelo Outlook.
- Compromissos novos criados pelo CRM após a conexão são enviados para o Outlook do responsável; alterações/cancelamentos desses eventos também são enviados. Se o envio falhar, o CRM sinaliza falha e a IA não afirma que houve confirmação no Outlook.
- Eventos anteriores à conexão **não são exportados automaticamente**; revisar caso a caso evita eventos duplicados no Outlook.
- Alterações feitas diretamente no Outlook são importadas na sincronização; não há notificação instantânea webhook nesta versão (até 15 minutos entre importações). A consulta de conflitos é ao vivo.
- A integração não envia convite a e-mail do cliente automaticamente: ela cria o evento no Outlook do responsável e, quando possível, gera o link Teams. Envio de convites aos participantes requer cadastrar convidados e confirmação de envio em uma etapa adicional.
