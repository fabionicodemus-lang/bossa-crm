# Handoff: BOSSA CRM — Arquitetura nova + tela "Hoje"

Repositório alvo: `fabionicodemus-lang/bossa-crm` (Next.js 16 + TypeScript + Supabase, estilos em `src/app/globals.css`).

## Como usar com o ChatGPT (Codex)
1. Conecte o repositório no ChatGPT → Codex.
2. Envie esta pasta inteira (ou faça commit dela em `docs/design/`).
3. Cole o prompt da seção **Prompt pronto** abaixo.
4. Peça um PR por etapa (ver **Ordem de implementação**), revise o preview na Vercel e só então avance.

## Sobre os arquivos de design
Os arquivos em `design/` são **referências em HTML** (protótipos), não código de produção. Abra `design/BOSSA Hoje.dc.html` no navegador para ver e clicar. A tarefa é **recriar este design dentro do app Next.js existente**, usando os componentes, as rotas, a API e o Supabase que já existem. Nenhuma regra de negócio muda, só a interface. Os dados do protótipo são fictícios.

## Fidelidade
**Alta fidelidade.** Cores, tipografia, espaçamentos, raios e comportamentos são finais. Reproduza com precisão.

---

## 1. Arquitetura / menu (substitui `src/components/Sidebar.tsx`)
O menu passa de 25 links para 8, sem seções e **sem emojis** (use ícones de traço, como lucide-react, 16px, stroke 1.7).

| Novo item | Rota sugerida | Absorve |
|---|---|---|
| Hoje | `/hoje` (nova página inicial; `/` redireciona para ela) | /dashboard |
| Conversas | `/conversas` | /ia, /mensagens-corretores, /transmissoes |
| Pipeline | `/pipeline?tipo=cliente\|corretor\|geral` | /clientes, /corretores, /geral |
| Leads | `/leads` | /arquivados (filtro), /importar (ação) |
| Tarefas | `/tarefas` | /agenda, /tarefas |
| Gestão | `/gestao` | /dashboard (métricas), /propostas (volume) |
| Nara | `/nara` | /treinamento/nara, /plantao-corretores, /treinamento/plantao, /configuracoes/arquivos-ia |
| Configurações | `/configuracoes` | /empreendimentos, /configuracoes/whatsapp, /usuarios, modelos Meta |

Mantenha as rotas antigas funcionando (redirect) e respeite as `roles` que já existem em cada link.

Menu lateral: largura 224px, fundo `--bg`, padding 18px 12px. Logo `bossa-logo.png` com 17px de altura + "CRM" (10.5px, 600, letter-spacing .18em, `--ink-3`). Item: 32px de altura, raio 7, 13.5px/500. Item ativo: fundo `--panel`, texto `--ink`. Badges: "Hoje" mostra o nº de tarefas atrasadas (fundo `--red-soft`, texto `--red`); "Conversas" e "Nara" usam fundo `--sunken`. Rodapé: avatar 30px, nome, cargo e botão de tema claro/escuro.

O conteúdo fica num painel com margem 8px, fundo `--panel`, borda 1px `--line` e raio 14.

## 2. Tela "Hoje"
Topbar com 54px: título "Hoje", busca ⌘K (340px), botão preto "+ Nova tarefa" (atalho N).

Corpo com padding 36px 40px e max-width 1360:
1. Data (13px `--ink-3`), "Bom dia, {nome}" (30px/600, letter-spacing −.025em) e a frase-resumo "{n} tarefas atrasadas (vermelho) e {n} para hoje. A Nara passou {n} conversas para a equipe."
2. **Abas Clientes diretos · Corretores · Tudo**, com contagem (hoje + atrasadas). Filtram TUDO abaixo por `leads.kind` (`cliente` / `corretor`). Aba ativa: sublinhado de 2px `--ink`, badge preto.
3. **Faixa de 6 KPIs**: grid `repeat(auto-fit,minmax(140px,1fr))`, borda 1px, raio 11, divisórias via box-shadow. Célula: label 12.5px com ponto de 6px e valor 24px/600.
   - Clientes: Leads novos hoje · Atrasadas · Para hoje · Sem resposta · Negociações paradas · Propostas abertas (R$).
   - Corretores: Corretores novos · Atrasadas · Para hoje · Sem resposta · Clientes indicados no mês · Vendas via corretor.
4. Duas colunas com flex-wrap e gap 32: **Agenda** (flex 1 1 640) e coluna lateral (flex 1 1 320, max 420).

### Agenda
Cabeçalho "Agenda", segmentado Equipe/Minhas e link "Abrir em Tarefas →".
Três grupos em cards (raio 12):
- **Atrasadas**: borda `--red-line`, cabeçalho `--red-soft`, título, hora e "há 2h10" em `--red`. Sempre primeiro.
- **Hoje**: ordenadas por horário.
- **Próximas**: próximos 7 dias.
- **Concluídas hoje**: recolhível, com "Reabrir".

