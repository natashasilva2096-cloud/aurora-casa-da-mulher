/**
 * RF01 — cadastro e acesso, integrando Validação + Segurança + Sessão + Planilha.
 */
const { carregarApp } = require('../../../../test/helpers/carregarApp');
const { dadosUsuaria, criarUsuaria, adicionarContatos, CENTRO } = require('../../../../test/helpers/fixtures');

let ctx;
beforeEach(() => {
  ctx = carregarApp('aurora');
});

describe('cadastro', () => {
  test('grava a usuária com hash de senha (nunca a senha em texto) e abre sessão', () => {
    const dados = dadosUsuaria({ email: ' Maria@Exemplo.com ' });
    const r = ctx.ServicoUsuaria.cadastrar(dados);
    expect(r.token).toMatch(/^[a-f0-9]{64}$/);
    expect(r.usuaria).toEqual(expect.objectContaining({ email: 'maria@exemplo.com', telefone: '71999990000', perfil: 'USUARIA' }));
    expect(r.usuaria).not.toHaveProperty('senhaHash');

    const [linha] = ctx.planilha().linhas('Usuarias');
    expect(linha.senhaHash).toMatch(/^sha256\$\d+\$[a-f0-9]{64}$/);
    expect(JSON.stringify(ctx.planilha().linhas('Usuarias'))).not.toContain(dados.senha);
    expect(linha.consentimentoEm).toBeTruthy();
  });

  test('rejeita dados inválidos com os campos apontados', () => {
    expect(() => ctx.ServicoUsuaria.cadastrar({ nome: 'A' })).toThrow(
      expect.objectContaining({ codigo: 'DADOS_INVALIDOS', detalhes: expect.objectContaining({ nome: expect.any(String) }) })
    );
    expect(ctx.planilha().linhas('Usuarias')).toHaveLength(0);
  });

  test('não permite dois cadastros com o mesmo e-mail (sem diferenciar maiúsculas)', () => {
    ctx.ServicoUsuaria.cadastrar(dadosUsuaria({ email: 'ana@exemplo.com' }));
    expect(() => ctx.ServicoUsuaria.cadastrar(dadosUsuaria({ email: 'ANA@exemplo.com' }))).toThrow(
      expect.objectContaining({ codigo: 'EMAIL_JA_CADASTRADO' })
    );
  });

  test('protege contra injeção de fórmula na planilha', () => {
    ctx.ServicoUsuaria.cadastrar(dadosUsuaria({ bairro: '=IMPORTXML("http://x")' }));
    expect(ctx.planilha().linhas('Usuarias')[0].bairro).toBe('\'=IMPORTXML("http://x")');
    // ...mas a aplicação lê o valor original, sem o apóstrofo
    expect(ctx.Repositorio.listar('Usuarias')[0].bairro).toBe('=IMPORTXML("http://x")');
  });
});

describe('login', () => {
  test('entra com a senha correta e recebe sessão válida', () => {
    const d = dadosUsuaria();
    ctx.ServicoUsuaria.cadastrar(d);
    const r = ctx.ServicoUsuaria.entrar(d.email.toUpperCase(), d.senha);
    expect(ctx.Sessao.exigir(r.token).usuariaId).toBe(r.usuaria.id);
  });

  test('mesma mensagem para senha errada e e-mail inexistente (não revela contas)', () => {
    const d = dadosUsuaria();
    ctx.ServicoUsuaria.cadastrar(d);
    let e1, e2;
    try { ctx.ServicoUsuaria.entrar(d.email, 'errada123'); } catch (e) { e1 = e; }
    try { ctx.ServicoUsuaria.entrar('ninguem@exemplo.com', 'errada123'); } catch (e) { e2 = e; }
    expect(e1.codigo).toBe('CREDENCIAIS_INVALIDAS');
    expect(e2.codigo).toBe('CREDENCIAIS_INVALIDAS');
    expect(e1.mensagem).toBe(e2.mensagem);
  });

  test('bloqueia após 5 tentativas erradas, mesmo com a senha certa (transição ativo -> bloqueado)', () => {
    const d = dadosUsuaria();
    ctx.ServicoUsuaria.cadastrar(d);
    for (let i = 0; i < 5; i++) expect(() => ctx.ServicoUsuaria.entrar(d.email, 'errada123')).toThrow();
    expect(() => ctx.ServicoUsuaria.entrar(d.email, d.senha)).toThrow(expect.objectContaining({ codigo: 'LOGIN_BLOQUEADO' }));
  });

  test('4 erros e depois acerto: entra e zera o contador', () => {
    const d = dadosUsuaria();
    ctx.ServicoUsuaria.cadastrar(d);
    for (let i = 0; i < 4; i++) expect(() => ctx.ServicoUsuaria.entrar(d.email, 'errada123')).toThrow();
    expect(ctx.ServicoUsuaria.entrar(d.email, d.senha).token).toBeTruthy();
    for (let i = 0; i < 4; i++) expect(() => ctx.ServicoUsuaria.entrar(d.email, 'errada123')).toThrow();
    expect(ctx.ServicoUsuaria.entrar(d.email, d.senha).token).toBeTruthy();
  });

  test('campos vazios', () => {
    expect(() => ctx.ServicoUsuaria.entrar('', '')).toThrow(expect.objectContaining({ codigo: 'CREDENCIAIS_INVALIDAS' }));
  });
});

