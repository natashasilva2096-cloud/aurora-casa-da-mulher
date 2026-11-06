/**
 * Fachada chamada pela interface via google.script.run.
 * Toda resposta tem o formato { ok: true, dados } ou { ok: false, codigo, mensagem, detalhes }.
 * Funções terminadas em "_" são privadas (o google.script.run não consegue chamá-las).
 */
function executar_(operacao, fn) {
  try {
    return { ok: true, dados: fn() };
  } catch (e) {
    if (Erros.ehDeNegocio(e)) {
      return { ok: false, codigo: e.codigo, mensagem: e.mensagem, detalhes: e.detalhes || null };
    }
    Log.erro('ERRO_INTERNO', { op: operacao, msg: String(e && e.message ? e.message : e).substring(0, 200) });
    return {
      ok: false,
      codigo: 'ERRO_INTERNO',
      mensagem: 'Algo deu errado. Tente de novo. Em emergência, ligue 190.',
      detalhes: null,
    };
  }
}

// ---- RF01: conta -------------------------------------------------------
function api_cadastrar(dados) {
  return executar_('cadastrar', function () {
    return ServicoUsuaria.cadastrar(dados);
  });
}
function api_entrar(email, senha) {
  return executar_('entrar', function () {
    return ServicoUsuaria.entrar(email, senha);
  });
}
function api_sair(token) {
  return executar_('sair', function () {
    return ServicoUsuaria.sair(token);
  });
}
function api_perfil(token) {
  return executar_('perfil', function () {
    var s = Sessao.exigir(token);
    return { usuaria: ServicoUsuaria.obter(s), alertaAtivo: ServicoAlerta.statusAtual(s) };
  });
}
function api_excluirConta(token, senha) {
  return executar_('excluirConta', function () {
    return ServicoUsuaria.excluirConta(Sessao.exigir(token), senha);
  });
}

// ---- RF02: contatos ----------------------------------------------------
function api_listarContatos(token) {
  return executar_('listarContatos', function () {
    return ServicoContatos.listar(Sessao.exigir(token));
  });
}
function api_salvarContato(token, contato) {
  return executar_('salvarContato', function () {
    return ServicoContatos.salvar(Sessao.exigir(token), contato);
  });
}
function api_removerContato(token, id) {
  return executar_('removerContato', function () {
    return ServicoContatos.remover(Sessao.exigir(token), id);
  });
}

// ---- RF03/RF04: botão de pânico ----------------------------------------
function api_acionarPanico(token, coordenada) {
  return executar_('acionarPanico', function () {
    return ServicoAlerta.acionar(Sessao.exigir(token), coordenada);
  });
}
function api_atualizarLocalizacao(token, acionamentoId, coordenada) {
  return executar_('atualizarLocalizacao', function () {
    return ServicoAlerta.atualizarLocalizacao(Sessao.exigir(token), acionamentoId, coordenada);
  });
}
function api_encerrarAlerta(token, acionamentoId) {
  return executar_('encerrarAlerta', function () {
    return ServicoAlerta.encerrar(Sessao.exigir(token), acionamentoId);
  });
}
/** Público: usado pela página de acompanhamento dos contatos. */
function api_rastreio(tokenRastreio) {
  return executar_('rastreio', function () {
    return ServicoAlerta.rastreio(tokenRastreio);
  });
}

// ---- RF05/RF06: pontos e rotas (públicos: não exigem login) ------------
function api_pontosProximos(coordenada, tipos) {
  return executar_('pontosProximos', function () {
    return ServicoPontos.proximos(coordenada, tipos || null);
  });
}
function api_rotaSegura(coordenada, pontoId, modo) {
  return executar_('rotaSegura', function () {
    return ServicoPontos.rota(coordenada, pontoId, modo);
  });
}
function api_infoJuridico() {
  return executar_('infoJuridico', function () {
    return ServicoPontos.juridico();
  });
}

// ---- RF07/RF08: atendimento --------------------------------------------
function api_solicitarAtendimento(token, solicitacao) {
  return executar_('solicitarAtendimento', function () {
    return ServicoAtendimento.solicitar(Sessao.exigir(token), solicitacao);
  });
}
function api_meusAtendimentos(token) {
  return executar_('meusAtendimentos', function () {
    return ServicoAtendimento.listarMeus(Sessao.exigir(token));
  });
}
function api_cancelarAtendimento(token, id) {
  return executar_('cancelarAtendimento', function () {
    return ServicoAtendimento.cancelar(Sessao.exigir(token), id);
  });
}

// ---- Painel da equipe (CT-ACE01) ----------------------------------------
function api_equipeListar(token, status) {
  return executar_('equipeListar', function () {
    return ServicoAtendimento.listarEquipe(Sessao.exigir(token), status || null);
  });
}
function api_equipeAtualizar(token, id, novoStatus) {
  return executar_('equipeAtualizar', function () {
    return ServicoAtendimento.atualizarStatusEquipe(Sessao.exigir(token), id, novoStatus);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    executar_: executar_,
    api_cadastrar: api_cadastrar,
    api_entrar: api_entrar,
    api_sair: api_sair,
    api_perfil: api_perfil,
    api_excluirConta: api_excluirConta,
    api_listarContatos: api_listarContatos,
    api_salvarContato: api_salvarContato,
    api_removerContato: api_removerContato,
    api_acionarPanico: api_acionarPanico,
    api_atualizarLocalizacao: api_atualizarLocalizacao,
    api_encerrarAlerta: api_encerrarAlerta,
    api_rastreio: api_rastreio,
    api_pontosProximos: api_pontosProximos,
    api_rotaSegura: api_rotaSegura,
    api_infoJuridico: api_infoJuridico,
    api_solicitarAtendimento: api_solicitarAtendimento,
    api_meusAtendimentos: api_meusAtendimentos,
    api_cancelarAtendimento: api_cancelarAtendimento,
    api_equipeListar: api_equipeListar,
    api_equipeAtualizar: api_equipeAtualizar,
  };
}
