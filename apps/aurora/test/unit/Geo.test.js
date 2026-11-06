/**
 * RF05 / RF06 — regras geográficas.
 * Critério de aceite (A3, slide 11): "retorno exclusivo de destinos oficiais
 * validados próximos ao local da solicitação".
 */
const { carregarNucleo } = require('../../../../test/helpers/carregarApp');

let Geo;
beforeAll(() => {
  ({ Geo } = carregarNucleo('aurora'));
});

const SALVADOR = { lat: -12.9714, lng: -38.5014 };

function ponto(id, lat, lng, extra = {}) {
  return { id, nome: 'Ponto ' + id, tipo: 'DEAM', lat, lng, validado: true, ...extra };
}

describe('validação de coordenadas', () => {
  test.each([
    [{ lat: -12.97, lng: -38.5 }, true],
    [{ lat: 90, lng: 180 }, true],
    [{ lat: -90, lng: -180 }, true],
    [{ lat: 90.0001, lng: 0.1 }, false],
    [{ lat: 0.1, lng: -180.0001 }, false],
    [{ lat: 0, lng: 0 }, false], // "ilha nula": GPS sem fix devolve 0,0
    [{ lat: '12', lng: '38' }, false],
    [{ lat: NaN, lng: 1 }, false],
    [{ lat: Infinity, lng: 1 }, false],
    [null, false],
  ])('%j -> %s', (c, esperado) => {
    expect(Geo.validarCoordenada(c)).toBe(esperado);
  });

  test('normalizarCoordenada converte strings do navegador e descarta precisão inválida', () => {
    expect(Geo.normalizarCoordenada({ lat: '-12.9', lng: '-38.5', precisao: '15' })).toEqual({ lat: -12.9, lng: -38.5, precisao: 15 });
    expect(Geo.normalizarCoordenada({ lat: -12.9, lng: -38.5, precisao: -3 }).precisao).toBeNull();
    expect(Geo.normalizarCoordenada({ lat: -12.9, lng: -38.5 }).precisao).toBeNull();
    expect(Geo.normalizarCoordenada({ lat: 'x', lng: 1 })).toBeNull();
    expect(Geo.normalizarCoordenada(undefined)).toBeNull();
  });
});

describe('distância (Haversine)', () => {
  test('1 grau de longitude no Equador ≈ 111,19 km', () => {
    expect(Geo.distanciaKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 1);
  });
  test('mesmo ponto = 0', () => {
    expect(Geo.distanciaKm(SALVADOR, SALVADOR)).toBe(0);
  });
  test('é simétrica', () => {
    const b = { lat: -12.88, lng: -38.47 };
    expect(Geo.distanciaKm(SALVADOR, b)).toBeCloseTo(Geo.distanciaKm(b, SALVADOR), 10);
  });
  test('área atendida: Salvador sim, São Paulo não', () => {
    expect(Geo.estaNaAreaAtendida(SALVADOR)).toBe(true);
    expect(Geo.estaNaAreaAtendida({ lat: -23.55, lng: -46.63 })).toBe(false);
  });
});

describe('RF06 · pontos seguros próximos', () => {
  const pontos = [
    ponto('longe', -12.85, -38.45),
    ponto('perto', -12.972, -38.502),
    ponto('medio', -12.99, -38.49, { tipo: 'NUDEM' }),
    ponto('nao-validado', -12.9715, -38.5015, { validado: false }),
    ponto('validado-string', -12.9716, -38.5016, { validado: 'TRUE' }),
    ponto('sem-coordenada', null, null),
    ponto('tipo-desconhecido', -12.9714, -38.5014, { tipo: 'BAR' }),
  ];

  test('retorna apenas destinos oficiais validados, do mais perto ao mais longe', () => {
    const r = Geo.pontosProximos(SALVADOR, pontos);
    expect(r.map((p) => p.id)).toEqual(['perto', 'medio', 'longe']);
  });

  test('nunca retorna ponto não validado, mesmo sendo o mais próximo', () => {
    const ids = Geo.pontosProximos(SALVADOR, pontos, { limite: 50 }).map((p) => p.id);
    expect(ids).not.toContain('nao-validado');
    expect(ids).not.toContain('validado-string');
    expect(ids).not.toContain('sem-coordenada');
    expect(ids).not.toContain('tipo-desconhecido');
  });

  test('respeita limite, filtro de tipo e raio', () => {
    expect(Geo.pontosProximos(SALVADOR, pontos, { limite: 1 }).map((p) => p.id)).toEqual(['perto']);
    expect(Geo.pontosProximos(SALVADOR, pontos, { tipos: ['NUDEM'] }).map((p) => p.id)).toEqual(['medio']);
    expect(Geo.pontosProximos(SALVADOR, pontos, { raioKm: 5 }).map((p) => p.id)).toEqual(['perto', 'medio']);
  });

  test('inclui distância arredondada e descrição do tipo sem alterar o original', () => {
    const [p] = Geo.pontosProximos(SALVADOR, pontos, { limite: 1 });
    expect(p.distanciaKm).toBeGreaterThan(0);
    expect(p.tipoDescricao).toBe('Delegacia da Mulher (DEAM)');
    expect(pontos[1]).not.toHaveProperty('distanciaKm');
  });

  test('origem inválida retorna lista vazia', () => {
    expect(Geo.pontosProximos({ lat: 0, lng: 0 }, pontos)).toEqual([]);
    expect(Geo.pontosProximos(SALVADOR, null)).toEqual([]);
  });
});

describe('RF05 · links e formatação', () => {
  test('linkRota com origem, destino e modo', () => {
    const url = Geo.linkRota(SALVADOR, { lat: -12.98, lng: -38.45 }, 'TRANSIT');
    expect(url).toContain('destination=-12.98,-38.45');
    expect(url).toContain('origin=-12.9714,-38.5014');
    expect(url).toContain('travelmode=transit');
  });
  test('linkRota sem origem e com modo desconhecido usa caminhada', () => {
    const url = Geo.linkRota(null, { lat: -12.98, lng: -38.45 }, 'FOGUETE');
    expect(url).not.toContain('origin=');
    expect(url).toContain('travelmode=walking');
  });
  test('modoValido', () => {
    expect(Geo.modoValido('WALKING')).toBe(true);
    expect(Geo.modoValido('walking')).toBe(false);
  });
  test('formatarDistancia: metros abaixo de 1 km, km com vírgula acima', () => {
    expect(Geo.formatarDistancia(0.35)).toBe('350 m');
    expect(Geo.formatarDistancia(1)).toBe('1,0 km');
    expect(Geo.formatarDistancia(12.345)).toBe('12,3 km');
    expect(Geo.formatarDistancia(null)).toBe('');
  });
  test('linkMapa', () => {
    expect(Geo.linkMapa({ lat: 1, lng: 2 })).toBe('https://www.google.com/maps/search/?api=1&query=1,2');
  });
});
