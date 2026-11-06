/**
 * RF05 — Rotas seguras | RF06 — Pontos seguros próximos.
 * Critério de aceite: retornar exclusivamente destinos oficiais validados.
 */
var ServicoPontos = (function () {
  var AVISO_ROTA =
    'Prefira ruas movimentadas e iluminadas. Se perceber que está sendo seguida, ' +
    'entre em um estabelecimento aberto e acione o botão de ajuda.';

  function publico_(p) {
    return {
      id: p.id,
      nome: p.nome,
      tipo: p.tipo,
      tipoDescricao: Geo.TIPOS_PONTO[p.tipo],
      endereco: p.endereco,
      bairro: p.bairro,
      telefone: p.telefone,
      horario: p.horario,
      lat: p.lat,
      lng: p.lng,
      distanciaKm: p.distanciaKm === undefined ? null : p.distanciaKm,
      distanciaTexto: p.distanciaKm === undefined ? '' : Geo.formatarDistancia(p.distanciaKm),
    };
  }

  function listarValidados() {
    return Repositorio.listar('PontosSeguros', Geo.pontoElegivel);
  }

  /** @return {{comDistancia:boolean, pontos:Array}} */
  function proximos(coordenada, tipos, limite) {
    var origem = Geo.normalizarCoordenada(coordenada);
    var validos = listarValidados();
    if (!origem) {
      // Sem GPS: lista todos, em ordem alfabética, para a usuária não ficar sem opção
      var lista = validos
        .filter(function (p) {
          return !tipos || !tipos.length || tipos.indexOf(p.tipo) !== -1;
        })
        .sort(function (a, b) {
          return a.nome.localeCompare(b.nome);
        });
      return { comDistancia: false, pontos: lista.map(publico_) };
    }
    var perto = Geo.pontosProximos(origem, validos, { tipos: tipos, limite: limite || Config.LIMITE_PONTOS_PROXIMOS });
    return { comDistancia: true, pontos: perto.map(publico_) };
  }

  function maisProximo(coordenada) {
    var r = proximos(coordenada, null, 1);
    return r.comDistancia && r.pontos.length ? r.pontos[0] : null;
  }

  function rota(coordenada, pontoId, modo) {
    var ponto = Repositorio.buscarPorId('PontosSeguros', pontoId);
    if (!Geo.pontoElegivel(ponto)) {
      throw Erros.criar('DESTINO_NAO_VALIDADO', 'Este destino não está na lista de locais oficiais de atendimento.');
    }
    var m = Geo.modoValido(modo) ? modo : 'WALKING';
    var origem = Geo.normalizarCoordenada(coordenada);
    var destino = { lat: ponto.lat, lng: ponto.lng };
    var resultado = {
      destino: publico_(ponto),
      modo: m,
      rota: null,
      linkGoogleMaps: Geo.linkRota(origem, destino, m),
      aviso: AVISO_ROTA,
    };
    if (!origem) {
      resultado.mensagem = 'Não conseguimos sua localização. Abra no Google Maps para traçar a rota.';
      return resultado;
    }
    resultado.destino.distanciaKm = Math.round(Geo.distanciaKm(origem, destino) * 100) / 100;
    resultado.destino.distanciaTexto = Geo.formatarDistancia(resultado.destino.distanciaKm);
    try {
      resultado.rota = MapsGateway.rota(origem, destino, m);
    } catch (e) {
      Log.aviso('ROTA_INDISPONIVEL', String(e && e.message).substring(0, 120));
    }
    if (!resultado.rota) resultado.mensagem = 'Rota detalhada indisponível agora. Use o botão do Google Maps.';
    return resultado;
  }

  /** Carga inicial (setup): insere os pontos e geocodifica os endereços. */
  function carregarIniciais() {
    if (Repositorio.contar('PontosSeguros') > 0) return 0;
    var agora = Ambiente.agora().toISOString();
    var inseridos = 0;
    DadosIniciais.PONTOS.forEach(function (p) {
      var coord = null;
      try {
        coord = MapsGateway.geocodificar(p.geocodificar || p.endereco);
      } catch (e) {
        coord = null;
      }
      Repositorio.inserir('PontosSeguros', {
        nome: p.nome,
        tipo: p.tipo,
        endereco: p.endereco,
        bairro: p.bairro,
        telefone: p.telefone,
        horario: p.horario,
        lat: coord ? coord.lat : null,
        lng: coord ? coord.lng : null,
        validado: !!coord,
        fonte: p.fonte,
        atualizadoEm: agora,
      });
      inseridos++;
    });
    return inseridos;
  }

  return {
    listarValidados: listarValidados,
    proximos: proximos,
    maisProximo: maisProximo,
    rota: rota,
    carregarIniciais: carregarIniciais,
    juridico: function () {
      return DadosIniciais.JURIDICO;
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { ServicoPontos: ServicoPontos };