Linha de tarefa (padding 12px 16px; 8px no modo compacto; hover `--hover`), da esquerda para a direita:
ícone do tipo (32px, fundo `--sunken`, raio 8) · hora em Geist Mono 13/500 + dia · título 14/500 ("Ligar para Juliana Freitas") com tags opcionais `Corretor` e `✦ Nara`/`✦ Plantão` (tarefa criada pela IA, azul) · subtítulo 12.5 `--ink-3` "Empreendimento · Cidade, UF/País" (para corretor: "Imobiliária · Cidade") · responsável (avatar 20px + nome) · tempo desde a última interação (fica laranja se ≥ 48h) · botões **WhatsApp** (ícone 30px) / **Abrir lead** / **Concluir** (hover verde).

Tipos → ícone: Ligação (phone), WhatsApp (message-circle), Reunião (video), Visita (home), Enviar proposta (file-text), Enviar material (send), Follow-up (rotate-ccw/clock), Outro.

### Coluna lateral
- **Precisam de atenção** (alertas automáticos, recalculados a cada 15 min): regra colorida + lead + subtítulo + botão de ação rápida. Regras: lead novo sem primeiro contato (vermelho); sem resposta há X dias, proposta enviada há X dias, sem próxima atividade (laranja); aguardando follow-up, parada na etapa há X dias (cinza). Para corretores: corretor novo sem boas-vindas, aguardando material, sem próxima atividade.
- **Nara** (clientes) / **Plantão** (corretores): 4 números (atendendo agora, aguardando cliente, tarefas criadas hoje, mensagens automáticas) + lista de **handoffs** com botão preto "Assumir". Ao assumir, o usuário vira responsável e a IA fica em silêncio (lógica já existente em `hybrid-server.ts`).

## 3. Drawer da ficha do lead (reusa os dados de `LeadDetail.tsx`)
Abre à direita sem trocar de página: `top/right/bottom: 8px`, largura `min(640px, 100vw−16px)`, raio 14, sombra `--shadow`, overlay `--overlay`. Entra com `translateX(24px)→0` e opacidade 0→1 em 200ms, `cubic-bezier(.2,.8,.2,1)`. Esc fecha.
- Barra de 48px: "Leads / Nome", botões abrir em página inteira e fechar.
- Cabeçalho: avatar 48px (iniciais), nome 21/600, "Cidade · Empreendimento" (para corretor: "Corretor · Imobiliária · Cidade") e pill de temperatura (Quente vermelho / Morno laranja / Frio cinza).
- Ações: **WhatsApp** (preto, abre a aba Conversas) · Ligar · + Tarefa · Criar proposta · seletor inline de **Responsável**.
- **Etapa**: nome + "5 de 9", botões ‹ e "Avançar ›", barra com 1 segmento por etapa (6px, clicável, preenchido em `--ink` até a etapa atual).
  - Etapas de clientes: Lead novo, Primeiro contato, Qualificado, Material enviado, Corretor atendendo, Visita, Proposta, Negociação, Fechado. Mapear para os `stage` existentes no banco ou criar uma migração.
  - Etapas de corretores: Cadastro, Primeiro contato, Material enviado, Parceiro ativo, Cliente em negociação, Venda realizada. **Confirmar com o Fábio.**
- **Próxima atividade**: fundo `--sunken` (ou `--red-soft` se atrasada, `--orange-soft` se não houver nenhuma) com Concluir / Criar tarefa.
- Abas: Visão geral · Conversas · Tarefas · Negociação · Arquivos · Histórico.
  - Visão geral: blocos Perfil / Interesse / Negociação / Comercial (para corretor: Perfil / Parceria / Comercial) + "✦ Resumo da Nara" (fundo `--nara-soft`).
  - Conversas: estado no topo (● verde "Humano atendendo · Taís", ● azul "Nara atendendo", ● laranja "Handoff pendente"). Bolhas: cliente à esquerda (borda `--line`), Nara à direita (`--nara-soft`, rótulo azul "✦ Nara"), corretor à direita (`--sunken`). Eventos centralizados com borda tracejada ("Handoff · Nara → Taís"). Campo de resposta com Enter para enviar. Respeitar a janela de 24h que já existe.

## 4. Modal "Nova tarefa"
Centralizado, 520px, top 14vh, entra com `popIn` de 180ms. Chips de tipo (8), seletor de lead, Hoje/Amanhã + horário, responsável (padrão: responsável do lead). **Enter cria, Esc fecha.** Tecla **N** abre o modal em qualquer tela.

## 5. Toasts
Pretos, na parte de baixo ao centro, somem em 6s. Toda ação tem **Desfazer**. Ao concluir uma tarefa, aparece também **"Agendar próxima"**, que abre o modal já com o lead.

---

