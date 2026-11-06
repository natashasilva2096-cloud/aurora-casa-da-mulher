/**
 * Aurora Abrigo — regras da rede de hospedagem solidária.
 */
const { carregarNucleo } = require('../../../../test/helpers/carregarApp');

let Anfitriao;
beforeAll(() => {
  ({ Anfitriao } = carregarNucleo('abrigo'));
});

const valido = {
  nome: 'Helena Teste',
  email: 'helena@exemplo.com',
  telefone: '(71) 98888-1111',
  bairro: 'Itapuã',
  endereco: 'Rua Exemplo, 100, apto 2',
  maxPessoas: 3,
  aceitaFilhos: true,
  maxFilhos: 2,
  duracaoMaxDias: 30,
  acessivel: false,
  consentimento: true,
  termoSigilo: true,
};

describe('validação do cadastro', () => {
  test('cadastro completo é válido', () => {
    expect(Anfitriao.validarCadastro(valido)).toEqual({ valido: true, erros: {} });
  });

  test.each([
    ['maxPessoas', 0, false], ['maxPessoas', 1, true], ['maxPessoas', 6, true], ['maxPessoas', 7, false],
    ['maxPessoas', 2.5, false], ['maxPessoas', '3', true], ['maxPessoas', '', false], ['maxPessoas', true, false],
    ['duracaoMaxDias', 0, false], ['duracaoMaxDias', 1, true], ['duracaoMaxDias', 90, true], ['duracaoMaxDias', 91, false],
  ])('valor-limite %s = %p -> %s', (campo, valor, ok) => {
    const d = { ...valido, aceitaFilhos: false, [campo]: valor };
    expect(Anfitriao.validarCadastro(d).valido).toBe(ok);
  });

  test.each([
    [3, 0, false], [3, 1, true], [3, 2, true], [3, 3, false], // mulher + filhos <= maxPessoas
    [6, 5, true], [6, 6, false],
  ])('pessoas=%i, filhos=%i -> %s', (maxPessoas, maxFilhos, ok) => {
    expect(Anfitriao.validarCadastro({ ...valido, maxPessoas, maxFilhos }).valido).toBe(ok);
  });

  test('sem filhos: maxFilhos é ignorado', () => {
    expect(Anfitriao.validarCadastro({ ...valido, aceitaFilhos: false, maxFilhos: 99 }).valido).toBe(true);
  });

  test('aceitaFilhos precisa ser informado (true/false)', () => {
    expect(Anfitriao.validarCadastro({ ...valido, aceitaFilhos: undefined }).erros).toHaveProperty('aceitaFilhos');
  });

  test('exige consentimento e termo de sigilo', () => {
    const r = Anfitriao.validarCadastro({ ...valido, consentimento: false, termoSigilo: 'sim' });
    expect(Object.keys(r.erros).sort()).toEqual(['consentimento', 'termoSigilo']);
  });

  test('exige endereço e bairro; observação até 500', () => {
    const r = Anfitriao.validarCadastro({ ...valido, endereco: 'R', bairro: '', observacoes: 'x'.repeat(501) });
    expect(Object.keys(r.erros).sort()).toEqual(['bairro', 'endereco', 'observacoes']);
  });

  test('entrada vazia', () => {
    expect(Anfitriao.validarCadastro(undefined).valido).toBe(false);
  });
});

describe('estados do cadastro', () => {
  test.each([
    ['PENDENTE', 'EM_ANALISE', true], ['PENDENTE', 'VALIDADO', false],
    ['EM_ANALISE', 'VALIDADO', true], ['EM_ANALISE', 'RECUSADO', true],
    ['VALIDADO', 'SUSPENSO', true], ['SUSPENSO', 'VALIDADO', true],
    ['RECUSADO', 'VALIDADO', false], ['DESLIGADO', 'VALIDADO', false],
    ['VALIDADO', 'DESLIGADO', true], ['X', 'VALIDADO', false],
  ])('%s -> %s : %s', (de, para, ok) => {
    expect(Anfitriao.podeTransicionar(de, para)).toBe(ok);
    if (ok) expect(Anfitriao.transicionar(de, para)).toBe(para);
    else expect(() => Anfitriao.transicionar(de, para)).toThrow(expect.objectContaining({ codigo: 'TRANSICAO_INVALIDA' }));
  });
});

