/**
 * RF07 / RF08 — solicitação de atendimento e painel da equipe (CT-ACE01, parte automatizável).
 */
const { carregarApp } = require('../../../../test/helpers/carregarApp');
const { criarUsuaria } = require('../../../../test/helpers/fixtures');

const AGORA = new Date('2026-11-06T15:00:00Z'); // sexta, 12h em Salvador
const pedido = (extra = {}) => ({ tipo: 'PSICOSSOCIAL', dataPreferida: '2026-11-10', periodo: 'TARDE', modalidade: 'TELEFONE', observacao: 'Pode ligar depois das 14h', ...extra });

let ctx, sessao;
beforeEach(() => {
  jest.useFakeTimers({ now: AGORA });
  ctx = carregarApp('aurora');
  ({ sessao } = criarUsuaria(ctx, { nome: 'Rita Teste' }));
});
afterEach(() => jest.useRealTimers());

function equipe(perfil) {
  const u = criarUsuaria(ctx, { nome: 'Equipe ' + perfil.toLowerCase().replace(/_/g, ' ') });
  ctx.Repositorio.atualizar('Usuarias', u.usuaria.id, { perfil });
  return ctx.Sessao.exigir(ctx.Sessao.criar({ ...u.usuaria, perfil }));
}

describe('solicitação pela usuária', () => {
  test('gera protocolo, grava como SOLICITADO e lista em "minhas solicitações"', () => {
    const a = ctx.ServicoAtendimento.solicitar(sessao, pedido());
    expect(a.protocolo).toMatch(/^PS-20261106-[A-F0-9]{4}$/);
    expect(a.status).toBe('SOLICITADO');
    expect(a.tipoDescricao).toBe('Acolhimento psicossocial');
    expect(ctx.ServicoAtendimento.listarMeus(sessao)).toHaveLength(1);
  });

  test('protocolo jurídico começa com JU', () => {
    expect(ctx.ServicoAtendimento.solicitar(sessao, pedido({ tipo: 'JURIDICO' })).protocolo).toMatch(/^JU-/);
  });

  test('data no passado é rejeitada (usa a data de Salvador, não UTC)', () => {
    expect(() => ctx.ServicoAtendimento.solicitar(sessao, pedido({ dataPreferida: '2026-11-05' }))).toThrow(
      expect.objectContaining({ codigo: 'DADOS_INVALIDOS', detalhes: expect.objectContaining({ dataPreferida: expect.any(String) }) })
    );
  });

  test('perto da meia-noite UTC, "hoje" continua sendo o dia em Salvador', () => {
    jest.setSystemTime(new Date('2026-11-07T01:30:00Z')); // 22h30 de sexta em Salvador
    expect(ctx.ServicoAtendimento.solicitar(sessao, pedido({ dataPreferida: '2026-11-06' })).status).toBe('SOLICITADO');
  });

  test('notifica a equipe por e-mail SEM dados pessoais da usuária', () => {
    ctx.fakes.props.set('EMAIL_EQUIPE_PSICOSSOCIAL', 'equipe@casadamulher.exemplo');
    const a = ctx.ServicoAtendimento.solicitar(sessao, pedido());
    const [m] = ctx.fakes.mail.enviados;
    expect(m.to).toBe('equipe@casadamulher.exemplo');
    expect(m.body).toContain(a.protocolo);
    expect(m.body).not.toContain('Rita');
    expect(m.body).not.toContain('Pode ligar');
  });

  test('sem e-mail da equipe configurado, nada é enviado; falha de envio não bloqueia a solicitação', () => {
    ctx.ServicoAtendimento.solicitar(sessao, pedido());
    expect(ctx.fakes.mail.enviados).toHaveLength(0);
    ctx.fakes.props.set('EMAIL_EQUIPE_JURIDICA', 'nudem@exemplo.com');
    ctx.fakes.mail.falharPara.add('nudem@exemplo.com');
    expect(ctx.ServicoAtendimento.solicitar(sessao, pedido({ tipo: 'JURIDICO' })).status).toBe('SOLICITADO');
  });

  test('usuária cancela a própria solicitação, mas não a de outra pessoa', () => {
    const a = ctx.ServicoAtendimento.solicitar(sessao, pedido());
    const outra = criarUsuaria(ctx);
    expect(() => ctx.ServicoAtendimento.cancelar(outra.sessao, a.id)).toThrow(expect.objectContaining({ codigo: 'NAO_ENCONTRADO' }));
    expect(ctx.ServicoAtendimento.cancelar(sessao, a.id).status).toBe('CANCELADO');
    expect(() => ctx.ServicoAtendimento.cancelar(sessao, a.id)).toThrow(expect.objectContaining({ codigo: 'TRANSICAO_INVALIDA' }));
  });
});

