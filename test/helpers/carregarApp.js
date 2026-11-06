/**
 * Carrega os arquivos .js de um app como o Apps Script faz: todos no mesmo
 * escopo global. Em Node, cada arquivo exporta seus nomes e este helper os
 * publica em `global`, reproduzindo o comportamento do Apps Script.
 */
const path = require('path');
const fs = require('fs');
const { criarFakes } = require('./gasFakes');

const RAIZ = path.resolve(__dirname, '..', '..');

const ARQUIVOS_SHARED = ['core/Erros', 'core/Validacao', 'core/Seguranca', 'infra/Ambiente', 'infra/Repositorio', 'infra/Log'];

const ARQUIVOS_APP = {
  aurora: {
    nucleo: ['core/Config', 'core/Geo', 'core/Alerta', 'core/Agendamento'],
    resto: [
      'infra/Sessao',
      'infra/EmailGateway',
      'infra/MapsGateway',
      'infra/DadosIniciais',
      'servicos/ServicoContatos',
      'servicos/ServicoPontos',
      'servicos/ServicoUsuaria',
      'servicos/ServicoAlerta',
      'servicos/ServicoAtendimento',
      'Api',
      'Main',
    ],
  },
  abrigo: {
    nucleo: ['core/Config', 'core/Anfitriao'],
    resto: ['servicos/ServicoAnfitriao', 'Api', 'Main'],
  },
};

function caminhoShared(rel) {
  return path.join(RAIZ, 'shared', 'src', rel + '.js');
}
function caminhoApp(app, rel) {
  return path.join(RAIZ, 'apps', app, 'src', rel + '.js');
}

function listarArquivos(app) {
  const a = ARQUIVOS_APP[app];
  return [
    ...ARQUIVOS_SHARED.map(caminhoShared),
    ...a.nucleo.map((r) => caminhoApp(app, r)),
    ...a.resto.map((r) => caminhoApp(app, r)),
  ];
}

function publicar(arquivos) {
  const ctx = {};
  arquivos.forEach((arq) => {
    const exp = require(arq);
    Object.assign(global, exp);
    Object.assign(ctx, exp);
  });
  return ctx;
}

/** Só regras puras (testes unitários): sem fakes, sem planilha. */
function carregarNucleo(app) {
  jest.resetModules();
  const a = ARQUIVOS_APP[app];
  return publicar([caminhoShared('core/Erros'), caminhoShared('core/Validacao'), caminhoShared('core/Seguranca'), ...a.nucleo.map((r) => caminhoApp(app, r))]);
}

/**
 * App completo com fakes do Google e um ambiente pronto (planilha criada e
 * propriedades definidas). Use `{ semSetup: true }` para começar "do zero".
 */
function carregarApp(app, opcoes = {}) {
  jest.resetModules();
  const { fakes, globais } = criarFakes();
  Object.assign(global, globais);
  const ctx = publicar(listarArquivos(app));
  if (!opcoes.semSetup) {
    const ss = globais.SpreadsheetApp.create('teste');
    fakes.props.set('SPREADSHEET_ID', ss.getId());
    fakes.props.set('AMBIENTE', 'teste');
    fakes.props.set('APP_URL', 'https://script.google.com/macros/s/TESTE/exec');
    ctx.Repositorio.garantirAbas();
  }
  ctx.fakes = fakes;
  ctx.planilha = () => globais.SpreadsheetApp.openById(fakes.props.get('SPREADSHEET_ID'));
  return ctx;
}

function lerFonte(relDaRaiz) {
  return fs.readFileSync(path.join(RAIZ, relDaRaiz), 'utf8');
}

module.exports = { carregarApp, carregarNucleo, listarArquivos, lerFonte, RAIZ, ARQUIVOS_APP, ARQUIVOS_SHARED };
