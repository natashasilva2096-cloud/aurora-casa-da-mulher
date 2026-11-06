/**
 * RF03 / RF04 — botão de pânico integrado a GPS, planilha e mensageria.
 *   CT-INT01  integração do botão de pânico com a geolocalização
 *   CT-INT02  disparo do serviço de alerta para os contatos cadastrados
 *   CT-SIS02  desempenho e concorrência (proxy em ambiente simulado)
 * Cenários de falha vêm da FMECA (docs/manutencao-e-correcao.md).
 */
const { carregarApp } = require('../../../../test/helpers/carregarApp');
const { criarUsuaria, adicionarContatos, inserirPontos, CENTRO } = require('../../../../test/helpers/fixtures');

let ctx, sessao, contatos;
beforeEach(() => {
  ctx = carregarApp('aurora');
  inserirPontos(ctx);
  ({ sessao } = criarUsuaria(ctx, { nome: 'Maria Teste' }));
  contatos = adicionarContatos(ctx, sessao, 2);
});

describe('CT-INT01 · acionamento com geolocalização', () => {
  test('registra o acionamento com as coordenadas recebidas e o histórico de posição', () => {
    const r = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    expect(r.status).toBe('ATIVO');
    expect(r.temLocalizacao).toBe(true);

    const [a] = ctx.planilha().linhas('Acionamentos');
    expect(a).toEqual(expect.objectContaining({ lat: CENTRO.lat, lng: CENTRO.lng, precisao: 12, status: 'ATIVO' }));
    expect(ctx.planilha().linhas('Localizacoes')).toHaveLength(1);
  });

  test('aceita coordenadas como texto (formato do navegador) e normaliza', () => {
    ctx.ServicoAlerta.acionar(sessao, { lat: '-12.9714', lng: '-38.5014' });
    expect(ctx.Repositorio.listar('Acionamentos')[0].lat).toBe(-12.9714);
  });

  test('sem GPS (null, 0/0 ou lixo) o alerta é enviado mesmo assim', () => {
    [null, { lat: 0, lng: 0 }, { lat: 'abc', lng: 1 }].forEach((coord) => {
      const c = carregarApp('aurora');
      const u = criarUsuaria(c);
      adicionarContatos(c, u.sessao, 1);
      const r = c.ServicoAlerta.acionar(u.sessao, coord);
      expect(r.status).toBe('ATIVO');
      expect(r.temLocalizacao).toBe(false);
      expect(r.situacaoEnvio).toBe('ENVIADO');
      expect(c.fakes.mail.enviados[0].body).toContain('não pôde ser obtida');
    });
  });

  test('informa o ponto seguro validado mais próximo (ignora o não validado)', () => {
    const r = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    expect(r.pontoMaisProximo.nome).toBe('DEAM Teste Perto');
  });

  test('falha ao buscar ponto mais próximo não impede o alerta', () => {
    jest.spyOn(ctx.ServicoPontos, 'maisProximo').mockImplementation(() => {
      throw new Error('planilha de pontos corrompida');
    });
    const r = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    expect(r.situacaoEnvio).toBe('ENVIADO');
    expect(r.pontoMaisProximo).toBeNull();
  });
});

