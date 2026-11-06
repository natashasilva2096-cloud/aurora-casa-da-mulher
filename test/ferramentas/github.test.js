/**
 * As ferramentas de manutenção (triagem GUT, Pareto, issue automática) também
 * são código: testamos a lógica e a integração com uma API do GitHub simulada.
 */
const triagem = require('../../scripts/github/triagem-gut');
const relatorio = require('../../scripts/github/relatorio-defeitos');
const abrirIssueFalha = require('../../scripts/github/abrir-issue-falha');

const corpoFormulario = ({ g = '4 — Grave', u = '3 — O mais rápido possível', t = '3 — Vai piorar a médio prazo', cat = 'Medição — testes/monitoramento', req = 'RF03 — Botão de pânico', onde = 'Produção' } = {}) =>
  [
    '### Descrição', '', 'Alerta não chegou', '',
    '### Requisito afetado', '', req, '',
    '### Onde foi encontrado', '', onde, '',
    '### Gravidade (G)', '', g, '',
    '### Urgência (U)', '', u, '',
    '### Tendência (T)', '', t, '',
    '### Categoria da causa (Ishikawa)', '', cat, '',
  ].join('\n');

function githubFalso({ labelsExistentes = [], abertas = [], jobs = [], comentarios = [] } = {}) {
  const chamadas = [];
  const reg = (nome, ret) => async (args) => {
    chamadas.push({ nome, args });
    return typeof ret === 'function' ? ret(args) : ret;
  };
  const gh = {
    chamadas,
    paginate: async (fn, args) => (await fn(args)).data,
    rest: {
      issues: {
        getLabel: reg('getLabel', ({ name }) => {
          if (!labelsExistentes.includes(name)) throw Object.assign(new Error('Not Found'), { status: 404 });
          return { data: { name } };
        }),
        createLabel: reg('createLabel', { data: {} }),
        addLabels: reg('addLabels', { data: {} }),
        removeLabel: reg('removeLabel', { data: {} }),
        listComments: reg('listComments', { data: comentarios }),
        createComment: reg('createComment', { data: {} }),
        updateComment: reg('updateComment', { data: {} }),
        listForRepo: reg('listForRepo', { data: abertas }),
        create: reg('create', { data: { number: 42 } }),
      },
      actions: { listJobsForWorkflowRun: reg('listJobs', { data: jobs }) },
    },
  };
  return gh;
}

const core = { notice: jest.fn(), info: jest.fn(), summary: { addRaw: jest.fn().mockReturnThis(), write: jest.fn() } };
const contexto = (extra = {}) => ({ repo: { owner: 'org', repo: 'aurora' }, serverUrl: 'https://github.com', runId: 99, sha: 'abcdef1234', ref: 'refs/heads/main', ...extra });

describe('Matriz GUT', () => {
  test('extrai as notas do corpo do formulário e calcula G × U × T', () => {
    expect(triagem.calcularGUT(corpoFormulario())).toEqual({ g: 4, u: 3, t: 3, score: 36, prioridade: 'prioridade:alta' });
  });

  test.each([
    [125, 'prioridade:critica'], [80, 'prioridade:critica'], [79, 'prioridade:alta'], [36, 'prioridade:alta'],
    [35, 'prioridade:media'], [12, 'prioridade:media'], [11, 'prioridade:baixa'], [1, 'prioridade:baixa'],
  ])('valor-limite: GUT %i -> %s', (score, p) => {
    expect(triagem.classificar(score)).toBe(p);
  });

  test('GUT incompleto ou fora de 1..5 não gera prioridade', () => {
    expect(triagem.calcularGUT(corpoFormulario({ t: '_No response_' }))).toBeNull();
    expect(triagem.calcularGUT(corpoFormulario({ g: '9' }))).toBeNull();
    expect(triagem.calcularGUT(null)).toBeNull();
  });

  test('categoria do Ishikawa vira label', () => {
    expect(triagem.categoriaIshikawa(corpoFormulario())).toBe('ishikawa:medicao');
    expect(triagem.categoriaIshikawa(corpoFormulario({ cat: 'Mão de obra — conhecimento' }))).toBe('ishikawa:mao-de-obra');
    expect(triagem.categoriaIshikawa(corpoFormulario({ cat: 'Outra coisa' }))).toBeNull();
  });

  test('aplica labels, remove prioridade antiga e cria/atualiza um único comentário', async () => {
    const gh = githubFalso({ labelsExistentes: ['prioridade:alta'] });
    const issue = { number: 7, body: corpoFormulario(), labels: [{ name: 'defeito' }, { name: 'prioridade:baixa' }] };
    await triagem({ github: gh, context: { ...contexto(), payload: { issue } }, core });
    const nomes = gh.chamadas.map((c) => c.nome);
    expect(gh.chamadas.find((c) => c.nome === 'removeLabel').args.name).toBe('prioridade:baixa');
    expect(gh.chamadas.find((c) => c.nome === 'addLabels').args.labels).toEqual(['prioridade:alta', 'ishikawa:medicao']);
    expect(gh.chamadas.filter((c) => c.nome === 'createLabel').map((c) => c.args.name)).toEqual(['ishikawa:medicao']);
    expect(nomes).toContain('createComment');

    const gh2 = githubFalso({ comentarios: [{ id: 5, body: '<!-- triagem-gut -->\nantigo' }] });
    await triagem({ github: gh2, context: { ...contexto(), payload: { issue: { ...issue, labels: ['defeito', 'prioridade:alta', 'ishikawa:medicao'] } } }, core });
    expect(gh2.chamadas.map((c) => c.nome)).toEqual(['listComments', 'updateComment']);
  });

  test('sem GUT preenchido, só registra informação', async () => {
    const gh = githubFalso();
    await triagem({ github: gh, context: { ...contexto(), payload: { issue: { number: 1, body: 'texto livre', labels: [] } } }, core });
    expect(gh.chamadas).toHaveLength(0);
  });
});

