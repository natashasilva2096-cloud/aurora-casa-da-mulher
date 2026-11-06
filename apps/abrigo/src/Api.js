/**
 * Fachada do Aurora Abrigo (google.script.run). Mesmo formato de resposta do Aurora.
 */
function executar_(operacao, fn) {
  try {
    return { ok: true, dados: fn() };
  } catch (e) {
    if (Erros.ehDeNegocio(e)) return { ok: false, codigo: e.codigo, mensagem: e.mensagem, detalhes: e.detalhes || null };
    Log.erro('ERRO_INTERNO', { op: operacao, msg: String(e && e.message ? e.message : e).substring(0, 200) });
    return { ok: false, codigo: 'ERRO_INTERNO', mensagem: 'Algo deu errado. Tente novamente mais tarde.', detalhes: null };
  }
}

function api_cadastrarAnfitriao(dados) {
  return executar_('cadastrarAnfitriao', function () {
    return ServicoAnfitriao.cadastrar(dados);
  });
}

function api_consultarStatus(protocolo, email) {
  return executar_('consultarStatus', function () {
    return ServicoAnfitriao.consultarStatus(protocolo, email);
  });
}

function api_infoPrograma() {
  return executar_('infoPrograma', function () {
    return { modulos: Anfitriao.MODULOS_CAPACITACAO, limites: Anfitriao.LIMITES };
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    executar_: executar_,
    api_cadastrarAnfitriao: api_cadastrarAnfitriao,
    api_consultarStatus: api_consultarStatus,
    api_infoPrograma: api_infoPrograma,
  };
}
