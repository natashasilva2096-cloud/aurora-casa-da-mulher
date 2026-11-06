/**
 * Regras do botão de pânico (RF03, RF04). Funções puras.
 *
 * Máquina de estados do acionamento (técnica: transição de estados):
 *
 *   (nenhum) --ACIONAR--> ATIVO --ATUALIZAR--> ATIVO
 *                         ATIVO --ENCERRAR---> ENCERRADO
 *                         ATIVO --EXPIRAR----> EXPIRADO
 *   Qualquer outra combinação é inválida.
 */
var Alerta = (function () {
  var STATUS = { ATIVO: 'ATIVO', ENCERRADO: 'ENCERRADO', EXPIRADO: 'EXPIRADO' };
  var EVENTOS = { ACIONAR: 'ACIONAR', ATUALIZAR: 'ATUALIZAR', ENCERRAR: 'ENCERRAR', EXPIRAR: 'EXPIRAR' };

  var TRANSICOES = {
    '': { ACIONAR: 'ATIVO' },
    ATIVO: { ATUALIZAR: 'ATIVO', ENCERRAR: 'ENCERRADO', EXPIRAR: 'EXPIRADO' },
    ENCERRADO: {},
    EXPIRADO: {},
  };

  function transicionar(statusAtual, evento) {
    var origem = statusAtual || '';
    var mapa = TRANSICOES[origem];
    if (!mapa || !mapa[evento]) {
      throw Erros.criar('TRANSICAO_INVALIDA', 'Não é possível ' + String(evento).toLowerCase() + ' um alerta ' + (origem || 'inexistente').toLowerCase() + '.');
    }
    return mapa[evento];
  }

  function podeTransicionar(statusAtual, evento) {
    var mapa = TRANSICOES[statusAtual || ''];
    return !!(mapa && mapa[evento]);
  }

  /** Alerta ATIVO há mais tempo que a validade deve expirar (o link de rastreio deixa de funcionar). */
  function estaExpirado(acionamento, agora, horasValidade) {
    if (!acionamento || acionamento.status !== STATUS.ATIVO) return false;
    var inicio = new Date(acionamento.inicio).getTime();
    if (isNaN(inicio)) return true;
    return agora.getTime() - inicio > horasValidade * 3600 * 1000;
  }

  /** Contatos que podem receber o alerta: e-mail válido, sem duplicidade. */
  function contatosElegiveis(contatos) {
    var vistos = {};
    return (contatos || []).filter(function (c) {
      var email = Validacao.normalizarEmail(c && c.email);
      if (!Validacao.validarEmail(email) || vistos[email]) return false;
      vistos[email] = true;
      return true;
    });
  }

  function primeiroNome(nome) {
    var n = String(nome || '').trim();
    return n ? n.split(/\s+/)[0] : 'Uma pessoa';
  }

  function escaparHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Mensagem enviada aos contatos de confiança (CT-INT02: "mensagem enviada com link").
   * @param {{nomeUsuaria:string, nomeContato?:string, linkRastreio:string, coordenada?:object,
   *          dataHoraTexto:string, pontoMaisProximo?:object}} d
   */
  function montarMensagem(d) {
    var nome = primeiroNome(d.nomeUsuaria);
    var temLocal = Geo.validarCoordenada(d.coordenada);
    var linhas = [
      (d.nomeContato ? 'Olá, ' + primeiroNome(d.nomeContato) + '.' : 'Olá.'),
      '',
      nome + ' acionou o pedido de ajuda no app Aurora às ' + d.dataHoraTexto + ' e cadastrou você como contato de confiança.',
      '',
      temLocal
        ? 'Acompanhe a localização em tempo real: ' + d.linkRastreio
        : 'A localização não pôde ser obtida no momento. O link abaixo será atualizado assim que ela estiver disponível: ' + d.linkRastreio,
    ];
    if (temLocal) linhas.push('Última posição no mapa: ' + Geo.linkMapa(d.coordenada));
    if (d.pontoMaisProximo) {
      linhas.push('Ponto de atendimento mais próximo: ' + d.pontoMaisProximo.nome + ' (' + (d.pontoMaisProximo.endereco || '') + ').');
    }
    linhas.push('');
    linhas.push('O que fazer: tente falar com ' + nome + ' e, se não conseguir ou houver risco, ligue 190 (Polícia Militar).');
    linhas.push('Central de Atendimento à Mulher: 180.');
    linhas.push('');
    linhas.push('Não encaminhe esta mensagem para outras pessoas.');

    var texto = linhas.join('\n');
    var html = linhas
      .map(function (l) {
        var seguro = escaparHtml(l);
        return seguro.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
      })
      .join('<br>');

    return {
      assunto: 'URGENTE: ' + nome + ' pediu ajuda (Aurora)',
      texto: texto,
      html: '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">' + html + '</div>',
    };
  }

  function montarMensagemEncerramento(d) {
    var nome = primeiroNome(d.nomeUsuaria);
    var texto = nome + ' encerrou o pedido de ajuda no app Aurora às ' + d.dataHoraTexto +
      ' e informou que está em segurança. O link de acompanhamento foi desativado.';
    return { assunto: 'Aurora: ' + nome + ' está em segurança', texto: texto, html: '<p>' + escaparHtml(texto) + '</p>' };
  }

  /** Consolida o resultado do envio para exibir o status na tela (RF03.4). */
  function resumoEnvio(resultados) {
    var r = resultados || [];
    var enviados = r.filter(function (x) {
      return x.ok;
    }).length;
    var falhas = r.length - enviados;
    var situacao = r.length === 0 ? 'SEM_CONTATOS' : falhas === 0 ? 'ENVIADO' : enviados === 0 ? 'FALHOU' : 'PARCIAL';
    return { total: r.length, enviados: enviados, falhas: falhas, situacao: situacao };
  }

  return {
    STATUS: STATUS,
    EVENTOS: EVENTOS,
    transicionar: transicionar,
    podeTransicionar: podeTransicionar,
    estaExpirado: estaExpirado,
    contatosElegiveis: contatosElegiveis,
    primeiroNome: primeiroNome,
    escaparHtml: escaparHtml,
    montarMensagem: montarMensagem,
    montarMensagemEncerramento: montarMensagemEncerramento,
    resumoEnvio: resumoEnvio,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Alerta: Alerta };
