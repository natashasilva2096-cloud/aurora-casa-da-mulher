/**
 * Acesso ao ambiente do Apps Script (propriedades, planilha, relógio, utilitários).
 * Centralizar aqui facilita substituir por fakes nos testes de integração.
 */
var Ambiente = (function () {
  var planilhaCache_ = null;

  function props_() {
    return PropertiesService.getScriptProperties();
  }

  function prop(nome, padrao) {
    var v = props_().getProperty(nome);
    return v === null || v === undefined || v === '' ? padrao : v;
  }

  function definirProp(nome, valor) {
    props_().setProperty(nome, String(valor));
  }

  function planilha() {
    if (planilhaCache_) return planilhaCache_;
    var id = prop('SPREADSHEET_ID', null);
    if (!id) {
      throw Erros.criar('CONFIG_AUSENTE', 'O ambiente ainda não foi configurado. Execute a função setup() no editor do Apps Script.');
    }
    planilhaCache_ = SpreadsheetApp.openById(id);
    return planilhaCache_;
  }

  function limparCache() {
    planilhaCache_ = null;
  }

  function agora() {
    return new Date();
  }

  /** Nome do ambiente: desenvolvimento | staging | producao */
  function nome() {
    return prop('AMBIENTE', 'desenvolvimento');
  }

  /** URL pública do web app (APP_URL tem prioridade, pois cada ambiente tem um deployment fixo). */
  function urlApp() {
    var configurada = prop('APP_URL', '');
    if (configurada) return configurada;
    try {
      return ScriptApp.getService().getUrl() || '';
    } catch (e) {
      return '';
    }
  }

  function digestHex(texto) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(texto), Utilities.Charset.UTF_8);
    return Seguranca.bytesParaHex(bytes);
  }

  function uuid() {
    return Utilities.getUuid();
  }

  /** Token aleatório de 64 caracteres hex (dois UUID v4). */
  function tokenAleatorio() {
    return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  }

  return {
    prop: prop,
    definirProp: definirProp,
    planilha: planilha,
    limparCache: limparCache,
    agora: agora,
    nome: nome,
    urlApp: urlApp,
    digestHex: digestHex,
    uuid: uuid,
    tokenAleatorio: tokenAleatorio,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Ambiente: Ambiente };
