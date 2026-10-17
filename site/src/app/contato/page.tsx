import { empresa } from "@/content/site";
import { meta } from "@/lib/seo";
import { FormLead } from "@/components/FormLead";
import { LinkWhatsApp } from "@/components/LinkWhatsApp";

export const metadata = meta({ titulo: "Contato · Bossa Empreendimentos", descricao: "WhatsApp, endereço e e-mail da Bossa Empreendimentos, em Itapema e Porto Belo.", caminho: "/contato" });

export default function Contato() {
  const e = empresa.endereco;
  return (
    <section className="sec">
      <div className="wrap dupla" style={{ alignItems: "start" }}>
        <div className="pilha">
          <p className="rotulo">Contato</p>
          <h1 className="h1">Fale com a Bossa.</h1>
          <p className="lead">O jeito mais rápido é o WhatsApp. Se preferir, venha nos visitar.</p>
          <LinkWhatsApp className="botao" botao="contato" mensagem="Olá! Estou no site da Bossa e gostaria de conversar.">Conversar pelo WhatsApp</LinkWhatsApp>
          <ul className="lista-dados" style={{ marginTop: 24 }}>
            <li><span>Escritório</span><span>{e.rua} · {e.bairro} · {e.cidade} · {e.uf}</span></li>
            <li><span>E-mail</span><span><a href={`mailto:${empresa.email}`}>{empresa.email}</a></span></li>
            <li><span>Instagram</span><span><a href={empresa.instagram} target="_blank" rel="noopener">@bossaempreendimentos</a></span></li>
          </ul>
          <a className="botao botao--texto" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.rua}, ${e.bairro}, ${e.cidade} - ${e.uf}`)}`} target="_blank" rel="noopener">Abrir no mapa</a>
        </div>
        <div className="cartao-form" id="visita"><p className="rotulo" style={{ marginBottom: 16 }}>Agendar visita</p><FormLead formulario="visita" interesse data botao="Pedir visita" sucesso="Pedido recebido. Vamos confirmar data e horário pelo WhatsApp." /></div>
      </div>
    </section>
  );
}
