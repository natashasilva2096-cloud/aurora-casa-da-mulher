/**
 * Regras de agendamento psicossocial (RF07) e atendimento jurídico/NUDEM (RF08).
 *
 * Estados (transição de estados):
 *   SOLICITADO -> CONFIRMADO -> REALIZADO
 *   SOLICITADO | CONFIRMADO -> CANCELADO
 */
var Agendamento = (function () {
  var TIPOS = {
    PSICOSSOCIAL: 'Acolhimento psicossocial',
    JURIDICO: 'Orientação jurídica (NUDEM / Defensoria)',
  };
  var PERIODOS = { MANHA: 'Manhã', TARDE: 'Tarde' };
  var MODALIDADES = { PRESENCIAL: 'Presencial', TELEFONE: 'Ligação telefônica', VIDEO: 'Videochamada' };
  var STATUS = { SOLICITADO: 'SOLICITADO', CONFIRMADO: 'CONFIRMADO', REALIZADO: 'REALIZADO', CANCELADO: 'CANCELADO' };

  var TRANSICOES = {
    SOLICITADO: ['CONFIRMADO', 'CANCELADO'],
    CONFIRMADO: ['REALIZADO', 'CANCELADO'],
    REALIZADO: [],
    CANCELADO: [],
  };

  var OBSERVACAO_MAX = 500;

  /** 'AAAA-MM-DD' -> Date (meia-noite UTC) ou null. */
  function parseData(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return d;
  }

  function diaUtil(d) {
    var dia = d.getUTCDay();
    return dia !== 0 && dia !== 6;
  }

  /**
   * @param {object} s  {tipo, dataPreferida:'AAAA-MM-DD', periodo, modalidade, observacao}
   * @param {string} hojeIso  data de hoje 'AAAA-MM-DD' no fuso de Salvador
   */
  function validarSolicitacao(s, hojeIso, diasMax) {
    var d = s || {};
    var erros = {};
    var limite = diasMax || 60;
    if (!TIPOS[d.tipo]) erros.tipo = 'Escolha o tipo de atendimento.';
    if (!PERIODOS[d.periodo]) erros.periodo = 'Escolha o período (manhã ou tarde).';
    if (!MODALIDADES[d.modalidade]) erros.modalidade = 'Escolha como prefere ser atendida.';

    var data = parseData(d.dataPreferida);
    var hoje = parseData(hojeIso);
    if (!data) {
      erros.dataPreferida = 'Informe uma data válida.';
    } else if (hoje) {
      var diffDias = Math.round((data.getTime() - hoje.getTime()) / 86400000);
      if (diffDias < 0) erros.dataPreferida = 'A data não pode estar no passado.';
      else if (diffDias > limite) erros.dataPreferida = 'Escolha uma data nos próximos ' + limite + ' dias.';
      else if (!diaUtil(data)) erros.dataPreferida = 'O atendimento agendado acontece de segunda a sexta.';
    }
    if (d.observacao && String(d.observacao).length > OBSERVACAO_MAX) {
      erros.observacao = 'A observação pode ter até ' + OBSERVACAO_MAX + ' caracteres.';
    }
    return { valido: Object.keys(erros).length === 0, erros: erros };
  }

  function podeTransicionar(de, para) {
    return (TRANSICOES[de] || []).indexOf(para) !== -1;
  }

  function transicionar(de, para) {
    if (!podeTransicionar(de, para)) {
      throw Erros.criar('TRANSICAO_INVALIDA', 'Não é possível mudar o atendimento de ' + de + ' para ' + para + '.');
    }
    return para;
  }

  /** Protocolo curto e legível para a usuária informar por telefone. Ex.: PS-20261106-4F2A */
  function gerarProtocolo(tipo, dataIso, sufixoAleatorio) {
    var prefixo = tipo === 'JURIDICO' ? 'JU' : 'PS';
    return prefixo + '-' + String(dataIso).replace(/-/g, '') + '-' + String(sufixoAleatorio).substring(0, 4).toUpperCase();
  }

  /** Perfis da equipe que podem ver cada tipo de atendimento. */
  function perfilPodeVer(perfil, tipo) {
    if (perfil === 'ADMIN') return true;
    if (perfil === 'EQUIPE_PSICOSSOCIAL') return tipo === 'PSICOSSOCIAL';
    if (perfil === 'EQUIPE_JURIDICA') return tipo === 'JURIDICO';
    return false;
  }

  return {
    TIPOS: TIPOS,
    PERIODOS: PERIODOS,
    MODALIDADES: MODALIDADES,
    STATUS: STATUS,
    parseData: parseData,
    validarSolicitacao: validarSolicitacao,
    podeTransicionar: podeTransicionar,
    transicionar: transicionar,
    gerarProtocolo: gerarProtocolo,
    perfilPodeVer: perfilPodeVer,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Agendamento: Agendamento };
