/**
 * Ponto de entrada do web app Aurora.
 *
 *   /exec                          -> aplicativo (ui/Index)
 *   /exec?page=rastreio&t=<token>  -> acompanhamento para contatos de confiança
 *   /exec?action=health            -> verificação de saúde em JSON (smoke test do CI/CD)
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'health') {
    return ContentService.createTextOutput(JSON.stringify(saude())).setMimeType(ContentService.MimeType.JSON);
  }
  if (p.page === 'rastreio') {
    var tr = HtmlService.createTemplateFromFile('ui/Rastreio');
    tr.token = String(p.t || '').replace(/[^a-fA-F0-9]/g, '').substring(0, 64);
    return finalizarPagina_(tr.evaluate(), 'Aurora — acompanhamento');
  }
  var t = HtmlService.createTemplateFromFile('ui/Index');
  t.ambiente = Ambiente.nome();
  return finalizarPagina_(t.evaluate(), 'Aurora');
}

function finalizarPagina_(saida, titulo) {
  return saida
    .setTitle(titulo)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Usado nos templates: <?!= include('ui/Estilos') ?> */
function include(nome) {
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}

function infoBuild_() {
  return typeof BuildInfo !== 'undefined' ? BuildInfo : { commit: 'local', data: '' };
}

/**
 * Verificação de saúde (sem dados pessoais). O pipeline confere `ok` e `commit`
 * para confirmar que a versão certa foi publicada (teste de confirmação).
 */
function saude() {
  var build = infoBuild_();
  var r = {
    app: Config.APP,
    versao: Config.VERSAO,
    commit: build.commit,
    ambiente: Ambiente.nome(),
    timestamp: new Date().toISOString(),
    ok: true,
    checks: {},
    avisos: [],
  };
  try {
    r.checks.nucleo = Validacao.validarEmail('teste@exemplo.com') && Math.round(Geo.distanciaKm({ lat: -12.97, lng: -38.5 }, { lat: -12.98, lng: -38.5 })) === 1;
    if (!r.checks.nucleo) r.ok = false;
  } catch (e) {
    r.checks.nucleo = false;
    r.ok = false;
  }
  try {
    var ss = Ambiente.planilha();
    r.checks.planilha = true;
    var faltando = Object.keys(Config.ESQUEMA).filter(function (aba) {
      return !ss.getSheetByName(aba);
    });
    r.checks.abas = faltando.length === 0;
    if (!r.checks.abas) {
      r.ok = false;
      r.avisos.push('Abas ausentes: ' + faltando.join(', '));
    } else {
      r.checks.pontosSeguros = ServicoPontos.listarValidados().length;
      if (r.checks.pontosSeguros === 0) {
        r.ok = false;
        r.avisos.push('Nenhum ponto seguro validado');
      }
    }
  } catch (e) {
    r.checks.planilha = false;
    r.ok = false;
    r.avisos.push('Planilha indisponível — execute setup()');
  }
  var cota = EmailGateway.cotaRestante();
  r.checks.cotaEmail = cota;
  if (cota === 0) r.avisos.push('Cota diária de e-mail esgotada: alertas não serão entregues');
  return r;
}

/**
 * Configuração inicial do ambiente. Execute UMA vez pelo editor do Apps Script
 * (Executar > setup) em cada projeto (staging e produção). É idempotente.
 */
function setup() {
  if (!Ambiente.prop('SPREADSHEET_ID', null)) {
    var ss = SpreadsheetApp.create('Aurora — dados (' + Ambiente.nome() + ')');
    Ambiente.definirProp('SPREADSHEET_ID', ss.getId());
    Ambiente.limparCache();
  }
  Repositorio.garantirAbas();
  var planilha = Ambiente.planilha();
  ['Sheet1', 'Página1', 'Planilha1'].forEach(function (n) {
    var sh = planilha.getSheetByName(n);
    if (sh && planilha.getSheets().length > 1) planilha.deleteSheet(sh);
  });
  var pontos = ServicoPontos.carregarIniciais();
  instalarGatilhos();
  var r = { planilha: planilha.getUrl(), pontosInseridos: pontos, saude: saude() };
  Log.info('SETUP_CONCLUIDO', { pontos: pontos });
  console.log(JSON.stringify(r, null, 2));
  return r;
}

function instalarGatilhos() {
  ScriptApp.getProjectTriggers().forEach(function (g) {
    if (g.getHandlerFunction() === 'rotinaManutencao') ScriptApp.deleteTrigger(g);
  });
  ScriptApp.newTrigger('rotinaManutencao').timeBased().everyHours(1).create();
}

/**
 * Rotina de manutenção preventiva (gatilho de hora em hora):
 *  - expira alertas ativos além da validade (link de rastreio deixa de mostrar posição);
 *  - apaga histórico de localização e logs além do prazo de retenção (LGPD — minimização).
 */
function rotinaManutencao() {
  var agora = Ambiente.agora();
  var expirados = 0;
  Repositorio.listar('Acionamentos', function (a) {
    return Alerta.estaExpirado(a, agora, Config.VALIDADE_ALERTA_HORAS);
  }).forEach(function (a) {
    Repositorio.atualizar('Acionamentos', a.id, { status: Alerta.transicionar(a.status, Alerta.EVENTOS.EXPIRAR), fim: agora.toISOString() });
    expirados++;
  });

  var limiteLocal = new Date(agora.getTime() - Config.RETENCAO_LOCALIZACAO_DIAS * 86400000).toISOString();
  var localizacoes = Repositorio.removerOnde('Localizacoes', function (l) {
    return l.registradoEm && l.registradoEm < limiteLocal;
  });
  Repositorio.listar('Acionamentos', function (a) {
    return a.status !== Alerta.STATUS.ATIVO && a.fim && a.fim < limiteLocal && a.lat !== null;
  }).forEach(function (a) {
    Repositorio.atualizar('Acionamentos', a.id, { lat: null, lng: null, precisao: null });
  });

  var limiteLogs = new Date(agora.getTime() - Config.RETENCAO_LOGS_DIAS * 86400000).toISOString();
  var logs = Repositorio.removerOnde('Logs', function (l) {
    return l.dataHora && l.dataHora < limiteLogs;
  });

  var r = { expirados: expirados, localizacoesRemovidas: localizacoes, logsRemovidos: logs };
  if (expirados || localizacoes || logs) Log.info('ROTINA_MANUTENCAO', r);
  return r;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    doGet: doGet,
    include: include,
    saude: saude,
    setup: setup,
    instalarGatilhos: instalarGatilhos,
    rotinaManutencao: rotinaManutencao,
  };
}
