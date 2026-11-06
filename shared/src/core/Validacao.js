/**
 * Validações de formato de dados (RF01, RF02) — CT-U01.
 * Funções puras: não dependem de nenhum serviço do Google.
 */
var Validacao = (function () {
  // DDDs válidos no Brasil (Anatel)
  var DDDS = [
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99,
  ];

  var SENHA_MIN = 8;
  var SENHA_MAX = 64;
  var NOME_MIN = 2;
  var NOME_MAX = 100;
  var EMAIL_MAX = 254;

  function texto(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  function validarEmail(email) {
    var e = texto(email).toLowerCase();
    if (!e || e.length > EMAIL_MAX) return false;
    // local@dominio.tld — sem espaços, um único @, TLD com 2+ letras
    return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e) && e.indexOf('..') === -1;
  }

  function normalizarEmail(email) {
    return texto(email).toLowerCase();
  }

  /** Remove tudo que não é dígito e o código do país (55), se houver. */
  function normalizarTelefone(tel) {
    var d = texto(tel).replace(/\D/g, '');
    if ((d.length === 12 || d.length === 13) && d.indexOf('55') === 0) d = d.substring(2);
    if ((d.length === 11 || d.length === 12) && d.charAt(0) === '0') d = d.substring(1);
    return d;
  }

  /**
   * Telefone brasileiro com DDD válido.
   * Celular: DDD + 9 + 8 dígitos (11 dígitos). Fixo: DDD + [2-5] + 7 dígitos (10 dígitos).
   */
  function validarTelefone(tel) {
    var d = normalizarTelefone(tel);
    if (d.length !== 10 && d.length !== 11) return false;
    var ddd = parseInt(d.substring(0, 2), 10);
    if (DDDS.indexOf(ddd) === -1) return false;
    var numero = d.substring(2);
    if (numero.length === 9) return numero.charAt(0) === '9';
    return /^[2-5]/.test(numero);
  }

  function validarSenha(senha) {
    var s = senha === null || senha === undefined ? '' : String(senha);
    if (s.length < SENHA_MIN || s.length > SENHA_MAX) return false;
    return /[A-Za-zÀ-ÿ]/.test(s) && /\d/.test(s);
  }

  function validarNome(nome) {
    var n = texto(nome);
    if (n.length < NOME_MIN || n.length > NOME_MAX) return false;
    return /^[A-Za-zÀ-ÿ' -]+$/.test(n);
  }

  function limitarTexto(v, max) {
    var t = texto(v);
    return t.length > max ? t.substring(0, max) : t;
  }

  /** RF01 — Cadastro da usuária. */
  function validarCadastroUsuaria(dados) {
    var d = dados || {};
    var erros = {};
    if (!validarNome(d.nome)) erros.nome = 'Informe seu nome (apenas letras, de 2 a 100 caracteres).';
    if (!validarEmail(d.email)) erros.email = 'Informe um e-mail válido.';
    if (!validarTelefone(d.telefone)) erros.telefone = 'Informe um celular com DDD válido. Ex.: (71) 99999-9999.';
    if (!validarSenha(d.senha)) erros.senha = 'A senha deve ter de 8 a 64 caracteres, com letras e números.';
    if (d.consentimentoLgpd !== true) erros.consentimentoLgpd = 'É necessário aceitar o termo de uso e privacidade.';
    if (d.bairro && texto(d.bairro).length > 80) erros.bairro = 'Bairro muito longo.';
    return { valido: Object.keys(erros).length === 0, erros: erros };
  }

  /** RF02 — Contato de confiança. O alerta é enviado por e-mail, então o e-mail é obrigatório. */
  function validarContato(contato) {
    var c = contato || {};
    var erros = {};
    if (!validarNome(c.nome)) erros.nome = 'Informe o nome do contato.';
    if (!validarEmail(c.email)) erros.email = 'Informe um e-mail válido para o contato receber o alerta.';
    if (texto(c.telefone) && !validarTelefone(c.telefone)) erros.telefone = 'Telefone do contato inválido.';
    if (texto(c.relacao).length > 40) erros.relacao = 'Relação muito longa.';
    return { valido: Object.keys(erros).length === 0, erros: erros };
  }

  return {
    DDDS: DDDS,
    validarEmail: validarEmail,
    normalizarEmail: normalizarEmail,
    normalizarTelefone: normalizarTelefone,
    validarTelefone: validarTelefone,
    validarSenha: validarSenha,
    validarNome: validarNome,
    limitarTexto: limitarTexto,
    validarCadastroUsuaria: validarCadastroUsuaria,
    validarContato: validarContato,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Validacao: Validacao };