describe('painel da equipe', () => {
  beforeEach(() => {
    ctx.ServicoAtendimento.solicitar(sessao, pedido({ dataPreferida: '2026-11-12' }));
    ctx.ServicoAtendimento.solicitar(sessao, pedido({ dataPreferida: '2026-11-09' }));
    ctx.ServicoAtendimento.solicitar(sessao, pedido({ tipo: 'JURIDICO' }));
  });

  test('equipe psicossocial vê só psicossocial, ordenado por data, com nome e telefone da usuária', () => {
    const lista = ctx.ServicoAtendimento.listarEquipe(equipe('EQUIPE_PSICOSSOCIAL'));
    expect(lista.map((a) => a.tipo)).toEqual(['PSICOSSOCIAL', 'PSICOSSOCIAL']);
    expect(lista.map((a) => a.dataPreferida)).toEqual(['2026-11-09', '2026-11-12']);
    expect(lista[0]).toEqual(expect.objectContaining({ usuariaNome: 'Rita Teste', usuariaTelefone: '71999990000' }));
  });

  test('equipe jurídica vê só jurídico; admin vê tudo; filtro por status', () => {
    expect(ctx.ServicoAtendimento.listarEquipe(equipe('EQUIPE_JURIDICA')).map((a) => a.tipo)).toEqual(['JURIDICO']);
    const admin = equipe('ADMIN');
    expect(ctx.ServicoAtendimento.listarEquipe(admin)).toHaveLength(3);
    expect(ctx.ServicoAtendimento.listarEquipe(admin, 'CONFIRMADO')).toHaveLength(0);
  });

  test('usuária comum não acessa o painel', () => {
    expect(() => ctx.ServicoAtendimento.listarEquipe(sessao)).toThrow(expect.objectContaining({ codigo: 'ACESSO_NEGADO' }));
    expect(() => ctx.ServicoAtendimento.atualizarStatusEquipe(sessao, 'x', 'CONFIRMADO')).toThrow(expect.objectContaining({ codigo: 'ACESSO_NEGADO' }));
  });

  test('equipe confirma e conclui; registra responsável; transição inválida é bloqueada', () => {
    const s = equipe('EQUIPE_PSICOSSOCIAL');
    const [primeiro] = ctx.ServicoAtendimento.listarEquipe(s);
    expect(() => ctx.ServicoAtendimento.atualizarStatusEquipe(s, primeiro.id, 'REALIZADO')).toThrow(expect.objectContaining({ codigo: 'TRANSICAO_INVALIDA' }));
    expect(ctx.ServicoAtendimento.atualizarStatusEquipe(s, primeiro.id, 'CONFIRMADO').status).toBe('CONFIRMADO');
    expect(ctx.ServicoAtendimento.atualizarStatusEquipe(s, primeiro.id, 'REALIZADO').status).toBe('REALIZADO');
    expect(ctx.Repositorio.buscarPorId('Agendamentos', primeiro.id).responsavel).toBe('Equipe equipe psicossocial');
  });

  test('equipe psicossocial não altera atendimento jurídico', () => {
    const juridico = ctx.ServicoAtendimento.listarEquipe(equipe('ADMIN')).find((a) => a.tipo === 'JURIDICO');
    expect(() => ctx.ServicoAtendimento.atualizarStatusEquipe(equipe('EQUIPE_PSICOSSOCIAL'), juridico.id, 'CONFIRMADO')).toThrow(
      expect.objectContaining({ codigo: 'NAO_ENCONTRADO' })
    );
  });

  test('conta excluída aparece como "(conta excluída)" no painel', () => {
    ctx.Repositorio.remover('Usuarias', sessao.usuariaId);
    expect(ctx.ServicoAtendimento.listarEquipe(equipe('ADMIN'))[0].usuariaNome).toBe('(conta excluída)');
  });
});