describe('CT-INT02 · disparo de alertas aos contatos', () => {
  test('envia um e-mail por contato com o link de rastreio', () => {
    const r = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    const enviados = ctx.fakes.mail.enviados;
    expect(enviados.map((m) => m.to).sort()).toEqual(contatos.map((c) => c.email).sort());
    enviados.forEach((m) => {
      expect(m.subject).toBe('URGENTE: Maria pediu ajuda (Aurora)');
      expect(m.body).toContain(r.linkRastreio);
      expect(m.htmlBody).toContain('<a href=');
    });
    expect(r.linkRastreio).toMatch(/^https:\/\/script\.google\.com\/macros\/s\/TESTE\/exec\?page=rastreio&t=[a-f0-9]{64}$/);
    expect(r).toEqual(expect.objectContaining({ situacaoEnvio: 'ENVIADO', enviados: 2, falhas: 0, totalContatos: 2 }));
  });

  test('falha temporária em um contato: nova tentativa resolve', () => {
    ctx.fakes.mail.falharUmaVezPara.add(contatos[0].email);
    const r = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    expect(r.situacaoEnvio).toBe('ENVIADO');
    expect(ctx.fakes.mail.enviados).toHaveLength(2);
  });

  test('falha permanente em um contato não impede os demais (PARCIAL)', () => {
    ctx.fakes.mail.falharPara.add(contatos[0].email);
    const r = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    expect(r).toEqual(expect.objectContaining({ situacaoEnvio: 'PARCIAL', enviados: 1, falhas: 1 }));
    expect(ctx.fakes.mail.enviados.map((m) => m.to)).toEqual([contatos[1].email]);
    expect(ctx.planilha().linhas('Logs').some((l) => l.nivel === 'AVISO' && l.evento === 'ALERTA_ACIONADO')).toBe(true);
  });

  test('cota diária de e-mail esgotada: alerta registrado, status FALHOU para a tela orientar ligar 190', () => {
    ctx.fakes.mail.cota = 0;
    const r = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    expect(r.status).toBe('ATIVO');
    expect(r.situacaoEnvio).toBe('FALHOU');
  });

  test('sem contatos cadastrados: alerta registrado com situação SEM_CONTATOS', () => {
    const u = criarUsuaria(ctx);
    const r = ctx.ServicoAlerta.acionar(u.sessao, CENTRO);
    expect(r.situacaoEnvio).toBe('SEM_CONTATOS');
    expect(r.emergencia.map((t) => t.numero)).toContain('190');
  });

  test('acionar duas vezes não duplica o alerta nem reenvia e-mails (idempotência)', () => {
    const r1 = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    const r2 = ctx.ServicoAlerta.acionar(sessao, { lat: -12.98, lng: -38.5 });
    expect(r2.acionamentoId).toBe(r1.acionamentoId);
    expect(r2.situacaoEnvio).toBe('JA_ENVIADO');
    expect(r2.novo).toBe(false);
    expect(ctx.fakes.mail.enviados).toHaveLength(2);
    expect(ctx.planilha().linhas('Acionamentos')).toHaveLength(1);
    expect(ctx.planilha().linhas('Localizacoes')).toHaveLength(2); // a nova posição foi aproveitada
  });

  test('o registro e a reutilização acontecem dentro do lock', () => {
    const antes = ctx.fakes.lock.esperas;
    ctx.ServicoAlerta.acionar(sessao, CENTRO);
    expect(ctx.fakes.lock.esperas).toBeGreaterThan(antes);
    expect(ctx.fakes.lock.esperas).toBe(ctx.fakes.lock.liberacoes);
  });
});

describe('RF04 · localização em tempo real', () => {
  test('atualiza a posição do alerta ativo', () => {
    const { acionamentoId } = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    const r = ctx.ServicoAlerta.atualizarLocalizacao(sessao, acionamentoId, { lat: -12.975, lng: -38.505, precisao: 8 });
    expect(r.status).toBe('ATIVO');
    expect(ctx.Repositorio.buscarPorId('Acionamentos', acionamentoId)).toEqual(expect.objectContaining({ lat: -12.975, lng: -38.505 }));
    expect(ctx.planilha().linhas('Localizacoes')).toHaveLength(2);
  });

  test('alerta iniciado sem GPS passa a ter localização quando ela chega', () => {
    const { acionamentoId } = ctx.ServicoAlerta.acionar(sessao, null);
    expect(ctx.ServicoAlerta.atualizarLocalizacao(sessao, acionamentoId, CENTRO).temLocalizacao).toBe(true);
  });

  test('rejeita coordenada inválida, alerta de outra usuária e alerta encerrado', () => {
    const { acionamentoId } = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    expect(() => ctx.ServicoAlerta.atualizarLocalizacao(sessao, acionamentoId, { lat: 999, lng: 0 })).toThrow(
      expect.objectContaining({ codigo: 'COORDENADA_INVALIDA' })
    );
    const outra = criarUsuaria(ctx);
    expect(() => ctx.ServicoAlerta.atualizarLocalizacao(outra.sessao, acionamentoId, CENTRO)).toThrow(
      expect.objectContaining({ codigo: 'NAO_ENCONTRADO' })
    );
    ctx.ServicoAlerta.encerrar(sessao, acionamentoId);
    expect(() => ctx.ServicoAlerta.atualizarLocalizacao(sessao, acionamentoId, CENTRO)).toThrow(
      expect.objectContaining({ codigo: 'ALERTA_INATIVO' })
    );
  });
});

