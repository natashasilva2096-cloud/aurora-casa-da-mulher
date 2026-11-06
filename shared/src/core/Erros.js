/**
 * Erros de negócio padronizados.
 * Um erro de negócio tem `codigo` (estável, usado pela interface e pelos testes)
 * e `mensagem` (texto amigável em português, exibido à usuária).
 */
var Erros = (function () {
  var PREFIXO = 'AURORA_ERRO';

  function criar(codigo, mensagem, detalhes) {
    var e = new Error(mensagem || codigo);
    e.name = PREFIXO;
    e.codigo = codigo;
    e.mensagem = mensagem || codigo;
    if (detalhes) e.detalhes = detalhes;
    return e;
  }

  function ehDeNegocio(e) {
    return !!e && e.name === PREFIXO && typeof e.codigo === 'string';
  }

  return { criar: criar, ehDeNegocio: ehDeNegocio };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Erros: Erros };
