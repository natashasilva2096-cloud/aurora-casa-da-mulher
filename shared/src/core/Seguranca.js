/**
 * Segurança (RNF01) — CT-U02.
 * Hash de senha com salt + iterações de SHA-256. As funções recebem a função de
 * digest por parâmetro, para poderem ser testadas fora do Apps Script.
 *
 * Observação: em produção, o ideal é um KDF dedicado (PBKDF2/Argon2) em backend
 * próprio. O Apps Script não oferece um KDF nativo; esta é a melhor opção
 * disponível no protótipo e fica registrada como risco residual.
 */
var Seguranca = (function () {
  var ITERACOES_PADRAO = 200;

  /** Converte bytes (com sinal, como o Apps Script retorna) em hexadecimal. */
  function bytesParaHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
      hex += (b < 16 ? '0' : '') + b.toString(16);
    }
    return hex;
  }

  /**
   * @param {string} senha
   * @param {string} salt
   * @param {function(string): string} digestHex  função SHA-256 que retorna hex
   * @param {number=} iteracoes
   */
  function hashSenha(senha, salt, digestHex, iteracoes) {
    if (typeof digestHex !== 'function') throw new Error('digestHex obrigatório');
    if (!salt) throw new Error('salt obrigatório');
    var n = iteracoes || ITERACOES_PADRAO;
    var h = digestHex(salt + ':' + String(senha));
    for (var i = 1; i < n; i++) h = digestHex(salt + ':' + h);
    return 'sha256$' + n + '$' + h;
  }

  /** Comparação em tempo constante (evita ataque de temporização). */
  function compararSeguro(a, b) {
    var x = String(a);
    var y = String(b);
    var diff = x.length ^ y.length;
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
    }
    return diff === 0;
  }

  function verificarSenha(senha, salt, hashArmazenado, digestHex) {
    var partes = String(hashArmazenado || '').split('$');
    if (partes.length !== 3 || partes[0] !== 'sha256') return false;
    var iteracoes = parseInt(partes[1], 10);
    if (!(iteracoes > 0)) return false;
    return compararSeguro(hashSenha(senha, salt, digestHex, iteracoes), hashArmazenado);
  }

  /** Mascara e-mail para logs: ma***@gmail.com */
  function mascararEmail(email) {
    var e = String(email || '');
    var at = e.indexOf('@');
    if (at < 1) return '***';
    return e.substring(0, Math.min(2, at)) + '***' + e.substring(at);
  }

  return {
    ITERACOES_PADRAO: ITERACOES_PADRAO,
    bytesParaHex: bytesParaHex,
    hashSenha: hashSenha,
    verificarSenha: verificarSenha,
    compararSeguro: compararSeguro,
    mascararEmail: mascararEmail,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Seguranca: Seguranca };