describe('sessão', () => {
  test('sair invalida o token', () => {
    const { token } = criarUsuaria(ctx);
    ctx.ServicoUsuaria.sair(token);
    expect(() => ctx.Sessao.exigir(token)).toThrow(expect.objectContaining({ codigo: 'SESSAO_INVALIDA' }));
  });

  test.each([[undefined], [''], ['curto'], ['f'.repeat(64)]])('token inválido: %p', (t) => {
    expect(() => ctx.Sessao.exigir(t)).toThrow(expect.objectContaining({ codigo: 'SESSAO_INVALIDA' }));
  });

  test('sessão sem uso expira após o prazo configurado (6 h)', () => {
    jest.useFakeTimers({ now: new Date('2026-11-06T12:00:00Z') });
    try {
      const { token } = criarUsuaria(ctx);
      jest.setSystemTime(new Date('2026-11-06T18:00:01Z'));
      expect(() => ctx.Sessao.exigir(token)).toThrow(expect.objectContaining({ codigo: 'SESSAO_INVALIDA' }));
    } finally {
      jest.useRealTimers();
    }
  });

  test('expiração deslizante: usar o app renova a sessão (não vence no meio do uso)', () => {
    jest.useFakeTimers({ now: new Date('2026-11-06T12:00:00Z') });
    try {
      const { token } = criarUsuaria(ctx);
      jest.setSystemTime(new Date('2026-11-06T17:00:00Z'));
      expect(ctx.Sessao.exigir(token)).toBeTruthy(); // uso às 17h renova até 23h
      jest.setSystemTime(new Date('2026-11-06T22:59:00Z'));
      expect(ctx.Sessao.exigir(token)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  test('exigirPerfil nega acesso a quem não é da equipe', () => {
    const { token } = criarUsuaria(ctx);
    expect(() => ctx.Sessao.exigirPerfil(token, ['ADMIN'])).toThrow(expect.objectContaining({ codigo: 'ACESSO_NEGADO' }));
  });

  test('obter perfil de conta removida falha com SESSAO_INVALIDA', () => {
    const { sessao } = criarUsuaria(ctx);
    ctx.Repositorio.remover('Usuarias', sessao.usuariaId);
    expect(() => ctx.ServicoUsuaria.obter(sessao)).toThrow(expect.objectContaining({ codigo: 'SESSAO_INVALIDA' }));
  });
});

describe('exclusão de conta (LGPD)', () => {
  test('apaga usuária, contatos, acionamentos e localizações; desvincula agendamentos; encerra a sessão', () => {
    const d = dadosUsuaria();
    const { sessao, token } = criarUsuaria(ctx, d);
    adicionarContatos(ctx, sessao, 2);
    ctx.ServicoAlerta.acionar(sessao, CENTRO);
    ctx.Repositorio.inserir('Agendamentos', { usuariaId: sessao.usuariaId, tipo: 'JURIDICO', status: 'SOLICITADO', observacao: 'detalhe sensível' });
    const outra = criarUsuaria(ctx);
    adicionarContatos(ctx, outra.sessao, 1);

    expect(ctx.ServicoUsuaria.excluirConta(sessao, d.senha)).toBe(true);

    const ss = ctx.planilha();
    expect(ss.linhas('Usuarias').map((u) => u.id)).toEqual([outra.usuaria.id]);
    expect(ss.linhas('Contatos')).toHaveLength(1);
    expect(ss.linhas('Acionamentos')).toHaveLength(0);
    expect(ss.linhas('Localizacoes')).toHaveLength(0);
    expect(ss.linhas('Agendamentos')[0]).toEqual(expect.objectContaining({ usuariaId: 'EXCLUIDA', observacao: '' }));
    expect(() => ctx.Sessao.exigir(token)).toThrow();
  });

  test('exige a senha correta', () => {
    const { sessao } = criarUsuaria(ctx);
    expect(() => ctx.ServicoUsuaria.excluirConta(sessao, 'errada123')).toThrow(expect.objectContaining({ codigo: 'CREDENCIAIS_INVALIDAS' }));
    expect(ctx.planilha().linhas('Usuarias')).toHaveLength(1);
  });
});
