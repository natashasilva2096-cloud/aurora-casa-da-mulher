const js = require('@eslint/js');
const globals = require('globals');

// Serviços nativos do Google Apps Script usados no projeto
const gas = {
  SpreadsheetApp: 'readonly',
  PropertiesService: 'readonly',
  CacheService: 'readonly',
  LockService: 'readonly',
  MailApp: 'readonly',
  Maps: 'readonly',
  Utilities: 'readonly',
  HtmlService: 'readonly',
  ContentService: 'readonly',
  ScriptApp: 'readonly',
  Session: 'readonly',
  Logger: 'readonly',
};

// No Apps Script todos os arquivos compartilham o escopo global:
// cada namespace abaixo é definido em um arquivo e usado nos demais.
const namespaces = {
  BuildInfo: 'readonly',
  Erros: 'readonly',
  Validacao: 'readonly',
  Seguranca: 'readonly',
  Ambiente: 'readonly',
  Repositorio: 'readonly',
  Log: 'readonly',
  Config: 'readonly',
  Geo: 'readonly',
  Alerta: 'readonly',
  Agendamento: 'readonly',
  Sessao: 'readonly',
  DadosIniciais: 'readonly',
  EmailGateway: 'readonly',
  MapsGateway: 'readonly',
  ServicoUsuaria: 'readonly',
  ServicoContatos: 'readonly',
  ServicoAlerta: 'readonly',
  ServicoPontos: 'readonly',
  ServicoAtendimento: 'readonly',
  Anfitriao: 'readonly',
  Capacitacao: 'readonly',
  ServicoAnfitriao: 'readonly',
  Api: 'readonly',
};

module.exports = [
  { ignores: ['node_modules/', 'dist/', 'coverage/'] },
  js.configs.recommended,
  {
    files: ['shared/src/**/*.js', 'apps/*/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: { ...gas, ...namespaces, module: 'readonly', console: 'readonly' },
    },
    rules: {
      // funções globais (doGet, api_*) são chamadas pelo Apps Script / google.script.run
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'off',
      eqeqeq: ['error', 'always'],
      'no-var': 'off',
      'prefer-const': 'off',
    },
  },
  {
    files: ['**/test/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
  },
];
