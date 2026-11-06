/**
 * Integração com o serviço Maps nativo do Apps Script (RF05).
 * Não exige chave de API; usa a cota do Apps Script.
 */
var MapsGateway = (function () {
  function limparHtml_(s) {
    return String(s || '')
      .replace(/<div[^>]*>/gi, ' — ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * @return {{distanciaTexto:string, duracaoTexto:string, distanciaM:number, duracaoS:number, passos:string[]}|null}
   */
  function rota(origem, destino, modo) {
    var modos = {
      WALKING: Maps.DirectionFinder.Mode.WALKING,
      DRIVING: Maps.DirectionFinder.Mode.DRIVING,
      TRANSIT: Maps.DirectionFinder.Mode.TRANSIT,
    };
    var resp = Maps.newDirectionFinder()
      .setOrigin(origem.lat, origem.lng)
      .setDestination(destino.lat, destino.lng)
      .setMode(modos[modo] || modos.WALKING)
      .setLanguage('pt-BR')
      .setRegion('br')
      .getDirections();
    if (!resp || !resp.routes || !resp.routes.length) return null;
    var perna = resp.routes[0].legs[0];
    return {
      distanciaTexto: perna.distance.text,
      duracaoTexto: perna.duration.text,
      distanciaM: perna.distance.value,
      duracaoS: perna.duration.value,
      passos: (perna.steps || []).slice(0, 25).map(function (p) {
        return limparHtml_(p.html_instructions) + (p.distance ? ' (' + p.distance.text + ')' : '');
      }),
    };
  }

  /** Endereço -> {lat,lng} (usado no setup para posicionar os pontos seguros). */
  function geocodificar(endereco) {
    var r = Maps.newGeocoder().setRegion('br').setLanguage('pt-BR').geocode(endereco);
    if (!r || r.status !== 'OK' || !r.results.length) return null;
    var loc = r.results[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng };
  }

  return { rota: rota, geocodificar: geocodificar, limparHtml_: limparHtml_ };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { MapsGateway: MapsGateway };
