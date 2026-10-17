// Mensagem pronta do WhatsApp conforme a página (Fase 4, microtextos).
export function contextoWhatsApp(caminho: string): { mensagem: string; empreendimento?: string; barra: boolean; titulo: string } {
  const m = caminho.match(/^\/empreendimentos\/([^/]+)(?:\/plantas\/([^/]+))?/);
  const nomes: Record<string, string> = { "alma-seahouses": "Alma Seahouses", "flow-aptos": "Flow Aptos", "soul-residence": "Soul Residence", "jazz-residence": "Jazz Residence" };
  if (m && nomes[m[1]]) {
    const nome = nomes[m[1]];
    if (m[1] === "soul-residence") return { mensagem: "Olá! Quero saber mais sobre o apartamento disponível no Soul Residence.", empreendimento: m[1], barra: true, titulo: "Soul Residence · apartamento pronto" };
    if (m[1] === "jazz-residence") return { mensagem: "Olá! Estou no site da Bossa e gostaria de conversar.", empreendimento: m[1], barra: false, titulo: nome };
    return { mensagem: `Olá! Estou vendo o ${nome} no site e gostaria de mais informações.`, empreendimento: m[1], barra: true, titulo: nome };
  }
  if (caminho.startsWith("/obras")) return { mensagem: "Olá! Quero receber as edições mensais das obras da Bossa.", barra: false, titulo: "Obras" };
  if (caminho.startsWith("/comprar-morando-fora")) return { mensagem: "Olá! Moro fora do Brasil e tenho interesse nos empreendimentos da Bossa.", barra: false, titulo: "" };
  if (caminho.startsWith("/corretores")) return { mensagem: "Olá! Sou corretor(a) e quero receber o material da Bossa.", barra: false, titulo: "" };
  return { mensagem: "Olá! Estou no site da Bossa e gostaria de conversar.", barra: false, titulo: "" };
}
