# Checklist de entrada em produção

## Segurança

- [ ] Supabase Secret Key apenas no servidor
- [ ] RLS executada e testada
- [ ] Confirmação de e-mail habilitada
- [ ] domínio HTTPS configurado
- [ ] senha forte para todos os usuários
- [ ] pelo menos dois administradores confiáveis
- [ ] backup diário do banco habilitado conforme o plano do Supabase

## Dados

- [ ] importar primeiro uma amostra de 20 linhas
- [ ] conferir estágios de clientes e corretores
- [ ] importar a base completa
- [ ] conferir duplicidades por ID Kommo e telefone
- [ ] validar responsáveis e anotações estratégicas

## WhatsApp

- [ ] aplicativo Meta em modo Live
- [ ] Embedded Signup Configuration ID criado
- [ ] callback e domínios permitidos
- [ ] webhook validado
- [ ] campo `messages` assinado
- [ ] teste de mensagem recebida
- [ ] teste de mensagem enviada
- [ ] teste de assumir conversa
- [ ] teste de cliente fechado sem IA

## Usuários

- [ ] primeiro administrador criado
- [ ] comerciais convidados individualmente
- [ ] acesso viewer validado
- [ ] recuperação de senha testada
- [ ] logout e expiração de sessão testados
