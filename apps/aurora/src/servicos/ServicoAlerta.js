/**
 * RF03 — Botão de pânico | RF04 — Localização em tempo real.
 *
 * Decisões de confiabilidade (RNF05/RNF06, ver docs/manutencao-e-correcao.md — FMECA):
 *  - O alerta é registrado e enviado MESMO sem GPS (localização chega depois).
 *  - Acionar duas vezes não duplica o alerta (idempotente enquanto ATIVO).
 *  - Cada e-mail tem nova tentativa; o resultado por contato vira status na tela.
 *  - Falha de um contato não impede o envio aos demais.
 */
var ServicoAlerta = (function () {
  var FUSO = 'America/Bahia';

  function dataHoraTexto_(d) {
    return Utilities.formatDate(d, FUSO, "HH:mm 'de' dd/MM/yyyy");
  }

  function linkRastreio_(token) {
    return Ambiente.urlApp() + '?page=rastreio&t=' + token;
  }

  function alertaAtivo_(usuariaId) {
    var lista = Repositorio.listar('Acionamentos', function (a) {
      return a.usuariaId === usuariaId && a.status === Alerta.STATUS.ATIVO;
    });
    return lista.length ? lista[lista.length - 1] : null;
  }

  function expirarSeNecessario_(a) {
    if (a && Alerta.estaExpirado(a, Ambiente.agora(), Config.VALIDADE_ALERTA_HORAS)) {
      return Repositorio.atualizar('Acionamentos', a.id, {
        status: Alerta.transicionar(a.status, Alerta.EVENTOS.EXPIRAR),
        fim: Ambiente.agora().toISOString(),
      });
    }
    return a;
  }

  function statusPublico_(a, extra) {
    var r = {
      acionamentoId: a.id,
      status: a.status,
      inicio: a.inicio,
      ultimaAtualizacao: a.ultimaAtualizacao,
      temLocalizacao: Geo.validarCoordenada({ lat: a.lat, lng: a.lng }),
      enviados: a.enviados || 0,
      falhas: a.falhas || 0,
      intervaloAtualizacaoSeg: Config.INTERVALO_ATUALIZACAO_LOCAL_SEG,
      emergencia: Config.TELEFONES_EMERGENCIA,
    };
    Object.keys(extra || {}).forEach(function (k) {
      r[k] = extra[k];
    });
    return r;
  }

  function registrarLocalizacao_(acionamentoId, coord, quando) {
    Repositorio.inserir('Localizacoes', {
      acionamentoId: acionamentoId,
      lat: coord.lat,
      lng: coord.lng,
      precisao: coord.precisao,
      registradoEm: quando,
    });
  }

  function enviarParaContatos_(usuaria, contatos, montar) {
    return contatos.map(function (c) {
      var msg = montar(c);
      var r = EmailGateway.enviar({ para: c.email, assunto: msg.assunto, texto: msg.texto, html: msg.html }, Config.TENTATIVAS_ENVIO_EMAIL);
      return { contatoId: c.id, ok: r.ok, erro: r.erro || null };
    });
  }

  /**
   * Aciona o pedido de ajuda.
   * @param {object} sessao
   * @param {{lat:number,lng:number,precisao?:number}|null} coordenada
   */
  function acionar(sessao, coordenada) {
    var t0 = Date.now();
    var agora = Ambiente.agora();
    var agoraIso = agora.toISOString();
    var coord = Geo.normalizarCoordenada(coordenada);
    var usuaria = Repositorio.buscarPorId('Usuarias', sessao.usuariaId);
    if (!usuaria) throw Erros.criar('SESSAO_INVALIDA', 'Conta não encontrada. Entre novamente.');

    // 1) Registrar (ou reaproveitar) o acionamento — dentro do lock para não duplicar
    var registro = Repositorio.comLock(function () {
      var existente = expirarSeNecessario_(alertaAtivo_(usuaria.id));
      if (existente && existente.status === Alerta.STATUS.ATIVO) {
        if (coord) {
          registrarLocalizacao_(existente.id, coord, agoraIso);
          existente = Repositorio.atualizar('Acionamentos', existente.id, {
            lat: coord.lat, lng: coord.lng, precisao: coord.precisao, ultimaAtualizacao: agoraIso,
          });
        }
        return { acionamento: existente, novo: false };
      }
      var novo = Repositorio.inserir('Acionamentos', {
        usuariaId: usuaria.id,
        status: Alerta.transicionar('', Alerta.EVENTOS.ACIONAR),
        tokenRastreio: Ambiente.tokenAleatorio(),
        lat: coord ? coord.lat : null,
        lng: coord ? coord.lng : null,
        precisao: coord ? coord.precisao : null,
        inicio: agoraIso,
        ultimaAtualizacao: coord ? agoraIso : '',
        enviados: 0,
        falhas: 0,
      });
      if (coord) registrarLocalizacao_(novo.id, coord, agoraIso);
      return { acionamento: novo, novo: true };
    });

    var a = registro.acionamento;
    var ponto = null;
    try {
      ponto = coord ? ServicoPontos.maisProximo(coord) : null;
    } catch (e) {
      ponto = null; // ponto mais próximo é complemento; nunca bloqueia o alerta
    }

    if (!registro.novo) {
      return statusPublico_(a, { novo: false, linkRastreio: linkRastreio_(a.tokenRastreio), pontoMaisProximo: ponto, situacaoEnvio: 'JA_ENVIADO', duracaoMs: Date.now() - t0 });
    }

    // 2) Enviar aos contatos de confiança
    var contatos = Alerta.contatosElegiveis(ServicoContatos.listarParaAlerta(usuaria.id));
    var link = linkRastreio_(a.tokenRastreio);
    var resultados = enviarParaContatos_(usuaria, contatos, function (c) {
      return Alerta.montarMensagem({
        nomeUsuaria: usuaria.nome,
        nomeContato: c.nome,
        linkRastreio: link,
        coordenada: coord,
        dataHoraTexto: dataHoraTexto_(agora),
        pontoMaisProximo: ponto,
      });
    });
    var resumo = Alerta.resumoEnvio(resultados);
    var duracao = Date.now() - t0;
    a = Repositorio.atualizar('Acionamentos', a.id, { enviados: resumo.enviados, falhas: resumo.falhas, duracaoMs: duracao });

    (resumo.situacao === 'ENVIADO' ? Log.info : Log.aviso)('ALERTA_ACIONADO', {
      id: a.id, situacao: resumo.situacao, enviados: resumo.enviados, falhas: resumo.falhas, comGps: !!coord, ms: duracao,
    });

    return statusPublico_(a, {
      novo: true,
      linkRastreio: link,
      pontoMaisProximo: ponto,
      situacaoEnvio: resumo.situacao,
      totalContatos: resumo.total,
      duracaoMs: duracao,
    });
  }

  function exigirAtivoDaUsuaria_(sessao, acionamentoId) {
    var a = Repositorio.buscarPorId('Acionamentos', acionamentoId);
    if (!a || a.usuariaId !== sessao.usuariaId) throw Erros.criar('NAO_ENCONTRADO', 'Alerta não encontrado.');
    a = expirarSeNecessario_(a);
    if (a.status !== Alerta.STATUS.ATIVO) throw Erros.criar('ALERTA_INATIVO', 'Este alerta já foi encerrado.');
    return a;
  }

  /** RF04 — chamada periodicamente pela tela enquanto o alerta está ativo. */
  function atualizarLocalizacao(sessao, acionamentoId, coordenada) {
    var coord = Geo.normalizarCoordenada(coordenada);
    if (!coord) throw Erros.criar('COORDENADA_INVALIDA', 'Localização inválida.');
    var a = exigirAtivoDaUsuaria_(sessao, acionamentoId);
    var agoraIso = Ambiente.agora().toISOString();
    Alerta.transicionar(a.status, Alerta.EVENTOS.ATUALIZAR);
    registrarLocalizacao_(a.id, coord, agoraIso);
    a = Repositorio.atualizar('Acionamentos', a.id, { lat: coord.lat, lng: coord.lng, precisao: coord.precisao, ultimaAtualizacao: agoraIso });
    return statusPublico_(a);
  }

  function encerrar(sessao, acionamentoId) {
    var a = exigirAtivoDaUsuaria_(sessao, acionamentoId);
    var agora = Ambiente.agora();
    a = Repositorio.atualizar('Acionamentos', a.id, {
      status: Alerta.transicionar(a.status, Alerta.EVENTOS.ENCERRAR),
      fim: agora.toISOString(),
    });
    var usuaria = Repositorio.buscarPorId('Usuarias', sessao.usuariaId);
    var contatos = Alerta.contatosElegiveis(ServicoContatos.listarParaAlerta(sessao.usuariaId));
    var msg = Alerta.montarMensagemEncerramento({ nomeUsuaria: usuaria ? usuaria.nome : '', dataHoraTexto: dataHoraTexto_(agora) });
    enviarParaContatos_(usuaria, contatos, function () {
      return msg;
    });
    Log.info('ALERTA_ENCERRADO', { id: a.id });
    return statusPublico_(a);
  }

  /** Status atual na tela inicial (reabre a tela de alerta se a página foi recarregada). */
  function statusAtual(sessao) {
    var a = expirarSeNecessario_(alertaAtivo_(sessao.usuariaId));
    if (!a || a.status !== Alerta.STATUS.ATIVO) return null;
    return statusPublico_(a, { linkRastreio: linkRastreio_(a.tokenRastreio) });
  }

  /** Página pública de acompanhamento aberta pelos contatos (somente com o token). */
  function rastreio(token) {
    var t = String(token || '');
    if (!/^[a-f0-9]{64}$/i.test(t)) throw Erros.criar('LINK_INVALIDO', 'Link de acompanhamento inválido.');
    var a = Repositorio.buscar('Acionamentos', function (x) {
      return x.tokenRastreio === t;
    });
    if (!a) throw Erros.criar('LINK_INVALIDO', 'Link de acompanhamento inválido.');
    a = expirarSeNecessario_(a);
    var usuaria = Repositorio.buscarPorId('Usuarias', a.usuariaId);
    var r = {
      primeiroNome: Alerta.primeiroNome(usuaria ? usuaria.nome : ''),
      status: a.status,
      inicio: a.inicio,
      intervaloAtualizacaoSeg: Config.INTERVALO_ATUALIZACAO_LOCAL_SEG,
      emergencia: Config.TELEFONES_EMERGENCIA,
    };
    // Privacidade (RNF02): a posição só é exibida enquanto o alerta está ATIVO
    if (a.status === Alerta.STATUS.ATIVO && Geo.validarCoordenada({ lat: a.lat, lng: a.lng })) {
      r.lat = a.lat;
      r.lng = a.lng;
      r.precisao = a.precisao;
      r.ultimaAtualizacao = a.ultimaAtualizacao;
      r.linkMapa = Geo.linkMapa({ lat: a.lat, lng: a.lng });
    }
    return r;
  }

  return {
    acionar: acionar,
    atualizarLocalizacao: atualizarLocalizacao,
    encerrar: encerrar,
    statusAtual: statusAtual,
    rastreio: rastreio,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { ServicoAlerta: ServicoAlerta };
