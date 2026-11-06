/**
 * RF05 / RF06 — pontos seguros e rotas, integrando planilha e serviço Maps.
 */
const { carregarApp } = require('../../../../test/helpers/carregarApp');
const { inserirPontos, CENTRO } = require('../../../../test/helpers/fixtures');

let ctx, pontos;
beforeEach(() => {
  ctx = carregarApp('aurora');
  pontos = inserirPontos(ctx);
});

describe('RF06 · pontos próximos', () => {
  test('ordena por distância e nunca inclui ponto não validado', () => {
    const r = ctx.ServicoPontos.proximos(CENTRO);
    expect(r.comDistancia).toBe(true);
    expect(r.pontos.map((p) => p.nome)).toEqual(['DEAM Teste Perto', 'NUDEM Teste', 'Casa Teste Longe']);
    expect(r.pontos[0].distanciaTexto).toMatch(/ m$/);
  });

  test('filtra por tipo', () => {
    expect(ctx.ServicoPontos.proximos(CENTRO, ['NUDEM']).pontos.map((p) => p.nome)).toEqual(['NUDEM Teste']);
  });

  test('sem GPS: devolve todos os validados em ordem alfabética, sem distância', () => {
    const r = ctx.ServicoPontos.proximos(null, ['DEAM', 'NUDEM', 'CASA_DA_MULHER']);
    expect(r.comDistancia).toBe(false);
    expect(r.pontos.map((p) => p.nome)).toEqual(['Casa Teste Longe', 'DEAM Teste Perto', 'NUDEM Teste']);
    expect(r.pontos[0].distanciaKm).toBeNull();
    expect(ctx.ServicoPontos.proximos(null, ['NUDEM']).pontos).toHaveLength(1);
  });

  test('o valor booleano "validado" sobrevive à ida e volta pela planilha', () => {
    expect(ctx.planilha().linhas('PontosSeguros')[3].validado).toBe(false);
    expect(ctx.ServicoPontos.listarValidados()).toHaveLength(3);
  });
});

describe('RF05 · rota segura', () => {
  test('rota até destino validado com passos sem HTML e link do Google Maps', () => {
    const r = ctx.ServicoPontos.rota(CENTRO, pontos[0].id, 'WALKING');
    expect(r.destino.nome).toBe('DEAM Teste Perto');
    expect(r.rota.distanciaTexto).toBe('1,2 km');
    expect(r.rota.passos[0]).toBe('Siga pela Av. Tancredo Neves (800 m)');
    expect(r.rota.passos[1]).toBe('Vire à direita — Destino à esquerda (400 m)');
    expect(r.linkGoogleMaps).toContain('travelmode=walking');
    expect(r.aviso).toMatch(/iluminadas/);
    expect(ctx.fakes.maps.ultimaRequisicao).toEqual(expect.objectContaining({ modo: 'walking', destino: { lat: -12.972, lng: -38.502 } }));
  });

  test('critério de aceite: destino não validado é recusado', () => {
    expect(() => ctx.ServicoPontos.rota(CENTRO, pontos[3].id, 'WALKING')).toThrow(expect.objectContaining({ codigo: 'DESTINO_NAO_VALIDADO' }));
    expect(() => ctx.ServicoPontos.rota(CENTRO, 'inexistente', 'WALKING')).toThrow(expect.objectContaining({ codigo: 'DESTINO_NAO_VALIDADO' }));
    expect(ctx.fakes.maps.rotas).toBe(0);
  });

  test('modo desconhecido cai para caminhada', () => {
    expect(ctx.ServicoPontos.rota(CENTRO, pontos[0].id, 'HELICOPTERO').modo).toBe('WALKING');
  });

  test('Maps indisponível: devolve o link do Google Maps como alternativa (RNF06)', () => {
    ctx.fakes.maps.falhar = true;
    const r = ctx.ServicoPontos.rota(CENTRO, pontos[0].id, 'DRIVING');
    expect(r.rota).toBeNull();
    expect(r.linkGoogleMaps).toContain('travelmode=driving');
    expect(r.mensagem).toMatch(/indisponível/);
    expect(r.destino.distanciaTexto).toBeTruthy();
  });

  test('Maps sem resultado: mesma alternativa', () => {
    ctx.fakes.maps.resposta = { routes: [] };
    expect(ctx.ServicoPontos.rota(CENTRO, pontos[0].id, 'TRANSIT').rota).toBeNull();
  });

  test('sem localização: não chama o Maps e orienta usar o link', () => {
    const r = ctx.ServicoPontos.rota(null, pontos[0].id, 'WALKING');
    expect(r.rota).toBeNull();
    expect(r.linkGoogleMaps).not.toContain('origin=');
    expect(ctx.fakes.maps.rotas).toBe(0);
  });

  test('informações jurídicas (RF08)', () => {
    expect(ctx.ServicoPontos.juridico().titulo).toContain('NUDEM');
  });
});

describe('carga inicial (setup)', () => {
  test('geocodifica os endereços; ponto sem geocodificação fica NÃO validado', () => {
    const c = carregarApp('aurora');
    let n = 0;
    c.fakes.maps.geocodificar = (endereco) => (endereco.includes('Periperi') ? null : { lat: -12.98 + n++ * 0.001, lng: -38.45 });
    const inseridos = c.ServicoPontos.carregarIniciais();
    expect(inseridos).toBe(c.DadosIniciais.PONTOS.length);
    const periperi = c.Repositorio.buscar('PontosSeguros', (p) => p.nome === 'DEAM Periperi');
    expect(periperi.validado).toBe(false);
    expect(c.ServicoPontos.listarValidados()).toHaveLength(c.DadosIniciais.PONTOS.length - 1);
  });

  test('é idempotente: não duplica pontos se já houver carga', () => {
    expect(ctx.ServicoPontos.carregarIniciais()).toBe(0);
  });

  test('erro no geocodificador não interrompe a carga', () => {
    const c = carregarApp('aurora');
    c.fakes.maps.geocodificar = () => {
      throw new Error('quota');
    };
    expect(c.ServicoPontos.carregarIniciais()).toBe(c.DadosIniciais.PONTOS.length);
    expect(c.ServicoPontos.listarValidados()).toHaveLength(0);
  });

  test('todos os pontos iniciais têm tipo conhecido e fonte pública', () => {
    ctx.DadosIniciais.PONTOS.forEach((p) => {
      expect(Object.keys(ctx.Geo.TIPOS_PONTO)).toContain(p.tipo);
      expect(p.fonte).toMatch(/^https:\/\//);
    });
  });
});
