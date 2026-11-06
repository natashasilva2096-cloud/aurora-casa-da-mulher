/**
 * RF07 / RF08 — regras de agendamento.
 * Hoje fixo: sexta-feira, 06/11/2026.
 */
const { carregarNucleo } = require('../../../../test/helpers/carregarApp');

let Agendamento;
beforeAll(() => {
  ({ Agendamento } = carregarNucleo('aurora'));
});

const HOJE = '2026-11-06'; // sexta
const valida = { tipo: 'PSICOSSOCIAL', dataPreferida: '2026-11-09', periodo: 'MANHA', modalidade: 'PRESENCIAL' };

describe('validação da solicitação', () => {
  test('solicitação completa é válida', () => {
    expect(Agendamento.validarSolicitacao(valida, HOJE, 60)).toEqual({ valido: true, erros: {} });
  });

  test.each([
    ['hoje (sexta) é aceito', '2026-11-06', true],
    ['ontem é rejeitado', '2026-11-05', false],
    ['sábado é rejeitado', '2026-11-07', false],
    ['domingo é rejeitado', '2026-11-08', false],
    ['segunda é aceita', '2026-11-09', true],
    ['limite: +60 dias (terça 05/01/2027) aceito', '2027-01-05', true],
    ['limite: +61 dias rejeitado', '2027-01-06', false],
    ['data inexistente 30/02', '2027-02-30', false],
    ['formato brasileiro não é aceito', '09/11/2026', false],
    ['vazia', '', false],
  ])('%s', (_, data, esperado) => {
    const r = Agendamento.validarSolicitacao({ ...valida, dataPreferida: data }, HOJE, 60);
    expect(r.valido).toBe(esperado);
    if (!esperado) expect(r.erros).toHaveProperty('dataPreferida');
  });

  test('tipo, período e modalidade precisam ser valores conhecidos', () => {
    const r = Agendamento.validarSolicitacao({ ...valida, tipo: 'X', periodo: 'NOITE', modalidade: 'CARTA' }, HOJE);
    expect(Object.keys(r.erros).sort()).toEqual(['modalidade', 'periodo', 'tipo']);
  });

  test('observação: 500 caracteres aceita, 501 rejeita', () => {
    expect(Agendamento.validarSolicitacao({ ...valida, observacao: 'x'.repeat(500) }, HOJE).valido).toBe(true);
    expect(Agendamento.validarSolicitacao({ ...valida, observacao: 'x'.repeat(501) }, HOJE).erros).toHaveProperty('observacao');
  });

  test('entrada vazia aponta todos os campos', () => {
    expect(Object.keys(Agendamento.validarSolicitacao(undefined, HOJE).erros).length).toBe(4);
  });
});

describe('estados do atendimento', () => {
  test.each([
    ['SOLICITADO', 'CONFIRMADO', true],
    ['SOLICITADO', 'CANCELADO', true],
    ['SOLICITADO', 'REALIZADO', false],
    ['CONFIRMADO', 'REALIZADO', true],
    ['CONFIRMADO', 'CANCELADO', true],
    ['REALIZADO', 'CANCELADO', false],
    ['CANCELADO', 'CONFIRMADO', false],
    ['INEXISTENTE', 'CONFIRMADO', false],
  ])('%s -> %s : %s', (de, para, pode) => {
    expect(Agendamento.podeTransicionar(de, para)).toBe(pode);
    if (pode) expect(Agendamento.transicionar(de, para)).toBe(para);
    else expect(() => Agendamento.transicionar(de, para)).toThrow(expect.objectContaining({ codigo: 'TRANSICAO_INVALIDA' }));
  });
});

describe('protocolo e permissões', () => {
  test('protocolo legível', () => {
    expect(Agendamento.gerarProtocolo('JURIDICO', '2026-11-06', 'abcd1234')).toBe('JU-20261106-ABCD');
    expect(Agendamento.gerarProtocolo('PSICOSSOCIAL', '2026-11-06', 'ff00')).toBe('PS-20261106-FF00');
  });

  test.each([
    ['ADMIN', 'PSICOSSOCIAL', true],
    ['ADMIN', 'JURIDICO', true],
    ['EQUIPE_PSICOSSOCIAL', 'PSICOSSOCIAL', true],
    ['EQUIPE_PSICOSSOCIAL', 'JURIDICO', false],
    ['EQUIPE_JURIDICA', 'JURIDICO', true],
    ['EQUIPE_JURIDICA', 'PSICOSSOCIAL', false],
    ['USUARIA', 'PSICOSSOCIAL', false],
  ])('%s vê %s: %s', (perfil, tipo, pode) => {
    expect(Agendamento.perfilPodeVer(perfil, tipo)).toBe(pode);
  });

  test('parseData', () => {
    expect(Agendamento.parseData('2026-11-06').toISOString()).toBe('2026-11-06T00:00:00.000Z');
    expect(Agendamento.parseData(null)).toBeNull();
  });
});