## Tokens (substituem `:root` em `globals.css`, com tema claro e escuro via `[data-theme]`)
| Token | Claro | Escuro |
|---|---|---|
| --bg | #F4F3EF | #0E0E10 |
| --panel | #FFFFFF | #161619 |
| --sunken | #F2F1ED | #1D1D21 |
| --hover | #F8F7F4 | #1B1B1F |
| --line | #E8E5DF | #25252A |
| --line-2 | #D8D4CC | #34343B |
| --ink | #19181B | #EDECE8 |
| --ink-2 | #57534E | #A9A6A0 |
| --ink-3 | #8A857E | #77746E |
| --red / --red-soft / --red-line | #BF3A29 / #FCF0ED / #F1D5CE | #F08470 / rgba(240,132,112,.09) / .24 |
| --orange / --orange-soft | #A8650F / #FAF1E3 | #E2A758 / rgba(226,167,88,.10) |
| --green / --green-soft | #2B7549 / #E8F2EC | #6CC291 / rgba(108,194,145,.10) |
| --blue / --blue-soft | #2E58CC / #EDF1FC | #86A2F6 / rgba(134,162,246,.12) |
| --nara-soft | #F1F4FC | rgba(134,162,246,.08) |
| --btn / --btn-ink | #19181B / #FFFFFF | #EDECE8 / #111113 |
| --shadow | 0 1px 2px rgba(25,24,27,.04), 0 12px 32px rgba(25,24,27,.08) | 0 12px 40px rgba(0,0,0,.5) |
| --overlay | rgba(25,24,27,.22) | rgba(0,0,0,.55) |

No tema escuro, o logo usa `filter: invert(1)`.

Uso das cores: vermelho = atrasado; laranja = atenção; verde = concluído / humano atendendo; azul = ação, informação e Nara; cinza = secundário. O laranja e o teal antigos saem da interface.

**Tipografia:** Geist (400/500/600) para tudo e Geist Mono (400/500) para horários e valores (pacote `geist` ou Google Fonts). Saem Fraunces e Inter. Escala: 30/600, 21/600, 16/600, 14/500, 13.5, 12.5, 11.5. `font-feature-settings: 'tnum'`.
**Espaçamento:** 4 · 8 · 12 · 16 · 24 · 32 · 48.
**Raios:** 7 (botões), 11–12 (cards), 14 (painéis, drawer, modal).
**Bordas e sombras:** bordas de 1px no lugar de sombras; sombra só em drawer, modal e toast.
**Botões:** altura 30–34, primário `--btn` preto, secundário com borda `--line` sobre `--panel`.

## Dados necessários (já existem no Supabase)
`leads` (kind, stage, owner, cidade/país, empreendimento, temperatura, last_inbound_at), `lead_tasks` (type, due_at, status, assigned_to, assigned_mode='ai' → tag Nara), estado híbrido/handoff (`hybrid-server.ts`), mensagens WhatsApp. Os KPIs e alertas podem ser uma view SQL ou um endpoint `/api/hoje` que já devolva tudo agrupado.

## Ordem de implementação (1 PR por etapa)
1. Tokens + fontes + tema claro/escuro em `globals.css` (sem quebrar as telas atuais).
2. Novo `Sidebar.tsx` com 8 itens + redirects.
3. Página `/hoje` (KPIs, abas Clientes/Corretores, agenda, concluir inline).
4. Coluna lateral (alertas + Nara/Plantão + assumir handoff).
5. Drawer da ficha do lead.
6. Modal Nova tarefa + atalho N + toasts com desfazer.

## Arquivos
- `design/BOSSA Hoje.dc.html`: protótipo clicável (abra no navegador; precisa do `support.js` ao lado).
- `design/BOSSA Arquitetura.dc.html`: princípios, menu, superfícies e fundamentos.
- `design/assets/bossa-logo.png`: logotipo.

---

## Prompt pronto (cole no ChatGPT/Codex)
```
Você está no repositório fabionicodemus-lang/bossa-crm (Next.js 16 + TS + Supabase).
Leia docs/design/handoff_bossa_hoje/README.md e abra os HTML em design/ como referência visual.
Objetivo: recriar a nova interface do BOSSA CRM (menu com 8 itens + tela "Hoje" + drawer do lead + modal de tarefa)
usando os dados, as rotas de API e as permissões que já existem. Não altere regras de negócio nem a lógica da Nara/WhatsApp.
Siga a "Ordem de implementação" e faça SOMENTE a etapa 1 agora, em um PR:
tokens claro/escuro em globals.css, fontes Geist/Geist Mono, remoção de Fraunces/Inter,
sem quebrar as telas atuais. Rode npm run typecheck e npm run build antes de abrir o PR.
Ao terminar, liste o que mudou e o que ficou para a próxima etapa.
```
Depois de cada PR aprovado: "Faça agora a etapa 2 do README", e assim por diante.
