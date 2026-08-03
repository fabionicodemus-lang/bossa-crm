import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

const updatedAt = '28 de julho de 2026';

const documents = {
  privacidade: {
    title: 'Política de Privacidade',
    description: 'Política de privacidade do Bossa CRM e das integrações de atendimento da Bossa Empreendimentos.',
    sections: [
      ['1. Quem somos', 'O Bossa CRM é uma ferramenta de relacionamento comercial utilizada pela Bossa Empreendimentos para organizar contatos de clientes, corretores parceiros, conversas de atendimento e atividades comerciais.'],
      ['2. Dados tratados', 'Podemos tratar dados fornecidos pelo próprio titular ou recebidos por canais autorizados, como nome, telefone, e-mail, empresa ou imobiliária, CRECI, interesse imobiliário, histórico de mensagens, arquivos compartilhados, preferências comerciais e registros técnicos necessários ao funcionamento e à segurança do sistema.'],
      ['3. Finalidades', 'Os dados são utilizados para responder solicitações, qualificar oportunidades, encaminhar atendimentos, agendar contatos, disponibilizar materiais comerciais, manter histórico de relacionamento, prevenir abuso e cumprir obrigações legais ou regulatórias.'],
      ['4. WhatsApp e Meta', 'Quando o atendimento ocorre pelo WhatsApp, as mensagens e eventos necessários podem ser processados por serviços da Meta e integrados ao Bossa CRM por meio da plataforma oficial WhatsApp Business. A Bossa utiliza esses dados apenas para as finalidades de atendimento e gestão comercial descritas nesta política.'],
      ['5. Inteligência artificial', 'O CRM pode utilizar modelos de inteligência artificial para auxiliar na elaboração de respostas, classificação de contatos, resumo de conversas e seleção de materiais previamente autorizados. Decisões comerciais relevantes, propostas, reservas e exceções são encaminhadas para análise humana.'],
      ['6. Compartilhamento', 'Os dados podem ser tratados por fornecedores de infraestrutura, banco de dados, hospedagem, mensageria e inteligência artificial estritamente para operar o serviço. Não vendemos dados pessoais. O compartilhamento também poderá ocorrer quando necessário para cumprir obrigação legal ou proteger direitos.'],
      ['7. Segurança e retenção', 'Adotamos controles de acesso, autenticação, segregação por organização, criptografia de credenciais e armazenamento protegido. Os dados são mantidos pelo período necessário às finalidades informadas, às relações comerciais e às obrigações legais aplicáveis, sendo posteriormente eliminados ou anonimizados quando cabível.'],
      ['8. Direitos do titular', 'O titular pode solicitar confirmação de tratamento, acesso, correção, informação sobre compartilhamento, oposição, portabilidade quando aplicável e eliminação de dados tratados com base no consentimento, observadas as hipóteses legais de conservação.'],
      ['9. Contato', 'Solicitações relacionadas à privacidade e ao tratamento de dados podem ser encaminhadas pelo e-mail de contato cadastrado pela Bossa no aplicativo Meta ou pelos canais oficiais da Bossa Empreendimentos.'],
      ['10. Atualizações', 'Esta política poderá ser atualizada para refletir mudanças legais, operacionais ou tecnológicas. A versão vigente permanecerá disponível nesta página.'],
    ],
  },
  termos: {
    title: 'Termos de Uso',
    description: 'Termos de uso do Bossa CRM e dos canais digitais de atendimento da Bossa Empreendimentos.',
    sections: [
      ['1. Objeto', 'Estes termos regulam o uso do Bossa CRM e dos recursos integrados de atendimento comercial da Bossa Empreendimentos. O sistema é destinado a usuários autorizados e ao relacionamento com clientes e corretores parceiros.'],
      ['2. Uso permitido', 'O usuário deve utilizar o sistema de forma legítima, segura e compatível com suas atribuições. É proibido tentar acessar contas de terceiros, burlar controles de segurança, extrair dados sem autorização, introduzir código malicioso ou usar o serviço para fraude, assédio, spam ou atividades ilícitas.'],
      ['3. Credenciais e acesso', 'Cada usuário é responsável por proteger suas credenciais e comunicar imediatamente qualquer suspeita de acesso indevido. A Bossa pode suspender contas ou integrações diante de risco de segurança, uso incompatível ou descumprimento destes termos.'],
      ['4. Conteúdo e informações comerciais', 'Informações sobre preços, disponibilidade, condições de pagamento, unidades, prazos e propostas dependem de confirmação do time comercial e dos documentos oficiais vigentes. Mensagens automáticas ou materiais enviados pelo sistema não constituem reserva, promessa de venda ou aceitação de proposta.'],
      ['5. Inteligência artificial', 'Respostas assistidas por inteligência artificial podem apoiar o atendimento, mas não substituem validação humana em negociações, propostas, reservas, reclamações, exceções ou temas sensíveis. A Bossa poderá revisar, corrigir, interromper ou assumir qualquer conversa.'],
      ['6. Disponibilidade', 'O serviço pode ficar temporariamente indisponível por manutenção, falhas de terceiros, alterações em APIs, incidentes de rede ou outros eventos fora do controle razoável da Bossa.'],
      ['7. Propriedade intelectual', 'A identidade visual, os textos, materiais, imagens, documentos, software e demais conteúdos da Bossa permanecem protegidos pela legislação aplicável. O acesso ao CRM não transfere qualquer direito de propriedade.'],
      ['8. Privacidade', 'O tratamento de dados pessoais segue a Política de Privacidade disponível neste mesmo domínio.'],
      ['9. Alterações', 'Estes termos podem ser atualizados para acompanhar mudanças no serviço, na legislação ou nos requisitos das plataformas integradas. A continuidade do uso após a atualização representa ciência da versão vigente.'],
      ['10. Contato', 'Dúvidas sobre estes termos podem ser encaminhadas pelos canais oficiais da Bossa Empreendimentos.'],
    ],
  },
  'exclusao-de-dados': {
    title: 'Instruções para Exclusão de Dados',
    description: 'Como solicitar a exclusão de dados associados ao Bossa CRM e às integrações da Bossa Empreendimentos.',
    sections: [
      ['1. Como solicitar', 'Envie uma solicitação pelo e-mail de contato cadastrado pela Bossa no aplicativo Meta ou por um canal oficial da Bossa Empreendimentos. Informe seu nome, número de telefone com DDD, e-mail quando houver e descreva quais dados ou conversas deseja excluir.'],
      ['2. Confirmação de identidade', 'Para proteger o titular, poderemos solicitar informações adicionais estritamente necessárias para confirmar a identidade e evitar exclusões indevidas. Não solicitamos senha do Facebook, WhatsApp, Meta ou do CRM.'],
      ['3. Prazo e retorno', 'Após a validação da solicitação, a Bossa informará o andamento e adotará as medidas cabíveis para excluir ou anonimizar os dados sob seu controle, ressalvados os registros que devam ser mantidos por obrigação legal, exercício regular de direitos, prevenção a fraude ou segurança.'],
      ['4. Dados em plataformas de terceiros', 'A exclusão no Bossa CRM não elimina automaticamente dados mantidos pela Meta, WhatsApp, Facebook ou outros fornecedores em suas próprias plataformas. Para esses dados, o titular também poderá utilizar os controles e canais disponibilizados pelo respectivo fornecedor.'],
      ['5. Revogação da integração', 'Administradores da Bossa podem desconectar os canais integrados no CRM e revogar acessos no painel da Meta. A desconexão interrompe novos eventos, mas não substitui uma solicitação específica de eliminação dos registros já armazenados.'],
      ['6. Contato', 'Use o e-mail de contato exibido no aplicativo Meta ou os canais oficiais da Bossa Empreendimentos para iniciar a solicitação.'],
    ],
  },
} as const;

