import { empresa } from "@/content/site";
import { meta } from "@/lib/seo";

export const metadata = meta({ titulo: "Política de Privacidade · Bossa Empreendimentos", descricao: "Como a Bossa Empreendimentos coleta, usa e protege os dados de quem visita o site.", caminho: "/privacidade" });

export default function Privacidade() {
  return (
    <section className="sec">
      <div className="wrap pilha" style={{ maxWidth: 820 }}>
        <p className="rotulo">Privacidade</p>
        <h1 className="h2">Política de Privacidade</h1>
        <p className="nota">[Texto final a validar com o jurídico antes da publicação.]</p>
        <h2 className="h3">O que coletamos</h2>
        <p className="p">Quando você navega, registramos de forma anônima as páginas vistas e as interações com plantas, galerias e simuladores, ligadas a um código de visita gerado no seu navegador. Esse código não identifica você.</p>
        <p className="p">Quando você preenche um formulário ou nos chama pelo WhatsApp, passamos a saber seu nome e telefone, e o código de visita é associado ao seu atendimento, para que a nossa equipe entenda o que você já viu e não repita perguntas.</p>
        <h2 className="h3">Cookies de terceiros</h2>
        <p className="p">Google Analytics, Meta Pixel e Microsoft Clarity só são carregados se você aceitar todos os cookies. Você pode mudar essa escolha apagando os dados do site no seu navegador.</p>
        <h2 className="h3">Seus direitos</h2>
        <p className="p">Você pode pedir acesso, correção ou exclusão dos seus dados pelo e-mail {empresa.email}, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
      </div>
    </section>
  );
}
