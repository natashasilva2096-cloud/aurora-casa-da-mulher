/**
 * CT-U02 — Criptografia de dados: a função que protege a senha gera o hash
 * seguro corretamente antes do envio ao banco.
 */
const crypto = require('crypto');
const { Seguranca } = require('../src/core/Seguranca');

const sha256 = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

describe('CT-U02 · hash de senha', () => {
  test('o hash não contém a senha e segue o formato sha256$iteracoes$hex', () => {
    const h = Seguranca.hashSenha('minhaSenha123', 'salt-1', sha256);
    expect(h).toMatch(/^sha256\$200\$[a-f0-9]{64}$/);
    expect(h).not.toContain('minhaSenha123');
  });

  test('é determinístico para a mesma senha e salt', () => {
    expect(Seguranca.hashSenha('abc12345', 's', sha256)).toBe(Seguranca.hashSenha('abc12345', 's', sha256));
  });

  test('salts diferentes geram hashes diferentes (mesma senha)', () => {
    expect(Seguranca.hashSenha('abc12345', 's1', sha256)).not.toBe(Seguranca.hashSenha('abc12345', 's2', sha256));
  });

  test('aplica as iterações (1 iteração = SHA-256 de salt:senha)', () => {
    expect(Seguranca.hashSenha('x', 'y', sha256, 1)).toBe('sha256$1$' + sha256('y:x'));
    expect(Seguranca.hashSenha('x', 'y', sha256, 2)).toBe('sha256$2$' + sha256('y:' + sha256('y:x')));
  });

  test('exige função de digest e salt', () => {
    expect(() => Seguranca.hashSenha('a', 'b')).toThrow('digestHex');
    expect(() => Seguranca.hashSenha('a', '', sha256)).toThrow('salt');
  });
});

describe('CT-U02 · verificação de senha', () => {
  const salt = 'sal-aleatorio';
  const armazenado = Seguranca.hashSenha('Correta2026', salt, sha256);

  test('senha correta confere', () => {
    expect(Seguranca.verificarSenha('Correta2026', salt, armazenado, sha256)).toBe(true);
  });

  test.each([
    ['senha errada', 'Errada2026', salt, armazenado],
    ['salt diferente', 'Correta2026', 'outro', armazenado],
    ['hash adulterado', 'Correta2026', salt, armazenado.slice(0, -1) + '0'],
    ['formato inválido', 'Correta2026', salt, 'texto-qualquer'],
    ['algoritmo desconhecido', 'Correta2026', salt, armazenado.replace('sha256', 'md5')],
    ['iterações inválidas', 'Correta2026', salt, 'sha256$0$abc'],
    ['hash vazio', 'Correta2026', salt, ''],
  ])('rejeita: %s', (_, senha, s, h) => {
    expect(Seguranca.verificarSenha(senha, s, h, sha256)).toBe(false);
  });
});

describe('utilitários de segurança', () => {
  test('bytesParaHex converte bytes com sinal (formato do Apps Script)', () => {
    expect(Seguranca.bytesParaHex([0, 15, 16, 127, -128, -1])).toBe('000f107f80ff');
  });

  test('compararSeguro', () => {
    expect(Seguranca.compararSeguro('abc', 'abc')).toBe(true);
    expect(Seguranca.compararSeguro('abc', 'abd')).toBe(false);
    expect(Seguranca.compararSeguro('abc', 'abcd')).toBe(false);
  });

  test('mascararEmail não expõe o endereço nos logs', () => {
    expect(Seguranca.mascararEmail('maria.silva@gmail.com')).toBe('ma***@gmail.com');
    expect(Seguranca.mascararEmail('a@b.com')).toBe('a***@b.com');
    expect(Seguranca.mascararEmail('invalido')).toBe('***');
  });
});
