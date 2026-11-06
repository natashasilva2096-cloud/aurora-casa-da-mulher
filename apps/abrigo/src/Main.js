/**
 * Web app do Aurora Abrigo.
 *   /exec                 -> cadastro de anfitriã(o)
 *   /exec?action=health   -> verificação de saúde (smoke test do CI/CD)
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'health') {
    return ContentService.createTextOutput(JSON.stringify(saude())).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createTemplateFromFile('ui/Index')
    .evaluate()
    .setTitle('Aurora Abrigo — rede de acolhimento')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(nome) {
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}

function saude() {
  var build = typeof BuildInfo !== 'undefined' ? BuildInfo : { commit: 'local' };
  var r = { app: Config.APP, versao: Config.VERSAO, commit: build.commit, ambiente: Ambiente.nome(), timestamp: new Date().toISOString(), ok: true, checks: {}, avisos: [] };
  try {
    var ss = Ambiente.planilha();
    r.checks.planilha = true;
    r.checks.abas = Object.keys(Config.ESQUEMA).every(function (aba) {
      return !!ss.getSheetByName(aba);
    });
    if (!r.checks.abas) r.ok = false;
  } catch (e) {
    r.checks.planilha = false;
    r.ok = false;
    r.avisos.push('Planilha indisponível — execute setup()');
  }
  return r;
}

function setup() {
  if (!Ambiente.prop('SPREADSHEET_ID', null)) {
    var ss = SpreadsheetApp.create('Aurora Abrigo — dados (' + Ambiente.nome() + ')');
    Ambiente.definirProp('SPREADSHEET_ID', ss.getId());
    Ambiente.limparCache();
  }
  Repositorio.garantirAbas();
  var r = { planilha: Ambiente.planilha().getUrl(), saude: saude() };
  console.log(JSON.stringify(r, null, 2));
  return r;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { doGet: doGet, include: include, saude: saude, setup: setup };
