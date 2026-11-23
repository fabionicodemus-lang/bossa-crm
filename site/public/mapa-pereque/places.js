const turismo='https://www.visiteportobelosc.com.br/onde-ir';
const praiaSource='https://www.visiteportobelosc.com.br/praia-balneario-pereque';
export const masterplan='https://locana.com.br/wp-content/uploads/2025/06/MASTERPLAN-PEREQUE.pdf';
const urbanismo='https://informefloripa.com/acip-divulga-projeto-de-urbanizacao-dos-molhes-da-praia-de-balneario-pereque/';
const photo=(file,alt,source=turismo)=>({file,alt,kind:'Fotografia do local',credit:'Visite Porto Belo · Fundação Municipal de Turismo',source});
const render=(file,alt)=>({file,alt,kind:'Perspectiva divulgada do projeto',credit:'ACIP / Le Notre · divulgação em janeiro de 2025',source:urbanismo});
const study=(file,alt,page)=>({file,alt,kind:'Estudo conceitual · masterplan de 2021',credit:'ACIPB · Masterplan Perequê',source:masterplan+'#page='+page,contain:true});
export const categories=[['all','Todas'],['praia','Praia & mar'],['natureza','Natureza'],['familia','Em família'],['esporte','Movimento'],['gastronomia','Gastronomia'],["marinas", "Marinas"],["supermercados", "Supermercados"],["escolas", "Escolas"],["restaurantes", "Restaurantes"],["pier", "Píer & roda-gigante"],['services','Dia a dia']];
export const places=[
{id:'flow',name:'Flow Aptos',p:[-48.58883,-27.15049],type:'bossa',img:'flow.jpg',height:65,body:'No ritmo da nossa vida. Duas suítes, duplex e lazer em dois pavimentos para ampliar as possibilidades de cada dia.',facts:[['800 m','referência até a praia'],['nov/2027','entrega prevista'],['2 e 3','suítes'],['57','apartamentos']],address:'Rua São José, 163 · Perequê',link:'https://www.bossaempreendimentos.com.br/empreendimentos/flow-aptos'},
{id:'alma',name:'Alma Seahouses',p:[-48.57830,-27.15443],type:'bossa',img:'alma.jpg',height:84,body:'Sua casa na praia, feita para sua alma. Espaços para viver em família, jardins e o mar fazendo parte do caminho.',facts:[['300 m','referência até a praia'],['jul/2030','entrega prevista'],['3 e 4','suítes'],['48','apartamentos']],address:'Rua Wilson Belber, 316 · Perequê',link:'https://www.bossaempreendimentos.com.br/empreendimentos/alma-seahouses'},

  {
    "id": "marina-pereque",
    "name": "Perequê Náutica Marina",
    "p": [
      -48.589451,
      -27.146328
    ],
    "type": "today",
    "categories": [
      "marinas"
    ],
    "icon": "sea",
    "short": "Av. Hironildo Conceição dos Santos, 512",
    "body": "Na margem do rio, a marina oferece guarda e apoio para motos aquáticas.",
    "activities": [
      "Marinas"
    ],
    "location": "Av. Hironildo Conceição dos Santos, 512",
    "tip": "Na margem do rio, a marina oferece guarda e apoio para motos aquáticas.",
    "source": "https://alohapp.com.br/marina-pereque-nautica",
    "gallery": [
      {
        "file": "pereque-rio",
        "alt": "O Rio Perequê visto da área coberta da marina",
        "kind": "Fotografia do local",
        "credit": "Perequê Náutica Marina · Aloha",
        "source": "https://alohapp.com.br/marina-pereque-nautica"
      },
      {
        "file": "pereque-galpao",
        "alt": "Motos aquáticas na garagem coberta da Perequê Náutica",
        "kind": "Fotografia do local",
        "credit": "Perequê Náutica Marina · Aloha",
        "source": "https://alohapp.com.br/marina-pereque-nautica"
      }
    ]
  },
  {
    "id": "marina-atlantida",
    "name": "Marina Atlântida Jet",
    "p": [
      -48.5885838,
      -27.1464434
    ],
    "type": "today",
    "categories": [
      "marinas"
    ],
    "icon": "sea",
    "short": "Rua Dona Augusta, 90 · Perequê",
    "body": "A unidade Jet da Marina Atlântida fica na Rua Dona Augusta, junto ao Rio Perequê.",
    "activities": [
      "Marinas"
    ],
    "location": "Rua Dona Augusta, 90 · Perequê",
    "tip": "Consulte a marina para combinar a guarda e a retirada da moto aquática.",
    "source": "https://marinaatlantida.com.br/",
    "gallery": [
      {
        "file": "atlantida-jet-frente",
        "alt": "Entrada da unidade Jet na Rua Dona Augusta",
        "kind": "Fotografia do local",
        "credit": "Marina Atlântida · site oficial",
        "source": "https://marinaatlantida.com.br/",
        "contain": true
      }
    ]
  },
  {
    "id": "komprao",
    "name": "Komprão Koch Atacadista",
    "p": [
      -48.5743046,
      -27.161162
    ],
    "type": "today",
    "categories": [
      "supermercados"
    ],
    "icon": "walk",
    "short": "Av. Governador Celso Ramos, 889",
    "body": "O atacarejo do Perequê fica na Avenida Governador Celso Ramos e atende as compras do dia a dia.",
    "activities": [
      "Supermercados"
    ],
    "location": "Av. Governador Celso Ramos, 889 · Perequê",
    "tip": "Uma parada para abastecer a casa antes de seguir para a praia.",
    "source": "https://komprao.com.br/cidade/porto-belo/",
    "gallery": [
      {
        "file": "komprao-pereque",
        "alt": "Fachada e estacionamento do Komprão do Perequê na inauguração de 2021",
        "kind": "Fotografia do local",
        "credit": "Grupo Koch · divulgação da unidade",
        "source": "https://pt.linkedin.com/posts/koch-hipermercado-ltda_anunciamos-orgulhosamente-a-abertura-da-activity-6814194326789230593--yYb"
      }
    ]
  },
  {
    "id": "koch",
    "name": "SuperKoch Perequê",
    "p": [
      -48.5803,
      -27.160855
    ],
    "type": "today",
    "categories": [
      "supermercados"
    ],
    "icon": "walk",
    "short": "Rua Rubens Alves, 1254",
    "body": "Mercado para as compras da semana no bairro.",
    "activities": [
      "Supermercados"
    ],
    "location": "Rua Rubens Alves, 1254 · Perequê",
    "tip": "Mercado para as compras da semana no bairro.",
    "source": "https://www.superkoch.com.br/2377/nossas-lojas",
    "gallery": [
      {
        "file": "superkoch-aereo",
        "alt": "Vista aérea do quarteirão do SuperKoch na Rua Rubens Alves",
        "kind": "Imagem de satélite",
        "credit": "Esri World Imagery · Esri, Maxar, Earthstar Geographics e colaboradores",
        "source": "https://www.arcgis.com/home/webmap/viewer.html?basemap=satellite&center=-48.5803,-27.160855&level=18"
      }
    ]
  },
  {
    "id": "olinda",
    "name": "Escola Olinda Peixoto",
    "p": [
      -48.591052,
      -27.151215
    ],
    "type": "today",
    "categories": [
      "escolas"
    ],
    "icon": "walk",
    "short": "Perequê · Porto Belo",
    "body": "Escola básica municipal no Perequê.",
    "activities": [
      "Escolas"
    ],
    "location": "Perequê · Porto Belo",
    "tip": "Escola básica municipal no Perequê.",
    "source": "https://nopontosc.com.br/2026/08/14/porto-belo-entrega-reforma-da-escola-olinda-peixoto-com-investimento-de-quase-r-1-milhao/",
    "gallery": [
      {
        "file": "olinda-escola",
        "alt": "Fachada da Escola Olinda Peixoto após a reforma, em agosto de 2026",
        "kind": "Fotografia do local",
        "credit": "NoPontoSC · reportagem sobre a reforma",
        "source": "https://nopontosc.com.br/2026/08/14/porto-belo-entrega-reforma-da-escola-olinda-peixoto-com-investimento-de-quase-r-1-milhao/"
      }
    ]
  },
  {
    "id": "catarina",
    "name": "Escola Catarina Benedita Guerreiro",
    "p": [
      -48.577559,
      -27.158817
    ],
    "type": "today",
    "categories": [
      "escolas"
    ],
    "icon": "walk",
    "short": "Perequê · Porto Belo",
    "body": "A escola municipal do Perequê passou por uma reconstrução. A fotografia documenta a obra da nova sede em julho de 2025.",
    "activities": [
      "Escolas"
    ],
    "location": "Perequê · Porto Belo",
    "tip": "Na vista aérea, veja como a escola se insere entre as ruas do bairro.",
    "source": "https://visornoticias.com.br/obras-da-nova-escola-catarina-benedita-guerreiro-seguem-em-ritmo-acelerado-em-porto-belo/",
    "gallery": [
      {
        "file": "catarina-obra",
        "alt": "Nova sede da Escola Catarina Benedita Guerreiro em construção, em julho de 2025",
        "kind": "Fotografia da obra · 2025",
        "credit": "Júnior Lara · Visor Notícias",
        "source": "https://visornoticias.com.br/obras-da-nova-escola-catarina-benedita-guerreiro-seguem-em-ritmo-acelerado-em-porto-belo/"
      }
    ],
    "status": "Escola · registro de obra"
  },
  {
    "id": "neiva",
    "name": "Vó Neiva Restaurante",
    "p": [
      -48.581831,
      -27.159922
    ],
    "type": "today",
    "categories": [
      "restaurantes",
      "gastronomia"
    ],
    "icon": "food",
    "short": "Perequê · Porto Belo",
    "body": "Uma opção para almoçar no Perequê e continuar o passeio pelo bairro.",
    "activities": [
      "Restaurantes"
    ],
    "location": "Perequê · Porto Belo",
    "tip": "Uma opção para almoçar no Perequê e continuar o passeio pelo bairro.",
    "source": "https://restaurantguru.com.br/Restarante-Vo-Neiva-Porto-Belo",
    "gallery": [
      {
        "file": "neiva-buffet",
        "alt": "Balcão de buffet do Restaurante Vó Neiva",
        "kind": "Fotografia do local",
        "credit": "Galeria do Restaurante Vó Neiva · Restaurant Guru",
        "source": "https://restaurantguru.com.br/Restarante-Vo-Neiva-Porto-Belo"
      },
      {
        "file": "neiva-fachada",
        "alt": "Letreiro do Vó Neiva na entrada do restaurante",
        "kind": "Fotografia do local",
        "credit": "Galeria do Restaurante Vó Neiva · Restaurant Guru",
        "source": "https://restaurantguru.com.br/Restarante-Vo-Neiva-Porto-Belo"
      }
    ]
  },
  {
    "id": "oliva",
    "name": "Forneria Oliva Pier",
    "p": [
      -48.584995,
      -27.14343
    ],
    "type": "today",
    "categories": [
      "restaurantes",
      "gastronomia"
    ],
    "icon": "food",
    "short": "Píer Oporto · Meia Praia, Itapema",
    "body": "Uma parada para pizza durante o passeio sobre o mar.",
    "activities": [
      "Restaurantes"
    ],
    "location": "Píer Oporto · Meia Praia, Itapema",
    "tip": "Uma parada para pizza durante o passeio sobre o mar.",
    "source": "https://www.forneriaoliva.com.br/unidades/",
    "gallery": [
      {
        "file": "oliva-prato",
        "alt": "Burrata com tomates publicada pela Forneria Oliva na apresentação da unidade do Píer Oporto",
        "kind": "Fotografia gastronômica",
        "credit": "Forneria Oliva · página oficial das unidades",
        "source": "https://www.forneriaoliva.com.br/unidades/"
      }
    ]
  },
  {
    "id": "pier-oporto",
    "name": "Píer Oporto",
    "p": [
      -48.58504,
      -27.14346
    ],
    "type": "today",
    "categories": [
      "pier",
      "familia",
      "praia",
      "restaurantes"
    ],
    "short": "Meia Praia · Itapema",
    "body": "Na margem de Itapema, o passeio segue por lojas e restaurantes sobre a água até o pavilhão circular do Hard Rock. Do convés se vê a foz do Perequê.",
    "icon": "sea",
    "height": 20,
    "location": "Meia Praia · Itapema",
    "tip": "Passear sobre o mar",
    "activities": [
      "Passear sobre o mar",
      "Restaurantes",
      "Vista da foz"
    ],
    "gallery": [
      {
        "file": "pier-aereo",
        "alt": "Vista aérea do píer iluminado",
        "source": "https://maybelly.com.br/empreendimentos/pier-oporto",
        "credit": "MayBelly · Píer Oporto",
        "kind": "Fotografia do local"
      },
      {
        "file": "pier-entrada",
        "alt": "Fachada na entrada do Píer Oporto",
        "source": "https://maybelly.com.br/empreendimentos/pier-oporto",
        "credit": "MayBelly · Píer Oporto",
        "kind": "Fotografia do local"
      }
    ],
    "source": "https://maybelly.com.br/empreendimentos/pier-oporto"
  },
  {
    "id": "hard-rock",
    "name": "Hard Rock Cafe Itapema",
    "p": [
      -48.584046,
      -27.142834
    ],
    "type": "today",
    "categories": [
      "pier",
      "restaurantes",
      "gastronomia"
    ],
    "short": "Extremidade do píer · Itapema",
    "body": "A guitarra na fachada marca a ponta do píer. O restaurante ocupa o pavilhão circular envidraçado, com vista para o mar.",
    "icon": "food",
    "height": 20,
    "location": "Extremidade do píer · Itapema",
    "tip": "Comer com vista para o mar",
    "activities": [
      "Comer com vista para o mar",
      "Ver a guitarra da fachada"
    ],
    "gallery": [
      {
        "file": "hard-rock",
        "alt": "Guitarra iluminada na fachada do Hard Rock Cafe Itapema",
        "source": "https://maybelly.com.br/empreendimentos/pier-oporto",
        "credit": "MayBelly · Píer Oporto",
        "kind": "Fotografia do local"
      },
      {
        "file": "pier-aereo",
        "alt": "Conjunto do Píer Oporto visto de cima",
        "source": "https://maybelly.com.br/empreendimentos/pier-oporto",
        "credit": "MayBelly · Píer Oporto",
        "kind": "Fotografia do local"
      }
    ],
    "source": "https://cafe.hardrock.com/itapema/"
  },
  {
    "id": "it-wheel",
    "name": "It! Wheel",
    "p": [
      -48.58573,
      -27.14383
    ],
    "type": "today",
    "categories": [
      "pier",
      "familia"
    ],
    "short": "Entrada do Píer Oporto · Itapema",
    "body": "A roda-gigante junto à entrada do píer tem 60 metros e 30 cabines. O modelo mostra sua configuração completa. Em novembro de 2026, a atração estava em testes, com abertura prevista para dezembro.",
    "icon": "sun",
    "height": 47,
    "location": "Entrada do Píer Oporto · Itapema",
    "tip": "Vista panorâmica prevista",
    "activities": [
      "Vista panorâmica prevista",
      "30 cabines"
    ],
    "gallery": [
      {
        "file": "wheel-real",
        "alt": "Roda-gigante em testes vista do alto",
        "source": "https://itwheel.com.br/",
        "credit": "It! Wheel · divulgação",
        "kind": "Fotografia do local"
      },
      {
        "file": "wheel-prevista",
        "alt": "Vista divulgada do conjunto da roda e píer",
        "source": "https://itwheel.com.br/",
        "credit": "It! Wheel · divulgação",
        "kind": "Perspectiva divulgada"
      }
    ],
    "source": "https://itwheel.com.br/",
    "status": "Em testes"
  }
,
{id:'praia',name:'Praia do Perequê',short:'Um dia com os pés na areia',p:[-48.5759,-27.14965],type:'today',icon:'sun',categories:['praia','familia','esporte'],body:'A caminhada da manhã, o guarda-sol aberto, uma pausa para comer à beira-mar. A praia traz para o cotidiano do bairro aquele ritmo que normalmente fica reservado às férias.',activities:['Caminhar na areia','Curtir em família','Esportes na praia','Comer à beira-mar'],gallery:[photo('praia','Guarda-sóis coloridos e pessoas na Praia do Perequê',praiaSource),photo('praia-vista','Vista aérea da Praia do Perequê',praiaSource),photo('praia-caminhada','Pessoas caminhando na Praia do Perequê',praiaSource)],source:praiaSource,location:'Praia do Perequê · acesso pela Av. Atílio Fontana',tip:'Uma manhã de praia, seguida de almoço no bairro.',next:'orla'},
{id:'lagoa',name:'Parque da Lagoa',short:'Uma pausa no verde',p:[-48.5804,-27.1507],type:'today',icon:'leaf',categories:['natureza','familia'],body:'Entre a vegetação, os decks e os espaços de observação, o Parque Natural Municipal da Lagoa do Perequê convida a desacelerar. Um passeio para descobrir a natureza que também faz parte da vida urbana.',activities:['Passear pelos decks','Observar a natureza','Fotografar','Educação ambiental'],gallery:[photo('lagoa','Deck de madeira entre a vegetação do Parque da Lagoa')],source:turismo,location:'Rua Aderbal de Souza · área do Parque da Lagoa',tip:'Uma pausa tranquila em meio ao verde.',next:'lagoafutura'},
{id:'costao',name:'Passarela do Costão',short:'O mar por outro ângulo',p:[-48.5627,-27.1565],type:'today',icon:'walk',categories:['praia','natureza','esporte'],body:'O caminho de madeira acompanha as pedras e a vegetação do Costão das Vieiras. Um convite para passear, observar o mar e descobrir novos enquadramentos da costa.',activities:['Caminhar','Contemplar o mar','Fotografar a paisagem'],gallery:[photo('costao','Passarela de madeira construída junto às pedras do Costão das Vieiras')],source:turismo,location:'Costão das Vieiras · entorno sul do Perequê',tip:'Um passeio para ver a paisagem de perto.',note:'A passarela já consta entre os atrativos do portal municipal de turismo. A imagem mostra o trecho divulgado; não representa toda a conexão prevista no masterplan.'},
{id:'oporto',name:'Oporto Food Park',short:'Encontros que viram programa',p:[-48.58535,-27.1515],type:'today',icon:'food',categories:['gastronomia','familia','restaurantes'],body:'Um ponto de encontro para escolher o que comer, reunir amigos e estender o passeio pelo bairro. O food park combina gastronomia e convivência no Perequê.',activities:['Gastronomia','Encontro com amigos','Passeio em família'],gallery:[photo('oporto','Oporto Food Park iluminado à noite')],source:turismo,location:'Região da Av. Santino Voltolini e Rua Rudy Arnaldo Hintz',tip:'Depois da praia, uma mesa para reunir todo mundo.',note:'Marcador aproximado, referenciado ao endereço divulgado. Horários, operações e programação devem ser consultados com o local.'},
{id:'molhehoje',name:'Molhe do Rio Perequê',short:'Onde o rio encontra o mar',p:[-48.5848,-27.1441],type:'today',icon:'sea',categories:['praia','natureza'],body:'O encontro do rio com o Atlântico já tem lugar na paisagem do Perequê. A vista abre espaço para observar a costa e imaginar a urbanização proposta para seu entorno.',activities:['Vista da costa','Contemplação','Fotografia'],gallery:[photo('molhe','Vista aérea dos molhes do Rio Perequê')],source:turismo,location:'Foz do Rio Perequê',tip:'Uma paisagem marcante na chegada ao bairro.',note:'A fotografia registra a estrutura existente. As áreas de lazer e paisagismo do projeto de urbanização estão na camada futura; não se presume acesso livre a toda a obra.',next:'molhes'},
{id:'molhes',name:'Urbanização dos molhes',short:'Um novo encontro à beira-mar',p:[-48.5854,-27.1443],type:'future',icon:'sea',categories:['praia','familia','natureza'],body:'O projeto divulgado propõe transformar o entorno dos molhes em espaços de passeio e convivência. Caminhos orgânicos, paisagismo e áreas de permanência aproximam a vida do bairro do encontro entre rio e mar.',activities:['Passeio à beira-mar','Convivência','Paisagismo','Contemplação'],gallery:[render('orla-1','Perspectiva aérea do projeto de urbanização no entorno dos molhes'),render('orla-3','Vista geral da proposta para o entorno dos molhes'),render('orla-5','Perspectiva das coberturas e áreas de permanência do projeto')],source:urbanismo,location:'Entorno dos molhes · área indicativa',tip:'Imagine terminar o dia em um espaço aberto para o mar.',next:'molhehoje'},
{id:'orla',name:'Parque da Orla',short:'A vida ganha espaço lá fora',p:[-48.5732,-27.1515],type:'future',icon:'walk',categories:['praia','familia','esporte','gastronomia'],body:'A visão para a orla reúne passeio, natureza, recreação e convivência. O masterplan propõe conectar os atrativos ao longo da praia; o projeto de urbanização divulgado em 2025 detalha a etapa inicial no entorno dos molhes.',activities:['Caminhadas','Lazer ao ar livre','Espaços de encontro','Recreação'],gallery:[render('orla-6','Perspectiva do passeio com paisagismo e coberturas no projeto divulgado'),render('orla-4','Perspectiva dos espaços de lazer do projeto de urbanização'),study('estudo-areia','Ensaio volumétrico da orla presente no masterplan',31)],source:urbanismo,location:'Orla do Perequê · posição ilustrativa',tip:'Uma orla para caminhar, encontrar e permanecer.',note:'As perspectivas de 2025 representam o entorno dos molhes, primeira etapa divulgada. Não são o projeto executivo de toda a extensão da praia.',next:'praia'},
{id:'playground',name:'Brincar à beira-mar',short:'Mais momentos em família',p:[-48.5854,-27.1443],pin:false,type:'future',icon:'play',categories:['familia','praia'],body:'Playground e áreas de convivência fazem parte da proposta divulgada para a reurbanização. A ideia é criar mais oportunidades de brincar, passear e aproveitar a praia em família.',activities:['Playground proposto','Passeio em família','Áreas de convivência'],gallery:[render('orla-4','Perspectiva dos espaços de lazer na proposta de urbanização'),render('orla-2','Vista superior dos espaços previstos no projeto')],source:urbanismo,location:'Projeto da orla e entorno dos molhes · sem lote definido neste mapa',tip:'Uma pausa para brincar no caminho de casa.',note:'Perspectivas gerais da urbanização divulgada. Posição, equipamentos e desenho final do playground dependem do projeto aprovado.'},
{id:'esportes',name:'Esporte & vida ao ar livre',short:'O bairro também pode ser seu clube',p:[-48.5759,-27.14965],pin:false,type:'future',icon:'play',categories:['esporte','praia','familia'],body:'Quadras de areia, espaços para esportes náuticos e áreas de lazer integram a proposta de reurbanização. Novas possibilidades para colocar movimento na rotina, perto do mar.',activities:['Quadras de areia propostas','Esportes náuticos propostos','Vida ao ar livre','Espaço pet proposto'],gallery:[render('orla-2','Vista geral da proposta de urbanização da orla'),render('orla-5','Perspectiva dos espaços abertos e de permanência')],source:urbanismo,location:'Orla do Perequê · distribuição dos equipamentos a definir',tip:'Mais motivos para sair de casa e se movimentar.',note:'As imagens mostram o conjunto da urbanização, não o detalhamento das quadras ou dos equipamentos esportivos.'},
{id:'rio',name:'Riverfront do Perequê',short:'O rio como lugar de encontro',p:[-48.5904,-27.1458],type:'future',icon:'sea',categories:['natureza','gastronomia','esporte'],body:'O masterplan propõe uma margem com comércio, lazer e atividades náuticas. A intenção é criar uma relação mais próxima com o rio, com percursos e estruturas de atracação.',activities:['Percurso junto ao rio','Comércio e lazer propostos','Atividades náuticas'],gallery:[study('estudo-rio','Diagrama do masterplan para o Rio Perequê, com referências de conceito',20)],source:masterplan+'#page=41',location:'Margens do Rio Perequê · área indicativa',tip:'Um novo jeito de viver a paisagem do rio.',note:'Diagrama do documento original, com referências de conceito. Ainda não há uma perspectiva executiva específica verificada para esta atração.'},
{id:'lagoafutura',name:'Novos usos da lagoa',short:'A natureza ainda mais presente',p:[-48.5815,-27.1494],type:'future',icon:'leaf',categories:['natureza','familia','esporte'],body:'Além do parque que já existe, o masterplan apresenta uma visão de recuperação ambiental, integração dos atrativos e novas estruturas para atividades náuticas. A ligação com o rio aparece como intenção do plano.',activities:['Recuperação ambiental','Integração com o bairro','Atividades náuticas propostas'],gallery:[study('estudo-lagoa','Diagrama da proposta para a Lagoa do Perequê no masterplan',23),photo('lagoa','Fotografia atual do Parque da Lagoa, antes dos novos usos propostos')],source:masterplan+'#page=43',location:'Lagoa do Perequê · área indicativa',tip:'Conheça o parque hoje e explore a visão para o futuro.',note:'O diagrama contém referências conceituais, não uma perspectiva executiva da futura lagoa. A segunda imagem mostra o parque existente.',next:'lagoa'},
{id:'jardim',name:'Avenidas-jardim',short:'O passeio começa no caminho',p:[-48.5843,-27.1540],type:'future',icon:'leaf',categories:['natureza','esporte'],body:'A proposta de avenidas-jardim combina mobilidade, arborização e espaços para pedestres. A visão é fazer das conexões do bairro lugares mais agradáveis para circular e conviver.',activities:['Arborização','Caminhos para pedestres','Mobilidade ativa'],gallery:[study('estudo-jardim','Página do masterplan sobre avenidas-jardim, com imagens de referência',45)],source:masterplan+'#page=45',location:'Conexões viárias propostas · marcador conceitual',tip:'Mais verde e espaço para caminhar entre um programa e outro.',note:'As fotografias nesta página do masterplan são referências de outros lugares. Não representam uma obra pronta nem uma renderização do Perequê.'},
{id:'areia',name:'Ampliação da faixa de areia',short:'Mais horizonte para imaginar',p:[-48.5800,-27.1468],type:'future',icon:'sun',categories:['praia','familia','esporte'],body:'A ampliação da faixa de areia faz parte das intenções do masterplan para a orla. O ensaio volumétrico ajuda a visualizar essa proposta em conjunto com os espaços de lazer e as conexões do bairro.',activities:['Praia ampliada proposta','Lazer na areia','Integração da orla'],gallery:[study('estudo-areia','Ensaio volumétrico da orla e ampliação da faixa de areia no masterplan',31),photo('praia-vista','Fotografia da Praia do Perequê existente, sem a ampliação proposta',praiaSource)],source:masterplan+'#page=42',location:'Praia do Perequê · faixa conceitual',tip:'Uma visão de futuro para os dias de praia.',note:'Estudo conceitual sem largura, licença, data de início ou prazo de execução confirmados nesta experiência.'},
{
  "id": "upa",
  "name": "UPA 24 horas",
  "p": [
    -48.5927371,
    -27.1578172
  ],
  "type": "today",
  "categories": [
    "services"
  ],
  "icon": "walk",
  "body": "Unidade de Pronto Atendimento de Porto Belo, na Avenida Governador Celso Ramos.",
  "short": "Atendimento de urgência",
  "location": "Porto Belo · SC",
  "activities": [
    "Saúde no bairro"
  ],
  "tip": "Localize a unidade no mapa do bairro.",
  "source": "https://portobelo.sc.gov.br/uploads/sites/375/2025/10/EIV-Mount-Hermon-22-10-25.pdf#page=32",
  "gallery": [
    {
      "file": "upa-unidade",
      "alt": "Vista aérea da Unidade de Pronto Atendimento de Porto Belo",
      "kind": "Fotografia do local",
      "credit": "EIV Mount Hermon · figura 25, publicação do Município de Porto Belo",
      "source": "https://portobelo.sc.gov.br/uploads/sites/375/2025/10/EIV-Mount-Hermon-22-10-25.pdf#page=32"
    }
  ]
},
{
  "id": "faculdade",
  "name": "Faculdade Porto das Águas",
  "p": [
    -48.5732668,
    -27.160317
  ],
  "type": "today",
  "categories": [
    "services"
  ],
  "icon": "walk",
  "status": "Referência local",
  "short": "Referência cartográfica · Perequê",
  "location": "Avenida Governador Celso Ramos · ponto cartográfico",
  "body": "A vista aérea situa o endereço cartográfico da FAPAG no Perequê. O site da instituição reúne contatos e informações para consulta de documentos acadêmicos.",
  "activities": [
    "Consulta de documentos"
  ],
  "tip": "Consulte a instituição para informações sobre o acervo acadêmico.",
  "source": "https://fapag.edu.br/documentos",
  "gallery": [
    {
      "file": "fapag-entorno",
      "alt": "Vista aérea do entorno do ponto cartográfico da FAPAG no Perequê",
      "kind": "Imagem de satélite",
      "credit": "Esri World Imagery · Esri, Maxar, Earthstar Geographics e colaboradores",
      "source": "https://www.arcgis.com/home/webmap/viewer.html?basemap=satellite&center=-48.5732668,-27.160317&level=18"
    }
  ]
}
];
