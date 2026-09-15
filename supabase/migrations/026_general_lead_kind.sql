-- Terceiro tipo de cadastro para números do WhatsApp compartilhado que ainda
-- não são conhecidos como cliente nem corretor.
alter type public.lead_kind add value if not exists 'geral';
