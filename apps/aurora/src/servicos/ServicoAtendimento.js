/**
 * RF07 — Agendamento psicossocial | RF08 — Atendimento jurídico (NUDEM).
 * Inclui o painel da equipe (CT-ACE01).
 */
var ServicoAtendimento = (function () {
  var FUSO = 'America/Bahia';

  function hojeIso_() {
    return Utilities.formatDate(Ambiente.agora(), FUSO, 'yyyy-MM-dd');
  }

  function publico_(a) {
    return {
      id: a.id,
      protocolo: a.protocolo,
      tipo: a.tipo,
      tipoDescricao: Agendamento.TIPOS[a.tipo],
      dataPreferida: a.dataPreferida,
      periodo: a.periodo,
      periodoDescricao: Agendamento.PERIODOS[a.periodo],
      modalidade: a.modalidade,
      modalidadeDescricao: Agendamento.MODALIDADES[a.modalidade],
      observacao: a.observacao,
      status: a.status,
      criadoEm: a.criadoEm,
      atualizadoEm: a.atualizadoEm,
    };
  }

  function notificarEquipe_(ag) {
    var prop = ag.tipo === 'JURIDICO' ? 'EMAIL_EQUIPE_JURIDICA' : 'EMAIL_EQUIPE_PSICOSSOCIAL';
    var para = Ambiente.prop(prop, '');
    if (!para) return;
    // Sem dados pessoais no e-mail: a equipe consulta os detalhes no painel autenticado
    var texto =
      'Nova solicitação de ' + Agendamento.TIPOS[ag.tipo] + '.\n' +
      'Protocolo: ' + ag.protocolo + '\n' +
      'Data preferida: ' + ag.dataPreferida + ' (' + Agendamento.PERIODOS[ag.periodo] + ')\n' +
      'Modalidade: ' + Agendamento.MODALIDADES[ag.modalidade] + '\n\n' +
      'Acesse o painel da equipe no Aurora para ver os detalhes.';
    EmailGateway.enviar({ para: para, assunto: 'Aurora: nova solicitação ' + ag.protocolo, texto: texto, html: '<pre>' + Alerta.escaparHtml(texto) + '</pre>' }, 1);
  }

  function solicitar(sessao, solicitacao) {
    var s = solicitacao || {};
    var v = Agendamento.validarSolicitacao(s, hojeIso_(), Config.AGENDAMENTO_DIAS_MAX);
    if (!v.valido) throw Erros.criar('DADOS_INVALIDOS', 'Revise os campos destacados.', v.erros);
    var agora = Ambiente.agora().toISOString();
    var ag = Repositorio.inserir('Agendamentos', {
      protocolo: Agendamento.gerarProtocolo(s.tipo, hojeIso_(), Ambiente.uuid().replace(/-/g, '')),
      usuariaId: sessao.usuariaId,
      tipo: s.tipo,
      dataPreferida: s.dataPreferida,
      periodo: s.periodo,
      modalidade: s.modalidade,
      observacao: Validacao.limitarTexto(s.observacao, 500),
      status: Agendamento.STATUS.SOLICITADO,
      criadoEm: agora,
      atualizadoEm: agora,
      responsavel: '',
    });
    try {
      notificarEquipe_(ag);
    } catch (e) {
      Log.aviso('NOTIFICACAO_EQUIPE_FALHOU', { protocolo: ag.protocolo });
    }
    Log.info('ATENDIMENTO_SOLICITADO', { protocolo: ag.protocolo, tipo: ag.tipo });
    return publico_(ag);
  }

  function listarMeus(sessao) {
    return Repositorio.listar('Agendamentos', function (a) {
      return a.usuariaId === sessao.usuariaId;
    })
      .sort(function (a, b) {
        return a.criadoEm < b.criadoEm ? 1 : -1;
      })
      .map(publico_);
  }

  function cancelar(sessao, id) {
    var a = Repositorio.buscarPorId('Agendamentos', id);
    if (!a || a.usuariaId !== sessao.usuariaId) throw Erros.criar('NAO_ENCONTRADO', 'Solicitação não encontrada.');
    var status = Agendamento.transicionar(a.status, Agendamento.STATUS.CANCELADO);
    return publico_(Repositorio.atualizar('Agendamentos', id, { status: status, atualizadoEm: Ambiente.agora().toISOString() }));
  }

  // ---- Painel da equipe -------------------------------------------------

  var PERFIS_EQUIPE = ['EQUIPE_PSICOSSOCIAL', 'EQUIPE_JURIDICA', 'ADMIN'];

  function listarEquipe(sessao, filtroStatus) {
    if (PERFIS_EQUIPE.indexOf(sessao.perfil) === -1) throw Erros.criar('ACESSO_NEGADO', 'Você não tem permissão para esta área.');
    var usuarias = {};
    Repositorio.listar('Usuarias').forEach(function (u) {
      usuarias[u.id] = u;
    });
    return Repositorio.listar('Agendamentos', function (a) {
      return Agendamento.perfilPodeVer(sessao.perfil, a.tipo) && (!filtroStatus || a.status === filtroStatus);
    })
      .sort(function (a, b) {
        return a.dataPreferida < b.dataPreferida ? -1 : 1;
      })
      .map(function (a) {
        var p = publico_(a);
        var u = usuarias[a.usuariaId];
        p.usuariaNome = u ? u.nome : '(conta excluída)';
        p.usuariaTelefone = u ? u.telefone : '';
        p.responsavel = a.responsavel;
        return p;
      });
  }

  function atualizarStatusEquipe(sessao, id, novoStatus) {
    if (PERFIS_EQUIPE.indexOf(sessao.perfil) === -1) throw Erros.criar('ACESSO_NEGADO', 'Você não tem permissão para esta área.');
    var a = Repositorio.buscarPorId('Agendamentos', id);
    if (!a || !Agendamento.perfilPodeVer(sessao.perfil, a.tipo)) throw Erros.criar('NAO_ENCONTRADO', 'Solicitação não encontrada.');
    var status = Agendamento.transicionar(a.status, novoStatus);
    var at = Repositorio.atualizar('Agendamentos', id, {
      status: status,
      atualizadoEm: Ambiente.agora().toISOString(),
      responsavel: sessao.nome || sessao.usuariaId,
    });
    Log.info('ATENDIMENTO_ATUALIZADO', { protocolo: at.protocolo, status: status });
    return publico_(at);
  }

  return {
    solicitar: solicitar,
    listarMeus: listarMeus,
    cancelar: cancelar,
    listarEquipe: listarEquipe,
    atualizarStatusEquipe: atualizarStatusEquipe,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { ServicoAtendimento: ServicoAtendimento };
