/**
 * Relatório de defeitos (Diagrama de Pareto 80/20) a partir das issues com label "defeito".
 *  - Pareto por categoria de causa (Ishikawa) e por requisito afetado
 *  - Taxa de defeitos escapados (encontrados em produção / total)
 *  - Tempo médio de correção (MTTR) das issues fechadas
 */
const { extrairCampo } = require('./triagem-gut');

/** @param {Object<string, number>} contagens  @return {{item, qtd, pct, acumulado}[]} */
function pareto(contagens) {
  const total = Object.values(contagens).reduce((a, b) => a + b, 0);
  let acumulado = 0;
  return Object.entries(contagens)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([item, qtd]) => {
      acumulado += qtd;
      return { item, qtd, pct: total ? (qtd / total) * 100 : 0, acumulado: total ? (acumulado / total) * 100 : 0 };
    });
}

function contar(lista, chave) {
  return lista.reduce((acc, x) => {
    const k = chave(x) || 'Não classificado';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function analisar(issues) {
  const defeitos = issues.filter((i) => !i.pull_request);
  const labels = (i) => i.labels.map((l) => (typeof l === 'string' ? l : l.name));
  const porCategoria = pareto(contar(defeitos, (i) => (labels(i).find((l) => l.startsWith('ishikawa:')) || '').replace('ishikawa:', '')));
  const porRequisito = pareto(contar(defeitos, (i) => {
    const v = extrairCampo(i.body, 'Requisito afetado');
    return v ? v.split(' ')[0] : null;
  }));
  const emProducao = defeitos.filter((i) => /Produção/i.test(extrairCampo(i.body, 'Onde foi encontrado') || '')).length;
  const fechadas = defeitos.filter((i) => i.closed_at);
  const mttrHoras = fechadas.length
    ? fechadas.reduce((s, i) => s + (new Date(i.closed_at) - new Date(i.created_at)), 0) / fechadas.length / 3600000
    : null;
  return {
    total: defeitos.length,
    abertos: defeitos.length - fechadas.length,
    taxaEscape: defeitos.length ? (emProducao / defeitos.length) * 100 : 0,
    mttrHoras,
    porCategoria,
    porRequisito,
  };
}

function tabela(titulo, linhas) {
  const out = [`### ${titulo}`, '', '| Item | Qtd | % | % acumulado |', '|---|---|---|---|'];
  linhas.forEach((l) => out.push(`| ${l.item}${l.acumulado <= 80 ? ' ⬅' : ''} | ${l.qtd} | ${l.pct.toFixed(1)}% | ${l.acumulado.toFixed(1)}% |`));
  return out.join('\n');
}

function markdown(a) {
  return [
    '## Relatório de defeitos',
    '',
    `- Total: **${a.total}** (abertos: ${a.abertos})`,
    `- Taxa de defeitos escapados para produção: **${a.taxaEscape.toFixed(1)}%**`,
    `- Tempo médio de correção (MTTR): **${a.mttrHoras === null ? '—' : a.mttrHoras.toFixed(1) + ' h'}**`,
    '',
    '⬅ = itens que concentram até 80% dos defeitos (priorizar ação)',
    '',
    tabela('Pareto por categoria de causa (Ishikawa)', a.porCategoria),
    '',
    tabela('Pareto por requisito afetado', a.porRequisito),
  ].join('\n');
}

async function relatorio({ github, context, core }) {
  const { owner, repo } = context.repo;
  const issues = await github.paginate(github.rest.issues.listForRepo, { owner, repo, labels: 'defeito', state: 'all', per_page: 100 });
  const md = markdown(analisar(issues));
  await core.summary.addRaw(md).write();
  core.info(md);
}

module.exports = relatorio;
Object.assign(module.exports, { pareto, analisar, markdown });
