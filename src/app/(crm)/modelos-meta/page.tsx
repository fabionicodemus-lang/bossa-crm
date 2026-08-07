import { redirect } from 'next/navigation';

// Os modelos passaram a viver dentro de Transmissões, junto das campanhas que
// os consomem. A rota antiga continua respondendo para não quebrar link salvo
// nem favorito de quem já usava a tela separada.
export default function MetaTemplatesPage() {
  redirect('/transmissoes?aba=modelos');
}
