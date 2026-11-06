/**
 * Cadastro de quem oferece hospedagem (fase 1) e operações de equipe (base da fase 2).
 */
var ServicoAnfitriao = (function () {
  var FUSO = 'America/Bahia';

  function cadastrar(dados) {
    var d = dados || {};
    var v = Anfitriao.validarCadastro(d);
    if (!v.valido) throw Erros.criar('DADOS_INVALIDOS', 'Revise os campos destacados.', v.erros);
    var email = Validacao.normalizarEmail(d.email);

    return Repositorio.comLock(function () {
      var existente = Repositorio.buscar('Anfitrioes', function (a) {
        return a.email === email && a.status !== Anfitriao.STATUS.DESLIGADO && a.status !== Anfitriao.STATUS.RECUSADO;
      });
      if (existente) throw Erros.criar('JA_CADASTRADO', 'Já existe um cadastro ativo com este e-mail. Protocolo: ' + existente.protocolo);

      var agora = Ambiente.agora();
      var a = Repositorio.inserir('Anfitrioes', {
        protocolo: Anfitriao.gerarProtocolo(Utilities.formatDate(agora, FUSO, 'yyyy-MM-dd'), Ambiente.uuid().replace(/-/g, '')),
        nome: Validacao.limitarTexto(d.nome, 100),
        email: email,
        telefone: Validacao.normalizarTelefone(d.telefone),
        bairro: Validacao.limitarTexto(d.bairro, 80),
        endereco: Validacao.limitarTexto(d.endereco, 200),
        maxPessoas: Number(d.maxPessoas),
        aceitaFilhos: d.aceitaFilhos === true,
        maxFilhos: d.aceitaFilhos === true ? Number(d.maxFilhos) : 0,
        duracaoMaxDias: Number(d.duracaoMaxDias),
        acessivel: d.acessivel === true,
        observacoes: Validacao.limitarTexto(d.observacoes, 500),
        status: Anfitriao.STATUS.PENDENTE,
        capacitacaoConcluida: false,
        consentimentoEm: agora.toISOString(),
        criadoEm: agora.toISOString(),
        atualizadoEm: agora.toISOString(),
      });

      var para = Ambiente.prop('EMAIL_EQUIPE_ABRIGO', '');
      if (para) {
        try {
          // Sem endereço nem nome no e-mail
          MailApp.sendEmail({ to: para, subject: 'Aurora Abrigo: novo cadastro ' + a.protocolo, body: 'Novo cadastro de anfitriã(o) aguardando análise. Protocolo: ' + a.protocolo + '. Bairro: ' + a.bairro + '.' });
        } catch (e) {
          Log.aviso('NOTIFICACAO_EQUIPE_FALHOU', { protocolo: a.protocolo });
        }
      }
      Log.info('ANFITRIAO_CADASTRADO', { protocolo: a.protocolo });
      return { protocolo: a.protocolo, status: a.status };
    });
  }

  /** A pessoa acompanha o próprio cadastro informando protocolo + e-mail. */
  function consultarStatus(protocolo, email) {
    var e = Validacao.normalizarEmail(email);
    var a = Repositorio.buscar('Anfitrioes', function (x) {
      return x.protocolo === String(protocolo || '').trim().toUpperCase() && x.email === e;
    });
    if (!a) throw Erros.criar('NAO_ENCONTRADO', 'Cadastro não encontrado. Confira o protocolo e o e-mail.');
    return { protocolo: a.protocolo, status: a.status, capacitacaoConcluida: a.capacitacaoConcluida };
  }

  // ---- Operações da equipe (fase 2: hoje executadas pelo editor/planilha) --

  function atualizarStatus(id, novoStatus) {
    var a = Repositorio.buscarPorId('Anfitrioes', id);
    if (!a) throw Erros.criar('NAO_ENCONTRADO', 'Cadastro não encontrado.');
    var status = Anfitriao.transicionar(a.status, novoStatus);
    return Repositorio.atualizar('Anfitrioes', id, { status: status, atualizadoEm: Ambiente.agora().toISOString() });
  }

  function registrarCapacitacao(id) {
    var a = Repositorio.buscarPorId('Anfitrioes', id);
    if (!a) throw Erros.criar('NAO_ENCONTRADO', 'Cadastro não encontrado.');
    return Repositorio.atualizar('Anfitrioes', id, { capacitacaoConcluida: true, atualizadoEm: Ambiente.agora().toISOString() });
  }

  /** Para a equipe encaminhar uma usuária: só visão pública, nunca endereço. */
  function buscarCompativeis(necessidade) {
    return Anfitriao.compativeis(Repositorio.listar('Anfitrioes'), necessidade || {});
  }

  return {
    cadastrar: cadastrar,
    consultarStatus: consultarStatus,
    atualizarStatus: atualizarStatus,
    registrarCapacitacao: registrarCapacitacao,
    buscarCompativeis: buscarCompativeis,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { ServicoAnfitriao: ServicoAnfitriao };
