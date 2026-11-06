#!/usr/bin/env node
/**
 * Gera o resumo de métricas de qualidade do pipeline (Markdown para o
 * $GITHUB_STEP_SUMMARY): taxa de aprovação, tempo da suíte, cobertura e
 * testes por nível. Lê jest-resultado.json e coverage/coverage-summary.json.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const ler = (rel) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RAIZ, rel), 'utf8'));
  } catch {
    return null;
  }
};

const resultado = ler('jest-resultado.json');
const cobertura = ler('coverage/coverage-summary.json');
const linhas = ['## Métricas de qualidade', ''];

if (resultado) {
  const total = resultado.numTotalTests;
  const ok = resultado.numPassedTests;
  const duracaoMs = Math.max(...resultado.testResults.map((r) => r.endTime)) - resultado.startTime;
  const porNivel = {};
  resultado.testResults.forEach((r) => {
    const nivel = /\/test\/integracao\//.test(r.name) ? 'Integração / sistema (Níveis 2–3)' : 'Unidade (Nível 1)';
    porNivel[nivel] = porNivel[nivel] || { total: 0, falhas: 0 };
    porNivel[nivel].total += r.assertionResults.length;
    porNivel[nivel].falhas += r.assertionResults.filter((a) => a.status === 'failed').length;
  });

  linhas.push('| Métrica | Valor | Para que serve |', '|---|---|---|');
  linhas.push(`| Taxa de aprovação | ${((ok / total) * 100).toFixed(1)}% (${ok}/${total}) | Estabilidade da suíte |`);
  linhas.push(`| Falhas | ${resultado.numFailedTests} | Bloqueia o merge se > 0 |`);
  linhas.push(`| Tempo da suíte | ${(duracaoMs / 1000).toFixed(1)} s | Tempo de feedback (meta: < 10 min de pipeline) |`);
  linhas.push('', '| Nível | Testes | Falhas |', '|---|---|---|');
  Object.keys(porNivel)
    .sort()
    .forEach((n) => linhas.push(`| ${n} | ${porNivel[n].total} | ${porNivel[n].falhas} |`));
}

if (cobertura) {
  const t = cobertura.total;
  linhas.push('', '| Cobertura | % |', '|---|---|');
  ['statements', 'branches', 'functions', 'lines'].forEach((k) => linhas.push(`| ${k} | ${t[k].pct}% |`));
  linhas.push('', '_Cobertura mede execução, não a força dos testes: os fluxos críticos (RF03/RF04) têm asserts de comportamento e cenários de falha da FMECA._');
}

if (!resultado && !cobertura) linhas.push('_Sem resultados de teste para resumir._');
console.log(linhas.join('\n'));
