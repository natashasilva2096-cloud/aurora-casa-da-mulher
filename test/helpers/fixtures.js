/** Dados de teste reutilizáveis. Nenhum dado é real. */
let contador = 0;

function dadosUsuaria(extra = {}) {
  contador++;
  return {
    nome: 'Usuária Teste',
    email: `usuaria${contador}@exemplo.com`,
    telefone: '(71) 99999-0000',
    bairro: 'Brotas',
    senha: 'senhaSegura1',
    consentimentoLgpd: true,
    ...extra,
  };
}

/** Cria uma usuária e devolve { token, usuaria, sessao }. */
function criarUsuaria(ctx, extra) {
  const r = ctx.ServicoUsuaria.cadastrar(dadosUsuaria(extra));
  return { ...r, sessao: ctx.Sessao.exigir(r.token) };
}

function adicionarContatos(ctx, sessao, n) {
  const lista = [];
  for (let i = 1; i <= n; i++) {
    lista.push(ctx.ServicoContatos.salvar(sessao, { nome: 'Contato ' + 'abcdefghij'[i - 1], email: `contato${i}.${sessao.usuariaId.slice(0, 6)}@exemplo.com` }));
  }
  return lista;
}

// Pontos ao redor do centro de Salvador
const PONTOS = [
  { nome: 'DEAM Teste Perto', tipo: 'DEAM', endereco: 'Rua A, 1', lat: -12.972, lng: -38.502, validado: true, telefone: '(71) 3117-0000' },
  { nome: 'NUDEM Teste', tipo: 'NUDEM', endereco: 'Rua B, 2', lat: -12.99, lng: -38.49, validado: true },
  { nome: 'Casa Teste Longe', tipo: 'CASA_DA_MULHER', endereco: 'Rua C, 3', lat: -12.85, lng: -38.45, validado: true },
  { nome: 'Local Não Validado Pertíssimo', tipo: 'DEAM', endereco: 'Rua D, 4', lat: -12.9714, lng: -38.5014, validado: false },
];

function inserirPontos(ctx) {
  return PONTOS.map((p) => ctx.Repositorio.inserir('PontosSeguros', p));
}

const CENTRO = { lat: -12.9714, lng: -38.5014, precisao: 12 };

module.exports = { dadosUsuaria, criarUsuaria, adicionarContatos, inserirPontos, PONTOS, CENTRO };
