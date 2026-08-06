# Ordem das migrations do Bossa CRM

## Regra de segurança

Os nomes das migrations que já podem ter sido executadas em produção são **histórico imutável**. Não renomeie, edite ou reaplique arquivos antigos apenas para corrigir a numeração. Toda evolução futura deve entrar em um novo arquivo com número ainda não utilizado.

## Ordem canônica para um ambiente novo

Execute os arquivos na ordem abaixo, e não apenas por uma ordenação numérica que trate os dois arquivos `002` como equivalentes:

1. `001_bossa_crm.sql`
2. `002_openai_personas_classificacao.sql`
3. `002_treinamento_nara_plantao.sql`
4. `003_arquivos_ia.sql`
5. `004_consumo_ia_gpt56.sql`
6. `005_sistema_hibrido_followup.sql`
7. `006_agendar_worker_followup.sql`
8. `007_empreendimentos_estoque_propostas.sql`
9. `008_arquivamento_exclusao_leads.sql`
10. `009_transmissoes_whatsapp.sql`
11. `010_propostas_cronograma_pdf.sql`
12. `011_modelos_meta.sql`
13. `012_whatsapp_desenvolvedor_direto.sql`
14. `013_agendar_worker_whatsapp.sql`
15. `014_whatsapp_coexistencia.sql`
16. `015_meta_ad_referral_attribution.sql`
17. `016_nara_prompt_final.sql`
18. `017_nara_offer_logs.sql`
19. `018_nara_dynamic_context.sql`
20. `019_nara_prompt_versions.sql`
21. `020_nara_prompt_score_enum.sql`
22. `021_ai_files_commercial_access.sql`

Os dois arquivos `002` declaram dependência apenas de `001_bossa_crm.sql` e atuam em estruturas diferentes. A ordem acima é a ordem documental adotada pelo projeto para eliminar ambiguidade em instalações novas.

## Caminho seguro para normalizar no futuro

1. Antes de qualquer normalização, conferir no banco de produção quais objetos de cada `002` já existem.
2. Não renomear os dois arquivos existentes no histórico atual.
3. Criar, em uma mudança futura e separada, uma migration nova com número único para registrar ou validar o histórico aplicado, sem recriar objetos antigos.
4. Para instalações futuras, considerar um baseline versionado em diretório separado, gerado a partir do estado validado do banco. O baseline não deve substituir nem reescrever o histórico usado em produção.
5. A partir da próxima migration, usar numeração única e crescente. O próximo número disponível é `022`.

## Observação sobre a migration 014

`014_whatsapp_coexistencia.sql` permanece no histórico porque pode ter sido executada e contém compatibilidade de schema. O modo operacional atual do Bossa CRM é Desenvolvedor Direto/API-only, com `FEATURE_EMBEDDED_SIGNUP=false`. A existência da migration não significa que a Coexistência esteja ativa.
