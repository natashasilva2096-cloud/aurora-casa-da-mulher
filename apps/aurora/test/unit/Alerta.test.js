/**
 * RF03 / RF04 — regras do botão de pânico.
 * Técnicas: transição de estados, tabela de decisão e valor-limite.
 */
const { carregarNucleo } = require('../../../../test/helpers/carregarApp');

let Alerta;
beforeAll(() => {
  ({ Alerta } = carregarNucleo('aurora'));
});

describe('máquina de estados do acionamento', () => {
  // Tabela completa: [estado atual, evento, próximo estado | null se inválido]
  const tabela = [
    ['', 'ACIONAR', 'ATIVO'],
    ['', 'ATUALIZAR', null],
    ['', 'ENCERRAR', null],
    ['', 'EXPIRAR', null],
    ['ATIVO', 'ACIONAR', null],
    ['ATIVO', 'ATUALIZAR', 'ATIVO'],
    ['ATIVO', 'ENCERRAR', 'ENCERRADO'],
    ['ATIVO', 'EXPIRAR', 'EXPIRADO'],
    ['ENCERRADO', 'ACIONAR', null],
    ['ENCERRADO', 'ATUALIZAR', null],
    ['ENCERRADO', 'ENCERRAR', null],
    ['EXPIRADO', 'ATUALIZAR', null],
    ['EXPIRADO', 'ENCERRAR', null],
    ['DESCONHECIDO', 'ACIONAR', null],
  ];

  test.each(tabela)('%s + %s -> %s', (de, evento, para) => {
    expect(Alerta.podeTransicionar(de, evento)).toBe(para !== null);
    if (para) expect(Alerta.transicionar(de, evento)).toBe(para);
    else expect(() => Alerta.transicionar(de, evento)).toThrow(expect.objectContaining({ codigo: 'TRANSICAO_INVALIDA' }));
  });

  test('undefined é tratado como "nenhum alerta"', () => {
    expect(Alerta.transicionar(undefined, 'ACIONAR')).toBe('ATIVO');
  });
});

describe('expiração do alerta (valor-limite de 12 h)', () => {
  const inicio = new Date('2026-11-06T10:00:00.000Z');
  const ativo = { status: 'ATIVO', inicio: inicio.toISOString() };
  const mais = (ms) => new Date(inicio.getTime() + ms);
  const H12 = 12 * 3600 * 1000;

  test('exatamente 12 h: ainda não expirou', () => {
    expect(Alerta.estaExpirado(ativo, mais(H12), 12)).toBe(false);
  });
  test('12 h + 1 ms: expirou', () => {
    expect(Alerta.estaExpirado(ativo, mais(H12 + 1), 12)).toBe(true);
  });
  test('alerta encerrado nunca "expira"', () => {
    expect(Alerta.estaExpirado({ ...ativo, status: 'ENCERRADO' }, mais(H12 * 10), 12)).toBe(false);
  });
  test('início inválido é tratado como expirado (falha segura)', () => {
    expect(Alerta.estaExpirado({ status: 'ATIVO', inicio: 'lixo' }, mais(0), 12)).toBe(true);
  });
  test('sem acionamento', () => {
    expect(Alerta.estaExpirado(null, mais(0), 12)).toBe(false);
  });
});

describe('contatos elegíveis', () => {
  test('remove e-mails inválidos e duplicados (sem diferenciar maiúsculas)', () => {
    const r = Alerta.contatosElegiveis([
      { id: 1, email: 'mae@gmail.com' },
      { id: 2, email: 'MAE@gmail.com' },
      { id: 3, email: 'invalido' },
      { id: 4, email: 'irma@gmail.com' },
      null,
    ]);
    expect(r.map((c) => c.id)).toEqual([1, 4]);
  });
  test('lista vazia ou ausente', () => {
    expect(Alerta.contatosElegiveis(undefined)).toEqual([]);
  });
});

describe('CT-INT02 · mensagem de alerta (conteúdo)', () => {
  const base = {
    nomeUsuaria: 'Maria da Silva',
    nomeContato: 'Joana Souza',
    linkRastreio: 'https://script.google.com/macros/s/X/exec?page=rastreio&t=abc',
    coordenada: { lat: -12.97, lng: -38.5 },
    dataHoraTexto: '17:25 de 06/11/2026',
    pontoMaisProximo: { nome: 'DEAM Periperi', endereco: 'Rua Dr. Almeida, 72' },
  };

  test('contém o link de rastreio, o link do mapa, o ponto mais próximo e o 190', () => {
    const m = Alerta.montarMensagem(base);
    expect(m.assunto).toBe('URGENTE: Maria pediu ajuda (Aurora)');
    expect(m.texto).toContain(base.linkRastreio);
    expect(m.texto).toContain('https://www.google.com/maps/search/?api=1&query=-12.97,-38.5');
    expect(m.texto).toContain('DEAM Periperi');
    expect(m.texto).toContain('190');
    expect(m.texto).toMatch(/^Olá, Joana\./);
    expect(m.html).toContain('<a href="' + base.linkRastreio.replace(/&/g, '&amp;') + '">');
  });

  test('sem localização: avisa e ainda envia o link (que será atualizado)', () => {
    const m = Alerta.montarMensagem({ ...base, coordenada: null, pontoMaisProximo: null });
    expect(m.texto).toContain('não pôde ser obtida');
    expect(m.texto).toContain(base.linkRastreio);
    expect(m.texto).not.toContain('google.com/maps');
  });

  test('usa só o primeiro nome (privacidade) e escapa HTML (evita injeção no e-mail)', () => {
    const m = Alerta.montarMensagem({ ...base, nomeUsuaria: '<script>alert(1)</script> Silva', nomeContato: undefined });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.texto).toMatch(/^Olá\./);
  });

  test('nome vazio vira "Uma pessoa"', () => {
    expect(Alerta.primeiroNome('   ')).toBe('Uma pessoa');
  });

  test('mensagem de encerramento', () => {
    const m = Alerta.montarMensagemEncerramento({ nomeUsuaria: 'Maria Silva', dataHoraTexto: '18:00' });
    expect(m.assunto).toContain('Maria está em segurança');
    expect(m.texto).toContain('desativado');
  });

  test('escaparHtml trata null e aspas', () => {
    expect(Alerta.escaparHtml(null)).toBe('');
    expect(Alerta.escaparHtml(`"'`)).toBe('&quot;&#39;');
  });
});

describe('resumo do envio (tabela de decisão)', () => {
  test.each([
    [[], 'SEM_CONTATOS', 0, 0],
    [[{ ok: true }, { ok: true }], 'ENVIADO', 2, 0],
    [[{ ok: true }, { ok: false }], 'PARCIAL', 1, 1],
    [[{ ok: false }, { ok: false }], 'FALHOU', 0, 2],
  ])('%j -> %s', (resultados, situacao, enviados, falhas) => {
    expect(Alerta.resumoEnvio(resultados)).toEqual({ total: resultados.length, enviados, falhas, situacao });
  });
  test('entrada ausente', () => {
    expect(Alerta.resumoEnvio(undefined).situacao).toBe('SEM_CONTATOS');
  });
});
