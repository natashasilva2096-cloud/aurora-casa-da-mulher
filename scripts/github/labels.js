/** Labels usadas pelos fluxos de qualidade. Criadas sob demanda (idempotente). */
const LABELS = {
  defeito: { color: 'd73a4a', description: 'Falha observada no software' },
  pipeline: { color: 'b60205', description: 'Falha detectada pelo pipeline de CI/CD' },
  rotina: { color: 'e99695', description: 'Falha detectada pela rotina diária de testes' },
  melhoria: { color: 'a2eeef', description: 'Nova funcionalidade ou melhoria' },
  manutencao: { color: 'c5def5', description: 'Manutenção preventiva/adaptativa' },
  'prioridade:critica': { color: 'b60205', description: 'GUT ≥ 80' },
  'prioridade:alta': { color: 'd93f0b', description: 'GUT 36–79' },
  'prioridade:media': { color: 'fbca04', description: 'GUT 12–35' },
  'prioridade:baixa': { color: '0e8a16', description: 'GUT < 12' },
  'ishikawa:metodo': { color: '5319e7', description: 'Causa: método/processo' },
  'ishikawa:maquina': { color: '5319e7', description: 'Causa: máquina/infraestrutura' },
  'ishikawa:material': { color: '5319e7', description: 'Causa: material/dados' },
  'ishikawa:mao-de-obra': { color: '5319e7', description: 'Causa: mão de obra/conhecimento' },
  'ishikawa:medicao': { color: '5319e7', description: 'Causa: medição/testes' },
  'ishikawa:meio-ambiente': { color: '5319e7', description: 'Causa: meio ambiente/integrações externas' },
};

async function garantirLabels(github, owner, repo, nomes) {
  for (const nome of nomes) {
    const conf = LABELS[nome] || { color: 'ededed', description: '' };
    try {
      await github.rest.issues.getLabel({ owner, repo, name: nome });
    } catch (e) {
      if (e.status !== 404) throw e;
      await github.rest.issues.createLabel({ owner, repo, name: nome, color: conf.color, description: conf.description });
    }
  }
}

module.exports = { LABELS, garantirLabels };
