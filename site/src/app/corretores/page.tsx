import { meta } from "@/lib/seo";
import { FormLead } from "@/components/FormLead";

export const metadata = meta({ titulo: "Corretores · Material da Bossa Empreendimentos", descricao: "Books, plantas, imagens em alta e andamento das obras do Alma Seahouses e do Flow Aptos, direto da construtora.", caminho: "/corretores" });

export default function Corretores() {
  return (
    <section className="sec">
      <div className="wrap dupla" style={{ alignItems: "start" }}>
        <div className="pilha">
          <p className="rotulo">Para corretores</p>
          <h1 className="h1" style={{ fontSize: "clamp(44px, 5vw, 72px)" }}>Material sempre atualizado, direto da construtora.</h1>
          <p className="lead">Cada planta tem link próprio, pronto para mandar ao seu cliente. Books, imagens em alta, plantas e o andamento das obras são enviados pelo nosso time comercial, junto com tabelas e disponibilidade.</p>
          <ul className="lista-simples"><li>Books do Alma e do Flow</li><li>Imagens em alta</li><li>Plantas</li><li>Edições mensais de obra</li><li>Vídeos curtos para WhatsApp</li></ul>
        </div>
        <div className="cartao-form"><p className="rotulo" style={{ marginBottom: 16 }}>Cadastro de corretor</p><FormLead formulario="corretor" creci botao="Quero receber o material" sucesso="Cadastro recebido. O material chega no seu WhatsApp." /></div>
      </div>
    </section>
  );
}
