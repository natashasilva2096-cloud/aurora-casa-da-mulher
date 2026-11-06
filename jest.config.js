/**
 * Jest — dois projetos para refletir a estratégia de testes do A3:
 *  - unit: regras puras (Nível 1 — CT-U*)
 *  - integracao: serviços + fakes dos serviços do Google (Nível 2 — CT-INT*, CT-SIS*)
 */
const comum = {
  testEnvironment: 'node',
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/test/helpers/silenciarConsole.js'],
};

module.exports = {
  projects: [
    {
      ...comum,
      displayName: 'unit',
      testMatch: ['<rootDir>/apps/*/test/unit/**/*.test.js', '<rootDir>/shared/test/**/*.test.js', '<rootDir>/test/ferramentas/**/*.test.js'],
    },
    {
      ...comum,
      displayName: 'integracao',
      testMatch: ['<rootDir>/apps/*/test/integracao/**/*.test.js'],
    },
  ],
  collectCoverageFrom: [
    'shared/src/**/*.js',
    'apps/*/src/**/*.js',
    '!**/BuildInfo.js',
  ],
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  // Gate de cobertura: mede execução, não força dos testes (ver docs/plano-de-testes.md)
  coverageThreshold: {
    global: { statements: 80, branches: 70, functions: 80, lines: 80 },
    './apps/aurora/src/core/': { statements: 90, branches: 85, functions: 90, lines: 90 },
  },
};