describe('Pareto e métricas de defeitos', () => {
  test('pareto ordena por frequência e acumula percentuais', () => {
    expect(relatorio.pareto({ a: 1, b: 6, c: 3 })).toEqual([
      { item: 'b', qtd: 6, pct: 60, acumulado: 60 },
      { item: 'c', qtd: 3, pct: 30, acumulado: 90 },
      { item: 'a', qtd: 1, pct: 10, acumulado: 100 },
    ]);
    expect(relatorio.pareto({})).toEqual([]);
  });

  test('analisa categorias, requisitos, escape para produção e MTTR (ignora PRs)', () => {
    const issues = [
      { body: corpoFormulario(), labels: ['defeito', 'ishikawa:medicao'], created_at: '2026-11-01T00:00:00Z', closed_at: '2026-11-01T10:00:00Z' },
      { body: corpoFormulario({ onde: 'Staging', req: 'RF05 — Rotas' }), labels: [{ name: 'ishikawa:medicao' }], created_at: '2026-11-01T00:00:00Z', closed_at: '2026-11-01T20:00:00Z' },
      { body: corpoFormulario({ onde: 'Testes automatizados (CI)' }), labels: [], created_at: '2026-11-02T00:00:00Z', closed_at: null },
      { body: '', labels: [], pull_request: {}, created_at: '2026-11-02T00:00:00Z' },
    ];
    const a = relatorio.analisar(issues);
    expect(a.total).toBe(3);
    expect(a.abertos).toBe(1);
    expect(a.taxaEscape).toBeCloseTo(33.3, 1);
    expect(a.mttrHoras).toBe(15);
    expect(a.porCategoria[0]).toEqual(expect.objectContaining({ item: 'medicao', qtd: 2 }));
    expect(a.porRequisito.map((r) => r.item)).toEqual(['RF03', 'RF05']);
    const md = relatorio.markdown(a);
    expect(md).toContain('33.3%');
    expect(md).toContain('| medicao ⬅ | 2 |');
  });

  test('sem defeitos', () => {
    const a = relatorio.analisar([]);
    expect(relatorio.markdown(a)).toContain('MTTR): **—**');
  });

  test('relatório publica no resumo da execução', async () => {
    const gh = githubFalso({ abertas: [] });
    await relatorio({ github: gh, context: contexto(), core });
    expect(core.summary.write).toHaveBeenCalled();
  });
});

describe('issue automática de falha', () => {
  const jobs = [
    { name: 'Qualidade', conclusion: 'failure', steps: [{ name: 'Gate 3', conclusion: 'failure' }] },
    { name: 'Staging · aurora', conclusion: 'skipped', steps: [] },
  ];

  test('abre issue com jobs que falharam, roteiro de 5 Porquês e 5W2H', async () => {
    const gh = githubFalso({ jobs });
    const n = await abrirIssueFalha({ github: gh, context: contexto(), core, origem: 'pipeline' });
    expect(n).toBe(42);
    const criada = gh.chamadas.find((c) => c.nome === 'create').args;
    expect(criada.title).toBe('Pipeline falhou: Qualidade');
    expect(criada.labels).toEqual(['defeito', 'pipeline']);
    expect(criada.body).toContain('passo: `Gate 3`');
    expect(criada.body).toContain('5 Porquês');
    expect(criada.body).toContain('5W2H');
    expect(criada.body).toContain('https://github.com/org/aurora/actions/runs/99');
    expect(gh.chamadas.filter((c) => c.nome === 'createLabel')).toHaveLength(2);
  });

  test('se já existe issue aberta da mesma origem, apenas comenta (sem duplicar)', async () => {
    const gh = githubFalso({ jobs, abertas: [{ number: 10 }], labelsExistentes: ['defeito', 'rotina'] });
    expect(await abrirIssueFalha({ github: gh, context: contexto(), core, origem: 'rotina' })).toBe(10);
    expect(gh.chamadas.map((c) => c.nome)).not.toContain('create');
    expect(gh.chamadas.find((c) => c.nome === 'createComment').args.body).toContain('abcdef1');
  });

  test('corpo funciona mesmo sem jobs identificados', () => {
    expect(abrirIssueFalha.montarCorpo({ origem: 'rotina', runUrl: 'u', sha: 'x', ref: 'r', falhos: [] })).toContain('não foi possível identificar');
  });

  test('o corpo gerado é compatível com a triagem GUT (mesmos títulos do formulário)', () => {
    const corpo = abrirIssueFalha.montarCorpo({ origem: 'pipeline', runUrl: 'u', sha: 'x', ref: 'r', falhos: [] })
      .replace('_a definir na triagem (1 a 5)_', '5')
      .replace('_a definir na triagem (1 a 5)_', '5')
      .replace('_a definir na triagem (1 a 5)_', '4');
    expect(triagem.calcularGUT(corpo)).toEqual(expect.objectContaining({ score: 100, prioridade: 'prioridade:critica' }));
  });
});
