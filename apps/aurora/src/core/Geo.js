/**
 * Regras geográficas (RF04, RF05, RF06). Funções puras.
 */
var Geo = (function () {
  var RAIO_TERRA_KM = 6371;

  var TIPOS_PONTO = {
    CASA_DA_MULHER: 'Casa da Mulher',
    DEAM: 'Delegacia da Mulher (DEAM)',
    NUDEM: 'Defensoria Pública (NUDEM)',
    CRAM: 'Centro de Referência / Atendimento Psicossocial',
    CASA_ACOLHIMENTO: 'Casa de Acolhimento',
    UNIDADE_SAUDE: 'Unidade de Saúde',
  };

  var MODOS_ROTA = ['WALKING', 'DRIVING', 'TRANSIT'];

  // Região Metropolitana de Salvador (aproximação por retângulo)
  var AREA_ATENDIDA = { latMin: -13.1, latMax: -12.5, lngMin: -38.75, lngMax: -38.1 };

  function ehNumero_(v) {
    return typeof v === 'number' && isFinite(v);
  }

  /** Coordenada válida: números finitos, dentro dos limites, e não a "ilha nula" (0,0). */
  function validarCoordenada(c) {
    if (!c) return false;
    var lat = c.lat;
    var lng = c.lng;
    if (!ehNumero_(lat) || !ehNumero_(lng)) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    if (lat === 0 && lng === 0) return false;
    return true;
  }

  /** Normaliza o que vem do navegador ({lat,lng,precisao}) ou retorna null. */
  function normalizarCoordenada(c) {
    if (!c) return null;
    var n = { lat: Number(c.lat), lng: Number(c.lng), precisao: c.precisao === undefined || c.precisao === null ? null : Number(c.precisao) };
    if (!validarCoordenada(n)) return null;
    if (n.precisao !== null && !(n.precisao >= 0)) n.precisao = null;
    return n;
  }

  function radianos_(g) {
    return (g * Math.PI) / 180;
  }

  /** Distância em km pela fórmula de Haversine. */
  function distanciaKm(a, b) {
    var dLat = radianos_(b.lat - a.lat);
    var dLng = radianos_(b.lng - a.lng);
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(radianos_(a.lat)) * Math.cos(radianos_(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * RAIO_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function estaNaAreaAtendida(c) {
    return (
      validarCoordenada(c) &&
      c.lat >= AREA_ATENDIDA.latMin && c.lat <= AREA_ATENDIDA.latMax &&
      c.lng >= AREA_ATENDIDA.lngMin && c.lng <= AREA_ATENDIDA.lngMax
    );
  }

  /** Critério de aceite RF05: só destinos oficiais VALIDADOS e com coordenada. */
  function pontoElegivel(p) {
    return !!p && p.validado === true && !!TIPOS_PONTO[p.tipo] && validarCoordenada({ lat: p.lat, lng: p.lng });
  }

  /**
   * RF06 — pontos seguros mais próximos da origem.
   * @param {{lat:number,lng:number}} origem
   * @param {Array} pontos
   * @param {{tipos?:string[], limite?:number, raioKm?:number}=} opcoes
   */
  function pontosProximos(origem, pontos, opcoes) {
    var o = opcoes || {};
    if (!validarCoordenada(origem)) return [];
    var tipos = o.tipos && o.tipos.length ? o.tipos : null;
    var limite = o.limite || 5;
    return (pontos || [])
      .filter(pontoElegivel)
      .filter(function (p) {
        return !tipos || tipos.indexOf(p.tipo) !== -1;
      })
      .map(function (p) {
        var copia = {};
        Object.keys(p).forEach(function (k) {
          copia[k] = p[k];
        });
        copia.distanciaKm = Math.round(distanciaKm(origem, p) * 100) / 100;
        copia.tipoDescricao = TIPOS_PONTO[p.tipo];
        return copia;
      })
      .filter(function (p) {
        return !o.raioKm || p.distanciaKm <= o.raioKm;
      })
      .sort(function (a, b) {
        return a.distanciaKm - b.distanciaKm;
      })
      .slice(0, limite);
  }

  function linkMapa(c) {
    return 'https://www.google.com/maps/search/?api=1&query=' + c.lat + ',' + c.lng;
  }

  function linkRota(origem, destino, modo) {
    var mapa = { WALKING: 'walking', DRIVING: 'driving', TRANSIT: 'transit' };
    var url = 'https://www.google.com/maps/dir/?api=1&destination=' + destino.lat + ',' + destino.lng;
    if (validarCoordenada(origem)) url += '&origin=' + origem.lat + ',' + origem.lng;
    return url + '&travelmode=' + (mapa[modo] || 'walking');
  }

  function modoValido(modo) {
    return MODOS_ROTA.indexOf(modo) !== -1;
  }

  function formatarDistancia(km) {
    if (!ehNumero_(km)) return '';
    return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km';
  }

  return {
    TIPOS_PONTO: TIPOS_PONTO,
    MODOS_ROTA: MODOS_ROTA,
    validarCoordenada: validarCoordenada,
    normalizarCoordenada: normalizarCoordenada,
    distanciaKm: distanciaKm,
    estaNaAreaAtendida: estaNaAreaAtendida,
    pontoElegivel: pontoElegivel,
    pontosProximos: pontosProximos,
    linkMapa: linkMapa,
    linkRota: linkRota,
    modoValido: modoValido,
    formatarDistancia: formatarDistancia,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Geo: Geo };
