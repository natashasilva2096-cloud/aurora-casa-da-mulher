/**
 * A configuração do CI/CD também é verificada: YAML válido, gates na ordem
 * certa, aprovação manual em produção e formulário compatível com a triagem.
 */
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const triagem = require('../../scripts/github/triagem-gut');

const RAIZ = path.resolve(__dirname, '..', '..');
const ler = (rel) => YAML.parse(fs.readFileSync(path.join(RAIZ, rel), 'utf8'));

describe('workflows', () => {
  const arquivos = fs.readdirSync(path.join(RAIZ, '.github/workflows'));

  test.each(arquivos)('%s é YAML válido e tem jobs', (arq) => {
    const wf = ler('.github/workflows/' + arq);
    expect(wf.name).toBeTruthy();
    expect(Object.keys(wf.jobs).length).toBeGreaterThan(0);
  });

  test('pipeline: staging depende da qualidade, produção depende do staging e exige o environment "producao"', () => {
    const wf = ler('.github/workflows/pipeline.yml');
    expect(wf.jobs.staging.needs).toBe('qualidade');
    expect(wf.jobs.producao.needs).toBe('staging');
    expect(wf.jobs.producao.environment.name).toBe('producao');
    expect(wf.jobs['registrar-falha'].if).toContain('failure()');
  });

  test('pipeline: gates de qualidade na ordem lint → unitários → integração/cobertura → build', () => {
    const nomes = ler('.github/workflows/pipeline.yml').jobs.qualidade.steps.map((s) => s.name || '').filter((n) => n.startsWith('Gate'));
    expect(nomes.map((n) => n.split(' ')[1])).toEqual(['1', '2', '3', '4']);
  });

  test('nenhum workflow interpola texto do usuário direto no shell (injeção)', () => {
    arquivos.forEach((arq) => {
      const wf = ler('.github/workflows/' + arq);
      Object.values(wf.jobs).forEach((job) =>
        (job.steps || []).forEach((s) => {
          if (s.run) expect(s.run).not.toMatch(/\$\{\{\s*github\.event\.(head_commit|issue|pull_request|comment)/);
        })
      );
    });
  });

  test('rotina diária tem agendamento e disparo manual', () => {
    const wf = ler('.github/workflows/rotina.yml');
    expect(wf.on.schedule[0].cron).toBeTruthy();
    expect(wf.on).toHaveProperty('workflow_dispatch');
  });
});

describe('formulário de defeito × triagem automática', () => {
  const form = ler('.github/ISSUE_TEMPLATE/defeito.yml');
  const campo = (id) => form.body.find((b) => b.id === id);

  test('títulos que a triagem lê existem no formulário', () => {
    ['Gravidade', 'Urgência', 'Tendência', 'Categoria da causa', 'Requisito afetado', 'Onde foi encontrado'].forEach((t) => {
      expect(form.body.some((b) => b.attributes && b.attributes.label && b.attributes.label.startsWith(t))).toBe(true);
    });
  });

  test('toda opção de G, U e T começa com nota de 1 a 5', () => {
    ['gravidade', 'urgencia', 'tendencia'].forEach((id) => {
      expect(campo(id).attributes.options.map((o) => parseInt(o, 10))).toEqual([1, 2, 3, 4, 5]);
    });
  });

  test('toda categoria do Ishikawa no formulário vira uma label conhecida', () => {
    campo('ishikawa').attributes.options.forEach((o) => {
      expect(triagem.categoriaIshikawa('### Categoria da causa (Ishikawa)\n\n' + o)).toMatch(/^ishikawa:/);
    });
  });

  test('a opção "Produção" existe para medir a taxa de escape', () => {
    expect(campo('onde').attributes.options).toContain('Produção');
  });
});
