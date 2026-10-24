// Eventos permitidos no site. O servidor recusa qualquer outro nome.
// request_material distingue pedido registrado de material e download efetivamente realizado.
export const EVENTOS = [
  // comportamento
  "page_view", "view_project", "scroll_depth", "view_bossa_way", "view_history",
  "view_floorplan", "switch_floorplan", "floorplan_zoom", "gallery_interact", "video_play",
  "view_location", "click_route", "view_construction", "view_engineering", "faq_open",
  "view_price", "simulate_payment", "download_material", "return_visit", "language_switch",
  // contato
  "click_whatsapp", "form_start", "lead_submit", "request_visit", "request_material",
] as const;

export type Evento = (typeof EVENTOS)[number];

// Eventos repassados ao Meta (Pixel), só com consentimento.
export const EVENTOS_META: Partial<Record<Evento, string>> = {
  view_project: "ViewContent",
  view_price: "ViewContent",
  click_whatsapp: "Contact",
  lead_submit: "Lead",
  request_visit: "Schedule",
};

// Chaves de detalhe aceitas. Nada de nome, telefone ou e-mail em eventos.
export const CHAVES_DETALHE = [
  "empreendimento", "estagio", "planta", "de", "para", "ordem", "metragem", "suites", "ambiente", "quantidade",
  "video", "percentual", "edicao", "tema", "pergunta", "faixa", "entrada", "prazo", "parcela", "arquivo",
  "dias", "visita", "idioma", "botao", "formulario", "interesse", "data", "tipo_pagina", "segundos", "pct",
] as const;
