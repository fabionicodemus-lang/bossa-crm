-- BOSSA CRM — registro de consumo de IA para todas as funções
--
-- Até aqui `ai_usage_logs` só aceitava as chamadas da Nara/Plantão
-- ('response' e 'summary'). As análises em segundo plano chamavam a OpenAI
-- sem gravar custo. Esta migration libera os novos tipos:
--
--   broker_review            resumo/próxima ação da conversa equipe x corretor
--   broker_performance       extração de fatos comerciais do corretor
--   commercial_intelligence  detecção de proposta e de compromisso na conversa
--   image_understanding      leitura de imagem recebida no WhatsApp
--   audio_transcription      transcrição de áudio recebido no WhatsApp
--
-- É só uma ampliação da regra: nenhuma linha existente é alterada.
-- Aplicar ANTES de publicar o código que grava os novos tipos. Se o código
-- subir antes, nada quebra: a gravação é recusada, o erro vai para o log e a
-- rotina segue normalmente (apenas continua sem registrar esses custos).

alter table public.ai_usage_logs
  drop constraint if exists ai_usage_logs_request_kind_check;

alter table public.ai_usage_logs
  add constraint ai_usage_logs_request_kind_check
  check (request_kind in (
    'summary',
    'response',
    'broker_review',
    'broker_performance',
    'commercial_intelligence',
    'image_understanding',
    'audio_transcription'
  ));
