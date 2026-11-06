/**
 * Log de eventos técnicos (observabilidade — shift-right).
 * Regra: NUNCA registrar dados pessoais (nome, e-mail completo, coordenadas).
 * Use ids e Seguranca.mascararEmail quando precisar identificar algo.
 */
var Log = (function () {
  var NIVEIS = ['INFO', 'AVISO', 'ERRO'];

  function registrar(nivel, evento, detalhe) {
    var n = NIVEIS.indexOf(nivel) === -1 ? 'INFO' : nivel;
    var texto = detalhe === undefined ? '' : typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe);
    try {
      console.log('[' + n + '] ' + evento + ' ' + texto);
    } catch (e) {
      /* sem console disponível */
    }
    try {
      if (Config.ESQUEMA.Logs) {
        Repositorio.inserir('Logs', {
          dataHora: Ambiente.agora().toISOString(),
          nivel: n,
          evento: evento,
          detalhe: texto.substring(0, 500),
          ambiente: Ambiente.nome(),
        });
      }
    } catch (e) {
      // Log nunca pode derrubar o fluxo principal (RNF06)
    }
  }

  return {
    info: function (evento, detalhe) {
      registrar('INFO', evento, detalhe);
    },
    aviso: function (evento, detalhe) {
      registrar('AVISO', evento, detalhe);
    },
    erro: function (evento, detalhe) {
      registrar('ERRO', evento, detalhe);
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Log: Log };