type DocumentKey = keyof typeof documents;

export function generateMetadata({ params }: { params: Promise<{ documento: string }> }): Promise<Metadata> {
  return params.then(({ documento }) => {
    const document = documents[documento as DocumentKey];
    if (!document) return {};
    return { title: `${document.title} | Bossa CRM`, description: document.description };
  });
}

export default async function LegalPage({ params }: { params: Promise<{ documento: string }> }) {
  const { documento } = await params;
  const document = documents[documento as DocumentKey];
  if (!document) notFound();

  return (
    <main style={{ minHeight: '100vh', background: '#f5f2ed', padding: '40px 18px', color: '#243039' }}>
      <article style={{ maxWidth: 920, margin: '0 auto', background: '#fff', borderRadius: 18, padding: '36px clamp(22px, 5vw, 64px)', boxShadow: '0 12px 40px rgba(30, 45, 50, 0.08)' }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1.4, color: '#1f6a74', textTransform: 'uppercase' }}>Bossa Empreendimentos</div>
        <h1 style={{ fontSize: 'clamp(30px, 5vw, 48px)', lineHeight: 1.08, margin: '12px 0 10px', fontFamily: 'Georgia, serif' }}>{document.title}</h1>
        <p style={{ color: '#637078', margin: 0 }}>Bossa CRM · Atualizado em {updatedAt}</p>
        <div style={{ height: 1, background: '#e4e8e9', margin: '28px 0' }} />
        {document.sections.map(([title, text]) => (
          <section key={title} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 20, margin: '0 0 8px' }}>{title}</h2>
            <p style={{ fontSize: 16, lineHeight: 1.75, margin: 0, color: '#46535a' }}>{text}</p>
          </section>
        ))}
        <div style={{ height: 1, background: '#e4e8e9', margin: '30px 0 22px' }} />
        <nav style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
          <Link href="/legal/privacidade">Privacidade</Link>
          <Link href="/legal/termos">Termos de uso</Link>
          <Link href="/legal/exclusao-de-dados">Exclusão de dados</Link>
        </nav>
      </article>
    </main>
  );
}