describe('encerramento, expiração e acompanhamento pelos contatos', () => {
  test('encerrar avisa os contatos de que ela está em segurança', () => {
    const { acionamentoId } = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    ctx.fakes.mail.enviados.length = 0;
    const r = ctx.ServicoAlerta.encerrar(sessao, acionamentoId);
    expect(r.status).toBe('ENCERRADO');
    expect(ctx.fakes.mail.enviados).toHaveLength(2);
    expect(ctx.fakes.mail.enviados[0].subject).toContain('está em segurança');
    expect(ctx.ServicoAlerta.statusAtual(sessao)).toBeNull();
  });

  test('página de rastreio mostra a posição só enquanto o alerta está ATIVO (RNF02)', () => {
    const r = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    const token = r.linkRastreio.split('t=')[1];

    const ativo = ctx.ServicoAlerta.rastreio(token);
    expect(ativo).toEqual(expect.objectContaining({ primeiroNome: 'Maria', status: 'ATIVO', lat: CENTRO.lat, lng: CENTRO.lng }));
    expect(ativo).not.toHaveProperty('email');
    expect(ativo).not.toHaveProperty('telefone');

    ctx.ServicoAlerta.encerrar(sessao, r.acionamentoId);
    const encerrado = ctx.ServicoAlerta.rastreio(token);
    expect(encerrado.status).toBe('ENCERRADO');
    expect(encerrado).not.toHaveProperty('lat');
    expect(encerrado).not.toHaveProperty('linkMapa');
  });

  test.each([[''], ['abc'], ['g'.repeat(64)], ['a'.repeat(64)]])('token de rastreio inválido/inexistente: %p', (t) => {
    expect(() => ctx.ServicoAlerta.rastreio(t)).toThrow(expect.objectContaining({ codigo: 'LINK_INVALIDO' }));
  });

  test('alerta expira após 12 h: rastreio deixa de mostrar posição e novo acionamento cria outro alerta', () => {
    jest.useFakeTimers({ now: new Date('2026-11-06T10:00:00Z') });
    try {
      // a sessão também expiraria; criamos uma nova para o segundo acionamento
      const r1 = ctx.ServicoAlerta.acionar(sessao, CENTRO);
      jest.setSystemTime(new Date('2026-11-06T22:00:01Z'));
      const token = r1.linkRastreio.split('t=')[1];
      const rast = ctx.ServicoAlerta.rastreio(token);
      expect(rast.status).toBe('EXPIRADO');
      expect(rast).not.toHaveProperty('lat');

      const r2 = ctx.ServicoAlerta.acionar(sessao, CENTRO);
      expect(r2.acionamentoId).not.toBe(r1.acionamentoId);
      expect(r2.novo).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test('statusAtual devolve o alerta ativo (para reabrir a tela após recarregar)', () => {
    expect(ctx.ServicoAlerta.statusAtual(sessao)).toBeNull();
    const r = ctx.ServicoAlerta.acionar(sessao, CENTRO);
    expect(ctx.ServicoAlerta.statusAtual(sessao)).toEqual(expect.objectContaining({ acionamentoId: r.acionamentoId, status: 'ATIVO' }));
  });

  test('conta inexistente não aciona', () => {
    expect(() => ctx.ServicoAlerta.acionar({ usuariaId: 'nao-existe' }, CENTRO)).toThrow(expect.objectContaining({ codigo: 'SESSAO_INVALIDA' }));
  });
});

describe('CT-SIS02 · desempenho e concorrência (simulado)', () => {
  test('30 usuárias acionando em sequência rápida: todos os alertas processados, cada um abaixo de 5 s', () => {
    const usuarias = Array.from({ length: 30 }, () => {
      const u = criarUsuaria(ctx);
      adicionarContatos(ctx, u.sessao, 3);
      return u;
    });
    ctx.fakes.mail.enviados.length = 0;
    const resultados = usuarias.map((u) => ctx.ServicoAlerta.acionar(u.sessao, CENTRO));

    expect(resultados.every((r) => r.situacaoEnvio === 'ENVIADO')).toBe(true);
    expect(new Set(resultados.map((r) => r.acionamentoId)).size).toBe(30);
    expect(ctx.fakes.mail.enviados).toHaveLength(90);
    resultados.forEach((r) => expect(r.duracaoMs).toBeLessThan(ctx.Config.TEMPO_MAXIMO_ACIONAMENTO_MS));
    expect(ctx.fakes.lock.esperas).toBe(ctx.fakes.lock.liberacoes);
  });
});