describe('segurança: visão pública e compatibilidade', () => {
  const casa = (extra = {}) => ({ id: 'a1', ...valido, status: 'VALIDADO', capacitacaoConcluida: true, ...extra });

  test('visão pública NÃO expõe nome, e-mail, telefone, endereço nem observações', () => {
    const v = Anfitriao.visaoPublica(casa());
    expect(Object.keys(v).sort()).toEqual(['aceitaFilhos', 'acessivel', 'bairro', 'duracaoMaxDias', 'id', 'maxFilhos', 'maxPessoas']);
    expect(JSON.stringify(v)).not.toContain('Rua Exemplo');
    expect(JSON.stringify(v)).not.toContain('helena');
  });

  test('disponível só se VALIDADO e com capacitação concluída', () => {
    expect(Anfitriao.disponivel(casa())).toBe(true);
    expect(Anfitriao.disponivel(casa({ capacitacaoConcluida: false }))).toBe(false);
    expect(Anfitriao.disponivel(casa({ status: 'EM_ANALISE' }))).toBe(false);
    expect(Anfitriao.disponivel(casa({ status: 'SUSPENSO' }))).toBe(false);
    expect(Anfitriao.disponivel(null)).toBe(false);
  });

  test.each([
    [{ filhos: 0, dias: 10 }, true],
    [{ filhos: 2, dias: 30 }, true],
    [{ filhos: 3, dias: 10 }, false], // passa de maxFilhos
    [{ filhos: 0, dias: 31 }, false], // passa da duração
    [{ filhos: 0, dias: 10, precisaAcessibilidade: true }, false],
    [{ filhos: 0, dias: 10, evitarBairros: [' itapuã '] }, false], // longe do bairro do agressor
    [{ filhos: 0, dias: 10, evitarBairros: ['Brotas'] }, true],
    [{}, true],
  ])('necessidade %j -> %s', (n, ok) => {
    expect(Anfitriao.compativel(casa(), n)).toBe(ok);
  });

  test('casa que não aceita filhos não recebe mulher com filhos', () => {
    expect(Anfitriao.compativel(casa({ aceitaFilhos: false, maxFilhos: 0 }), { filhos: 1 })).toBe(false);
  });

  test('total de pessoas acima da capacidade', () => {
    expect(Anfitriao.compativel(casa({ maxPessoas: 2, maxFilhos: 5 }), { filhos: 2 })).toBe(false);
  });

  test('compativeis filtra, ordena por duração e devolve só a visão pública', () => {
    const lista = [
      casa({ id: 'curta', duracaoMaxDias: 10 }),
      casa({ id: 'longa', duracaoMaxDias: 60 }),
      casa({ id: 'pendente', status: 'PENDENTE' }),
    ];
    const r = Anfitriao.compativeis(lista, { filhos: 1, dias: 7 });
    expect(r.map((x) => x.id)).toEqual(['longa', 'curta']);
    expect(r[0]).not.toHaveProperty('endereco');
    expect(Anfitriao.compativeis(null, {})).toEqual([]);
  });

  test('capacitação tem os módulos de sigilo e rede de proteção', () => {
    expect(Anfitriao.MODULOS_CAPACITACAO.map((m) => m.id)).toEqual(expect.arrayContaining(['SIGILO', 'REDE']));
  });

  test('protocolo', () => {
    expect(Anfitriao.gerarProtocolo('2026-11-06', 'beef99')).toBe('AB-20261106-BEEF');
  });
});
