/**
 * RF02 — contatos de confiança.
 */
const { carregarApp } = require('../../../../test/helpers/carregarApp');
const { criarUsuaria, adicionarContatos } = require('../../../../test/helpers/fixtures');

let ctx, sessao;
beforeEach(() => {
  ctx = carregarApp('aurora');
  ({ sessao } = criarUsuaria(ctx));
});

test('cadastra, lista e edita um contato (normalizando e-mail e telefone)', () => {
  const c = ctx.ServicoContatos.salvar(sessao, { nome: 'Mãe', email: ' MAE@Exemplo.com', telefone: '+55 71 98888-7777', relacao: 'mãe' });
  expect(c).toEqual(expect.objectContaining({ nome: 'Mãe', email: 'mae@exemplo.com', telefone: '71988887777' }));
  expect(ctx.ServicoContatos.listar(sessao)).toHaveLength(1);

  const editado = ctx.ServicoContatos.salvar(sessao, { id: c.id, nome: 'Mãe Joana', email: 'mae@exemplo.com' });
  expect(editado.nome).toBe('Mãe Joana');
  expect(editado.telefone).toBe('');
  expect(ctx.ServicoContatos.listar(sessao)).toHaveLength(1);
});

test('lista só os contatos da própria usuária', () => {
  adicionarContatos(ctx, sessao, 2);
  const outra = criarUsuaria(ctx);
  adicionarContatos(ctx, outra.sessao, 1);
  expect(ctx.ServicoContatos.listar(sessao)).toHaveLength(2);
  expect(ctx.ServicoContatos.listar(outra.sessao)).toHaveLength(1);
});

test('limite de 5 contatos (valor-limite: 5 aceita, 6 rejeita)', () => {
  adicionarContatos(ctx, sessao, 5);
  expect(() => ctx.ServicoContatos.salvar(sessao, { nome: 'Sexto', email: 'sexto@exemplo.com' })).toThrow(
    expect.objectContaining({ codigo: 'LIMITE_CONTATOS' })
  );
});

test('não aceita e-mail repetido na mesma lista', () => {
  ctx.ServicoContatos.salvar(sessao, { nome: 'Irmã', email: 'irma@exemplo.com' });
  expect(() => ctx.ServicoContatos.salvar(sessao, { nome: 'Outra', email: 'IRMA@exemplo.com' })).toThrow(
    expect.objectContaining({ codigo: 'CONTATO_DUPLICADO' })
  );
});

test('dados inválidos são rejeitados com detalhes', () => {
  expect(() => ctx.ServicoContatos.salvar(sessao, { nome: '', email: 'x' })).toThrow(
    expect.objectContaining({ codigo: 'DADOS_INVALIDOS', detalhes: expect.objectContaining({ nome: expect.any(String), email: expect.any(String) }) })
  );
});

test('não permite editar nem remover contato de outra usuária', () => {
  const outra = criarUsuaria(ctx);
  const [alheio] = adicionarContatos(ctx, outra.sessao, 1);
  expect(() => ctx.ServicoContatos.salvar(sessao, { id: alheio.id, nome: 'Invasora', email: 'x@exemplo.com' })).toThrow(
    expect.objectContaining({ codigo: 'NAO_ENCONTRADO' })
  );
  expect(() => ctx.ServicoContatos.remover(sessao, alheio.id)).toThrow(expect.objectContaining({ codigo: 'NAO_ENCONTRADO' }));
  expect(ctx.ServicoContatos.listar(outra.sessao)).toHaveLength(1);
});

test('remove o contato da planilha (não apenas oculta)', () => {
  const [c] = adicionarContatos(ctx, sessao, 1);
  expect(ctx.ServicoContatos.remover(sessao, c.id)).toBe(true);
  expect(ctx.planilha().linhas('Contatos')).toHaveLength(0);
});
