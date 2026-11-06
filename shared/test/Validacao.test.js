/**
 * CT-U01 — Validação de cadastro (formato de e-mail, telefone com DDD e senha).
 * Técnicas: particionamento de equivalência e análise de valor-limite.
 */
const { Validacao } = require('../src/core/Validacao');

describe('CT-U01 · e-mail', () => {
  test.each([
    'maria@gmail.com',
    'MARIA.SILVA@Exemplo.com.br',
    'ana+aurora@salvador.ba.gov.br',
    '  joana@ufba.br  ',
  ])('aceita e-mail válido: %s', (email) => {
    expect(Validacao.validarEmail(email)).toBe(true);
  });

  test.each([
    ['vazio', ''],
    ['nulo', null],
    ['sem @', 'mariagmail.com'],
    ['dois @', 'maria@@gmail.com'],
    ['sem domínio', 'maria@'],
    ['sem TLD', 'maria@gmail'],
    ['TLD de 1 letra', 'maria@gmail.c'],
    ['espaço interno', 'ma ria@gmail.com'],
    ['pontos seguidos', 'maria..silva@gmail.com'],
  ])('rejeita e-mail inválido (%s)', (_, email) => {
    expect(Validacao.validarEmail(email)).toBe(false);
  });

  test('valor-limite de tamanho: 254 aceita, 255 rejeita', () => {
    const dominio = '@exemplo.com'; // 12 caracteres
    expect(Validacao.validarEmail('a'.repeat(254 - dominio.length) + dominio)).toBe(true);
    expect(Validacao.validarEmail('a'.repeat(255 - dominio.length) + dominio)).toBe(false);
  });

  test('normaliza para minúsculas sem espaços', () => {
    expect(Validacao.normalizarEmail('  Maria@GMAIL.com ')).toBe('maria@gmail.com');
  });
});

describe('CT-U01 · telefone com DDD', () => {
  test.each([
    ['celular de Salvador', '(71) 99999-8888'],
    ['celular com +55', '+55 71 99999-8888'],
    ['celular só dígitos', '71999998888'],
    ['fixo de Salvador', '(71) 3202-7390'],
    ['celular de SP', '11 98765-4321'],
    ['com zero de operadora', '071999998888'],
  ])('aceita %s', (_, tel) => {
    expect(Validacao.validarTelefone(tel)).toBe(true);
  });

  test.each([
    ['DDD inexistente 20', '(20) 99999-8888'],
    ['DDD inexistente 23', '(23) 99999-8888'],
    ['sem DDD', '99999-8888'],
    ['celular sem o 9', '(71) 89999-8888'],
    ['fixo começando com 1', '(71) 1202-7390'],
    ['9 dígitos (limite inferior - 1)', '719999988'],
    ['12 dígitos sem 55', '719999988881'],
    ['letras', '(71) abcde-fghi'],
    ['vazio', ''],
  ])('rejeita %s', (_, tel) => {
    expect(Validacao.validarTelefone(tel)).toBe(false);
  });

  test('normaliza removendo máscara e código do país', () => {
    expect(Validacao.normalizarTelefone('+55 (71) 99999-8888')).toBe('71999998888');
  });

  test('a lista de DDDs contém Salvador (71) e não contém 10 nem 20', () => {
    expect(Validacao.DDDS).toContain(71);
    expect(Validacao.DDDS).not.toContain(10);
    expect(Validacao.DDDS).not.toContain(20);
  });
});

describe('CT-U01 · senha', () => {
  test('valor-limite de tamanho: 7 rejeita, 8 aceita, 64 aceita, 65 rejeita', () => {
    expect(Validacao.validarSenha('abc1234')).toBe(false);
    expect(Validacao.validarSenha('abcd1234')).toBe(true);
    expect(Validacao.validarSenha('a1'.repeat(32))).toBe(true);
    expect(Validacao.validarSenha('a1'.repeat(32) + 'x')).toBe(false);
  });

  test.each([
    ['só letras', 'abcdefgh'],
    ['só números', '12345678'],
    ['nula', null],
  ])('rejeita senha %s', (_, s) => {
    expect(Validacao.validarSenha(s)).toBe(false);
  });

  test('aceita acentos e símbolos', () => {
    expect(Validacao.validarSenha('Coração#2026')).toBe(true);
  });
});

describe('RF01 · cadastro da usuária', () => {
  const valido = {
    nome: 'Maria da Conceição',
    email: 'maria@gmail.com',
    telefone: '(71) 99999-8888',
    senha: 'segura123',
    consentimentoLgpd: true,
  };

  test('cadastro completo é válido', () => {
    expect(Validacao.validarCadastroUsuaria(valido)).toEqual({ valido: true, erros: {} });
  });

  test('sem consentimento LGPD é inválido (RNF02)', () => {
    const r = Validacao.validarCadastroUsuaria({ ...valido, consentimentoLgpd: false });
    expect(r.valido).toBe(false);
    expect(r.erros).toHaveProperty('consentimentoLgpd');
  });

  test('consentimento só vale como booleano true (string "true" não serve)', () => {
    expect(Validacao.validarCadastroUsuaria({ ...valido, consentimentoLgpd: 'true' }).valido).toBe(false);
  });

  test('aponta todos os campos inválidos de uma vez', () => {
    const r = Validacao.validarCadastroUsuaria({});
    expect(Object.keys(r.erros).sort()).toEqual(['consentimentoLgpd', 'email', 'nome', 'senha', 'telefone']);
  });

  test('nome: 1 caractere rejeita, 2 aceita; números rejeitam', () => {
    expect(Validacao.validarNome('A')).toBe(false);
    expect(Validacao.validarNome('Al')).toBe(true);
    expect(Validacao.validarNome('Maria 2')).toBe(false);
    expect(Validacao.validarNome("Joana D'Arc")).toBe(true);
  });

  test('bairro acima de 80 caracteres é inválido', () => {
    expect(Validacao.validarCadastroUsuaria({ ...valido, bairro: 'x'.repeat(81) }).erros).toHaveProperty('bairro');
  });
});

describe('RF02 · contato de confiança', () => {
  test('e-mail é obrigatório (o alerta é enviado por e-mail)', () => {
    const r = Validacao.validarContato({ nome: 'Mãe', telefone: '71999998888' });
    expect(r.valido).toBe(false);
    expect(r.erros).toHaveProperty('email');
  });

  test('telefone é opcional, mas se informado precisa ser válido', () => {
    expect(Validacao.validarContato({ nome: 'Irmã', email: 'irma@gmail.com' }).valido).toBe(true);
    expect(Validacao.validarContato({ nome: 'Irmã', email: 'irma@gmail.com', telefone: '123' }).erros).toHaveProperty('telefone');
  });

  test('relação acima de 40 caracteres é inválida', () => {
    expect(Validacao.validarContato({ nome: 'Ana', email: 'a@b.com', relacao: 'x'.repeat(41) }).erros).toHaveProperty('relacao');
  });

  test('limitarTexto corta no máximo informado', () => {
    expect(Validacao.limitarTexto('  abcdef ', 3)).toBe('abc');
    expect(Validacao.limitarTexto(undefined, 3)).toBe('');
  });
});
