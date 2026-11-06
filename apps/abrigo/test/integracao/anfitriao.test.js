/**
 * Aurora Abrigo — cadastro integrado à planilha e notificações.
 */
const { carregarApp } = require('../../../../test/helpers/carregarApp');

const dados = (extra = {}) => ({
  nome: 'Helena Teste',
  email: 'helena@exemplo.com',
  telefone: '(71) 98888-1111',
  bairro: 'Itapuã',
  endereco: 'Rua Exemplo, 100, apto 2',
  maxPessoas: 3,
  aceitaFilhos: true,
  maxFilhos: 2,
  duracaoMaxDias: 30,
  acessivel: true,
  consentimento: true,
  termoSigilo: true,
  ...extra,
});

let ctx;
beforeEach(() => {
  ctx = carregarApp('abrigo');
});

test('cadastra como PENDENTE, sem capacitação, com protocolo', () => {
  const r = ctx.api_cadastrarAnfitriao(dados());
  expect(r.ok).toBe(true);
  expect(r.dados).toEqual({ protocolo: expect.stringMatching(/^AB-\d{8}-[A-F0-9]{4}$/), status: 'PENDENTE' });
  const [linha] = ctx.planilha().linhas('Anfitrioes');
  expect(linha).toEqual(expect.objectContaining({ status: 'PENDENTE', capacitacaoConcluida: false, maxPessoas: 3, aceitaFilhos: true, telefone: '71988881111' }));
});

test('resposta do cadastro não devolve dados pessoais', () => {
  const r = ctx.api_cadastrarAnfitriao(dados());
  expect(Object.keys(r.dados).sort()).toEqual(['protocolo', 'status']);
});

test('dados inválidos', () => {
  const r = ctx.api_cadastrarAnfitriao(dados({ maxPessoas: 10 }));
  expect(r).toEqual(expect.objectContaining({ ok: false, codigo: 'DADOS_INVALIDOS', detalhes: expect.objectContaining({ maxPessoas: expect.any(String) }) }));
});

test('não duplica cadastro ativo do mesmo e-mail, mas permite novo após recusa', () => {
  ctx.api_cadastrarAnfitriao(dados());
  expect(ctx.api_cadastrarAnfitriao(dados({ email: 'HELENA@exemplo.com' })).codigo).toBe('JA_CADASTRADO');
  const [a] = ctx.Repositorio.listar('Anfitrioes');
  ctx.ServicoAnfitriao.atualizarStatus(a.id, 'EM_ANALISE');
  ctx.ServicoAnfitriao.atualizarStatus(a.id, 'RECUSADO');
  expect(ctx.api_cadastrarAnfitriao(dados()).ok).toBe(true);
});

test('quem não aceita filhos fica com maxFilhos = 0', () => {
  ctx.api_cadastrarAnfitriao(dados({ aceitaFilhos: false, maxFilhos: 4 }));
  expect(ctx.Repositorio.listar('Anfitrioes')[0].maxFilhos).toBe(0);
});

test('notifica a equipe sem endereço nem nome; falha de e-mail não bloqueia', () => {
  ctx.fakes.props.set('EMAIL_EQUIPE_ABRIGO', 'abrigo@casadamulher.exemplo');
  ctx.api_cadastrarAnfitriao(dados());
  const [m] = ctx.fakes.mail.enviados;
  expect(m.to).toBe('abrigo@casadamulher.exemplo');
  expect(m.body).not.toContain('Rua Exemplo');
  expect(m.body).not.toContain('Helena');

  ctx.fakes.mail.falharPara.add('abrigo@casadamulher.exemplo');
  expect(ctx.api_cadastrarAnfitriao(dados({ email: 'outra@exemplo.com' })).ok).toBe(true);
});

test('consulta de status exige protocolo + e-mail corretos', () => {
  const { protocolo } = ctx.api_cadastrarAnfitriao(dados()).dados;
  expect(ctx.api_consultarStatus(protocolo.toLowerCase(), ' Helena@Exemplo.com').dados).toEqual({ protocolo, status: 'PENDENTE', capacitacaoConcluida: false });
  expect(ctx.api_consultarStatus(protocolo, 'outra@exemplo.com').codigo).toBe('NAO_ENCONTRADO');
});

test('fluxo da equipe (fase 2): análise -> validação -> capacitação -> aparece na busca, sem endereço', () => {
  ctx.api_cadastrarAnfitriao(dados());
  const [a] = ctx.Repositorio.listar('Anfitrioes');
  expect(ctx.ServicoAnfitriao.buscarCompativeis({ filhos: 1, dias: 10 })).toHaveLength(0);

  ctx.ServicoAnfitriao.atualizarStatus(a.id, 'EM_ANALISE');
  ctx.ServicoAnfitriao.atualizarStatus(a.id, 'VALIDADO');
  expect(ctx.ServicoAnfitriao.buscarCompativeis({ filhos: 1, dias: 10 })).toHaveLength(0); // falta capacitação

  ctx.ServicoAnfitriao.registrarCapacitacao(a.id);
  const r = ctx.ServicoAnfitriao.buscarCompativeis({ filhos: 1, dias: 10 });
  expect(r).toHaveLength(1);
  expect(JSON.stringify(r)).not.toContain('Rua Exemplo');
  expect(() => ctx.ServicoAnfitriao.atualizarStatus(a.id, 'PENDENTE')).toThrow(expect.objectContaining({ codigo: 'TRANSICAO_INVALIDA' }));
  expect(() => ctx.ServicoAnfitriao.atualizarStatus('x', 'EM_ANALISE')).toThrow(expect.objectContaining({ codigo: 'NAO_ENCONTRADO' }));
  expect(() => ctx.ServicoAnfitriao.registrarCapacitacao('x')).toThrow(expect.objectContaining({ codigo: 'NAO_ENCONTRADO' }));
  expect(ctx.ServicoAnfitriao.buscarCompativeis()).toHaveLength(1);
});

test('info do programa', () => {
  expect(ctx.api_infoPrograma().dados.modulos.length).toBeGreaterThan(0);
});

test('erro inesperado é mascarado', () => {
  jest.spyOn(ctx.ServicoAnfitriao, 'cadastrar').mockImplementation(() => {
    throw new Error('boom');
  });
  expect(ctx.api_cadastrarAnfitriao(dados())).toEqual(expect.objectContaining({ ok: false, codigo: 'ERRO_INTERNO' }));
});

test('health, doGet, include e setup', () => {
  expect(JSON.parse(ctx.doGet({ parameter: { action: 'health' } }).getContent())).toEqual(expect.objectContaining({ app: 'abrigo', ok: true }));
  expect(ctx.doGet({}).titulo).toContain('Aurora Abrigo');
  expect(ctx.include('ui/Estilos')).toContain('ui/Estilos');

  ctx.planilha().deleteSheet(ctx.planilha().getSheetByName('Logs'));
  expect(ctx.saude().ok).toBe(false);

  const novo = carregarApp('abrigo', { semSetup: true });
  expect(novo.saude().checks.planilha).toBe(false);
  expect(novo.setup().saude.ok).toBe(true);
});
