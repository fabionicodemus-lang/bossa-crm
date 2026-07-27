# Testes e validação realizados

Data: 27/07/2026

## Concluídos

- verificação sintática de todos os 54 arquivos TypeScript/TSX: **aprovada**;
- resolução dos imports locais `@/`, `./` e `../`: **aprovada**;
- conferência da estrutura do projeto e das rotas de autenticação, CRM e API;
- conferência estática da migration SQL, RLS, funções de autorização e triggers;
- teste de leitura da planilha real `kommo_export_leads_2026-07-27.xlsx`:
  - 2.561 registros com nome;
  - 2.451 corretores classificados como `Cadastrado`;
  - 110 corretores classificados como `Ativo`;
  - 2.555 linhas com telefone;
  - 230 ocorrências excedentes de telefones repetidos, que serão tratadas pela estratégia de duplicidade escolhida.

## Pendente no ambiente de implantação

O `npm install` não concluiu neste ambiente por indisponibilidade/latência da rede de pacotes. Por isso, o build final deve ser executado depois de baixar as dependências:

```bash
npm install
npm run check-env
npm run typecheck
npm run lint
npm run build
```

Também devem ser feitos testes integrados com as contas reais:

- cadastro, confirmação de e-mail, login e recuperação de senha;
- convite e alteração de função de usuários;
- aplicação da migration em um projeto Supabase novo;
- RLS com dois usuários e duas empresas distintas;
- importação inicial de 20 linhas e depois da base completa;
- Embedded Signup, webhook e envio real do WhatsApp;
- assumir conversa e bloqueio da IA para cliente fechado.
