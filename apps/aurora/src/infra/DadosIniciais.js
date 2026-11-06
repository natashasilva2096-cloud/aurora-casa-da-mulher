/**
 * Carga inicial de pontos seguros (RF05/RF06) usada pela função setup().
 *
 * Fontes públicas consultadas em 06/11/2026 (ver campo `fonte`). As coordenadas
 * NÃO são digitadas: o setup geocodifica cada endereço com o serviço Maps.
 *
 * IMPORTANTE: antes de qualquer uso real, a equipe da Casa da Mulher deve
 * confirmar endereço, telefone e horário de cada ponto (CT-ACE01). Endereços de
 * alojamentos/abrigos sigilosos nunca devem constar nesta lista.
 */
var DadosIniciais = (function () {
  var FONTE_CMB = 'https://www.correio24horas.com.br/minha-bahia/violencia-domestica-contra-mulheres-sobe-27-na-bahia-veja-onde-buscar-ajuda-0824';
  var FONTE_PC = 'https://www.ba.gov.br/policiacivil/';

  var PONTOS = [
    {
      nome: 'Casa da Mulher Brasileira de Salvador',
      tipo: 'CASA_DA_MULHER',
      endereco: 'Av. Tancredo Neves, Caminho das Árvores (ao lado do Hospital Sarah)',
      geocodificar: 'Casa da Mulher Brasileira, Avenida Tancredo Neves, Caminho das Árvores, Salvador - BA',
      bairro: 'Caminho das Árvores',
      telefone: '(71) 3202-7390',
      horario: '24 horas, todos os dias',
      fonte: FONTE_CMB,
    },
    {
      nome: 'DEAM — unidade Casa da Mulher Brasileira',
      tipo: 'DEAM',
      endereco: 'Av. Tancredo Neves, Caminho das Árvores (dentro da Casa da Mulher Brasileira)',
      geocodificar: 'Casa da Mulher Brasileira, Avenida Tancredo Neves, Caminho das Árvores, Salvador - BA',
      bairro: 'Caminho das Árvores',
      telefone: '(71) 99683-3338',
      horario: '24 horas, todos os dias',
      fonte: FONTE_PC + '84/deam-brotas',
    },
    {
      nome: 'NUDEM — Defensoria Pública da Bahia',
      tipo: 'NUDEM',
      endereco: 'Av. Tancredo Neves, Caminho das Árvores (dentro da Casa da Mulher Brasileira)',
      geocodificar: 'Casa da Mulher Brasileira, Avenida Tancredo Neves, Caminho das Árvores, Salvador - BA',
      bairro: 'Caminho das Árvores',
      telefone: '(71) 3117-9142',
      horario: 'Seg. a qui. 9h–15h; sex. 9h–14h',
      fonte: FONTE_CMB,
    },
    {
      nome: 'DEAM Periperi',
      tipo: 'DEAM',
      endereco: 'Rua Dr. Almeida, 72 — Periperi, CEP 40720-070',
      geocodificar: 'Rua Doutor Almeida, 72, Periperi, Salvador - BA, 40720-070',
      bairro: 'Periperi',
      telefone: '(71) 3117-8203',
      horario: '24 horas',
      fonte: FONTE_PC + 'node/85',
    },
    {
      nome: 'NEAM Brotas (Núcleo Especial de Atendimento à Mulher)',
      tipo: 'DEAM',
      endereco: 'Rua Padre Luiz Figueira, s/n — Engenho Velho de Brotas (CPCD)',
      geocodificar: 'Rua Padre Luiz Figueira, Engenho Velho de Brotas, Salvador - BA',
      bairro: 'Engenho Velho de Brotas',
      telefone: '',
      horario: '24 horas',
      fonte: FONTE_PC + 'neam-brotas',
    },
    {
      nome: 'CREAM Arlette Magalhães',
      tipo: 'CRAM',
      endereco: 'Rua José Seixas Filho, 11CH — Fazenda Grande 2',
      geocodificar: 'Rua José Seixas Filho, Fazenda Grande II, Salvador - BA',
      bairro: 'Fazenda Grande 2',
      telefone: '(71) 3202-7380',
      horario: 'Seg. a sex. 8h–17h',
      fonte: FONTE_CMB,
    },
    {
      nome: 'CAMSID — Centro de Atendimento à Mulher Soteropolitana Irmã Dulce',
      tipo: 'CRAM',
      endereco: 'Rua Lélis Piedade, 63 — Ribeira',
      geocodificar: 'Rua Lélis Piedade, 63, Ribeira, Salvador - BA',
      bairro: 'Ribeira',
      telefone: '',
      horario: 'Atendimento seg. a sex. 8h–17h; acolhimento 24h',
      fonte: FONTE_CMB,
    },
  ];

  var JURIDICO = {
    titulo: 'NUDEM — Núcleo de Defesa das Mulheres da Defensoria Pública da Bahia',
    descricao:
      'Orientação jurídica gratuita, pedido de medida protetiva de urgência, ' +
      'questões de guarda, pensão e separação. O atendimento presencial acontece na Casa da Mulher Brasileira.',
    servicos: [
      'Pedido de medida protetiva de urgência (Lei Maria da Penha)',
      'Orientação sobre separação, guarda dos filhos e pensão alimentícia',
      'Acompanhamento do processo e audiências',
      'Encaminhamento para a rede de proteção',
    ],
    telefone: '(71) 3117-9142',
    horario: 'Seg. a qui. 9h–15h; sex. 9h–14h',
    endereco: 'Casa da Mulher Brasileira — Av. Tancredo Neves, Caminho das Árvores',
    fonte: FONTE_CMB,
  };

  return { PONTOS: PONTOS, JURIDICO: JURIDICO };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { DadosIniciais: DadosIniciais };
