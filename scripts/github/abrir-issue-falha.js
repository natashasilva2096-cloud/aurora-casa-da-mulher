/**
 * Abre uma issue de defeito quando o pipeline/rotina falha na main — ou comenta
 * na issue já aberta, para não gerar duplicatas. O corpo traz o roteiro da
 * Análise de Causa Raiz (5 Porquês) e do plano de ação 5W2H para a equipe preencher.
 * Executado pelo actions/github-script.
 */
const { garantirLabels } = require('./labels');

function montarCorpo({ origem, runUrl, sha, ref, falhos }) {
  const lista = falhos.length
    ? falhos.map((f) => `- **${f.nome}**${f.passo ? ` — passo: \`${f.passo}\`` : ''}`).join('\n')
    : '- (não foi possível identificar o job)';
  return [
    `Falha detectada automaticamente pela **${origem === 'rotina' ? 'rotina diária de testes' : 'pipeline de CI/CD'}**.`,
    '',
    `- Execução: ${runUrl}`,
    `- Commit: \`${String(sha).substring(0, 7)}\` (${ref})`,
    '',
    '**Jobs com falha:**',
    lista,
    '',
    '### Onde foi encontrado',
    '',
    origem === 'rotina' ? 'Rotina diária (CI)' : 'Testes automatizados (CI)',
    '',
    '### Gravidade (G)',
    '',
    '_a definir na triagem (1 a 5)_',
    '',
    '### Urgência (U)',
    '',
    '_a definir na triagem (1 a 5)_',
    '',
    '### Tendência (T)',
    '',
    '_a definir na triagem (1 a 5)_',
    '',
    '### Análise de causa raiz — 5 Porquês',
    '',
    '1. Por que falhou? (sintoma)',
    '2. Por quê? ',
    '3. Por quê? ',
    '4. Por quê? ',
    '5. Por quê? (causa raiz)',
    '',
    '### Plano de ação (5W2H)',
    '',
    '| O quê | Por quê | Onde | Quando | Quem | Como | Quanto |',
    '|---|---|---|---|---|---|---|',
    '|  |  |  |  |  |  |  |',
    '',
    '### Fluxo de correção',
    '',
    '- [ ] Reproduzir localmente (`npm test`)',
    '- [ ] Escrever o teste que falha (teste de confirmação)',
    '- [ ] Corrigir em uma branch `fix/...` e abrir PR referenciando esta issue',
    '- [ ] Pipeline verde (regressão) e smoke em staging',
    '- [ ] Avaliar efetividade da ação (PDCA — Check/Act)',
  ].join('\n');
}

async function abrirIssueFalha({ github, context, core, origem }) {
  const { owner, repo } = context.repo;
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { owner, repo, run_id: context.runId, per_page: 100 });
  const falhos = jobs
    .filter((j) => j.conclusion === 'failure')
    .map((j) => ({ nome: j.name, passo: ((j.steps || []).find((s) => s.conclusion === 'failure') || {}).name }));

  await garantirLabels(github, owner, repo, ['defeito', origem]);
  const abertas = await github.rest.issues.listForRepo({ owner, repo, state: 'open', labels: `defeito,${origem}`, per_page: 5 });

  if (abertas.data.length) {
    const n = abertas.data[0].number;
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: n,
      body: `Nova falha (${String(context.sha).substring(0, 7)}): ${runUrl}\n\n${falhos.map((f) => `- ${f.nome}${f.passo ? ` — ${f.passo}` : ''}`).join('\n')}`,
    });
    core.notice(`Falha registrada como comentário na issue #${n}`);
    return n;
  }

  const titulo = `${origem === 'rotina' ? 'Rotina diária' : 'Pipeline'} falhou: ${falhos.map((f) => f.nome).join(', ') || 'ver execução'}`;
  const r = await github.rest.issues.create({
    owner,
    repo,
    title: titulo.substring(0, 200),
    labels: ['defeito', origem],
    body: montarCorpo({ origem, runUrl, sha: context.sha, ref: context.ref, falhos }),
  });
  core.notice(`Issue de defeito #${r.data.number} aberta`);
  return r.data.number;
}

module.exports = abrirIssueFalha;
module.exports.montarCorpo = montarCorpo;
