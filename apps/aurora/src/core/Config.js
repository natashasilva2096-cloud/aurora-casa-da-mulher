/**
 * Configuração central do Aurora.
 * Mudar regras de negócio (intervalos, limites, retenção) acontece aqui — RNF07.
 */
var Config = (function () {
  return {
    APP: 'aurora',
    VERSAO: '0.1.0',

    // RF03/RF04 — alerta e localização
    INTERVALO_ATUALIZACAO_LOCAL_SEG: 15,
    VALIDADE_ALERTA_HORAS: 12,
    TENTATIVAS_ENVIO_EMAIL: 2,
    TEMPO_MAXIMO_ACIONAMENTO_MS: 5000, // CT-SIS02: alerta em menos de 5 s

    // RF02
    MAX_CONTATOS: 5,

    // Sessão e autenticação
    SESSAO_HORAS: 6,
    MAX_TENTATIVAS_LOGIN: 5,
    BLOQUEIO_LOGIN_MIN: 15,

    // RF06
    LIMITE_PONTOS_PROXIMOS: 5,

    // RF07/RF08
    AGENDAMENTO_DIAS_MAX: 60,

    // LGPD — minimização: histórico de localização é apagado após este prazo
    RETENCAO_LOCALIZACAO_DIAS: 30,
    RETENCAO_LOGS_DIAS: 90,

    TELEFONES_EMERGENCIA: [
      { numero: '190', descricao: 'Polícia Militar' },
      { numero: '180', descricao: 'Central de Atendimento à Mulher' },
      { numero: '192', descricao: 'SAMU' },
    ],

    PERFIS: {
      USUARIA: 'USUARIA',
      EQUIPE_PSICOSSOCIAL: 'EQUIPE_PSICOSSOCIAL',
      EQUIPE_JURIDICA: 'EQUIPE_JURIDICA',
      ADMIN: 'ADMIN',
    },

    ESQUEMA: {
      Usuarias: ['id', 'nome', 'email', 'telefone', 'bairro', 'senhaHash', 'salt', 'perfil', 'consentimentoEm', 'criadoEm'],
      Contatos: ['id', 'usuariaId', 'nome', 'email', 'telefone', 'relacao', 'criadoEm'],
      Acionamentos: [
        'id', 'usuariaId', 'status', 'tokenRastreio', 'lat', 'lng', 'precisao',
        'inicio', 'fim', 'ultimaAtualizacao', 'enviados', 'falhas', 'duracaoMs',
      ],
      Localizacoes: ['id', 'acionamentoId', 'lat', 'lng', 'precisao', 'registradoEm'],
      PontosSeguros: [
        'id', 'nome', 'tipo', 'endereco', 'bairro', 'telefone', 'horario',
        'lat', 'lng', 'validado', 'fonte', 'atualizadoEm',
      ],
      Agendamentos: [
        'id', 'protocolo', 'usuariaId', 'tipo', 'dataPreferida', 'periodo', 'modalidade',
        'observacao', 'status', 'criadoEm', 'atualizadoEm', 'responsavel',
      ],
      Logs: ['id', 'dataHora', 'nivel', 'evento', 'detalhe', 'ambiente'],
    },

    CAMPOS_NUMERICOS: ['lat', 'lng', 'precisao', 'enviados', 'falhas', 'duracaoMs'],
    CAMPOS_BOOLEANOS: ['validado'],
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Config: Config };
