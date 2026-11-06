/**
 * Configuração do Aurora Abrigo — rede de hospedagem solidária temporária.
 * Fase 1 (atual): cadastro de anfitriãs/anfitriões e regras de validação.
 * Fase 2: análise pela equipe, capacitação e encaminhamento (match) integrado ao Aurora.
 */
var Config = (function () {
  return {
    APP: 'abrigo',
    VERSAO: '0.1.0',

    ESQUEMA: {
      Anfitrioes: [
        'id', 'protocolo', 'nome', 'email', 'telefone', 'bairro', 'endereco',
        'maxPessoas', 'aceitaFilhos', 'maxFilhos', 'duracaoMaxDias', 'acessivel', 'observacoes',
        'status', 'capacitacaoConcluida', 'consentimentoEm', 'criadoEm', 'atualizadoEm',
      ],
      Logs: ['id', 'dataHora', 'nivel', 'evento', 'detalhe', 'ambiente'],
    },
    CAMPOS_NUMERICOS: ['maxPessoas', 'maxFilhos', 'duracaoMaxDias'],
    CAMPOS_BOOLEANOS: ['aceitaFilhos', 'acessivel', 'capacitacaoConcluida'],
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Config: Config };
