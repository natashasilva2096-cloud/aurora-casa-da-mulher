/**
 * Triagem pela Matriz GUT. Lê as respostas do formulário de defeito
 * (.github/ISSUE_TEMPLATE/defeito.yml), calcula G × U × T e aplica labels.
 *
 *   GUT ≥ 80  -> prioridade:critica   (ex.: 5 × 4 × 4)
 *   36 a 79   -> prioridade:alta      (ex.: 4 × 3 × 3)
 *   12 a 35   -> prioridade:media     (ex.: 3 × 2 × 2)
 *   < 12      -> prioridade:baixa
 */
const { garantirLabels } = require('./labels');

const MARCADOR = '<!-- triagem-gut -->';

const ISHIKAWA = {
  'Método': 'ishikawa:metodo',
  'Máquina': 'ishikawa:maquina',
  'Material': 'ishikawa:material',
  'Mão de obra': 'ishikawa:mao-de-obra',
  'Medição': 'ishikawa:medicao',
  'Meio ambiente': 'ishikawa:meio-ambiente',
};

function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Valor de uma seção "### Título" do corpo gerado pelo formulário. */
function extrairCampo(corpo, titulo) {
  const re = new RegExp('^###\\s*' + escaparRegex(titulo) + '[^\\n]*\\n+([^\\n]+)', 'm');
  const m = re.exec(corpo || '');
  if (!m) return null;
  const v = m[1].trim();
  return v === '_No response_' || v.startsWith('###') ? null : v;
}

function nota(corpo, titulo) {
  const v = extrairCampo(corpo, titulo);
  const n = v ? parseInt(v, 10) : NaN;
  return n >= 1 && n <= 5 ? n : null;
}

function classificar(score) {
  if (score >= 80) return 'prioridade:critica';
  if (score >= 36) return 'prioridade:alta';
  if (score >= 12) return 'prioridade:media';
  return 'prioridade:baixa';
}

function calcularGUT(corpo) {
  const g = nota(corpo, 'Gravidade');
  const u = nota(corpo, 'Urgência');
  const t = nota(corpo, 'Tendência');
  if (!g || !u || !t) return null;
  const score = g * u * t;
  return { g, u, t, score, prioridade: classificar(score) };
}

function categoriaIshikawa(corpo) {
  const v = extrairCampo(corpo, 'Categoria da causa');
  if (!v) return null;
  const chave = Object.keys(ISHIKAWA).find((k) => v.startsWith(k));
  return chave ? ISHIKAWA[chave] : null;
}

async function triagem({ github, context, core }) {
  const { owner, repo } = context.repo;
  const issue = context.payload.issue;
  const gut = calcularGUT(issue.body);
  const categoria = categoriaIshikawa(issue.body);
  const atuais = issue.labels.map((l) => (typeof l === 'string' ? l : l.name));

  const remover = atuais.filter(
    (l) => (gut && l.startsWith('prioridade:') && l !== gut.prioridade) || (categoria && l.startsWith('ishikawa:') && l !== categoria)
  );
  for (const nome of remover) {
    await github.rest.issues.removeLabel({ owner, repo, issue_number: issue.number, name: nome }).catch(() => {});
  }
  const adicionar = [gut && gut.prioridade, categoria].filter((l) => l && !atuais.includes(l));
  if (adicionar.length) {
    await garantirLabels(github, owner, repo, adicionar);
    await github.rest.issues.addLabels({ owner, repo, issue_number: issue.number, labels: adicionar });
  }

  if (gut) {
    const corpo = `${MARCADOR}\n**Triagem GUT:** G${gut.g} × U${gut.u} × T${gut.t} = **${gut.score}** → \`${gut.prioridade}\``;
    const comentarios = await github.rest.issues.listComments({ owner, repo, issue_number: issue.number, per_page: 100 });
    const anterior = comentarios.data.find((c) => (c.body || '').startsWith(MARCADOR));
    if (anterior) await github.rest.issues.updateComment({ owner, repo, comment_id: anterior.id, body: corpo });
    else await github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body: corpo });
  } else {
    core.info('GUT ainda não preenchido — sem prioridade.');
  }
}

module.exports = triagem;
Object.assign(module.exports, { extrairCampo, nota, classificar, calcularGUT, categoriaIshikawa, ISHIKAWA });
