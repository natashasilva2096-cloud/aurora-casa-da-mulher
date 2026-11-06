/**
 * RF01 — Cadastro, autenticação e exclusão de conta (direito da titular — LGPD).
 */
var ServicoUsuaria = (function () {
  function perfilPublico(u) {
    return { id: u.id, nome: u.nome, email: u.email, telefone: u.telefone, bairro: u.bairro, perfil: u.perfil };
  }

  function cadastrar(dados) {
    var d = dados || {};
    var v = Validacao.validarCadastroUsuaria(d);
    if (!v.valido) throw Erros.criar('DADOS_INVALIDOS', 'Revise os campos destacados.', v.erros);
    var email = Validacao.normalizarEmail(d.email);

    return Repositorio.comLock(function () {
      var existente = Repositorio.buscar('Usuarias', function (u) {
        return u.email === email;
      });
      if (existente) throw Erros.criar('EMAIL_JA_CADASTRADO', 'Já existe uma conta com este e-mail.');

      var salt = Ambiente.uuid();
      var agora = Ambiente.agora().toISOString();
      var u = Repositorio.inserir('Usuarias', {
        nome: Validacao.limitarTexto(d.nome, 100),
        email: email,
        telefone: Validacao.normalizarTelefone(d.telefone),
        bairro: Validacao.limitarTexto(d.bairro, 80),
        senhaHash: Seguranca.hashSenha(d.senha, salt, Ambiente.digestHex),
        salt: salt,
        perfil: Config.PERFIS.USUARIA,
        consentimentoEm: agora,
        criadoEm: agora,
      });
      Log.info('USUARIA_CADASTRADA', { id: u.id });
      return { token: Sessao.criar(u), usuaria: perfilPublico(u) };
    });
  }

  function entrar(email, senha) {
    var e = Validacao.normalizarEmail(email);
    if (!e || !senha) throw Erros.criar('CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.');
    if (Sessao.estaBloqueado(e)) {
      throw Erros.criar('LOGIN_BLOQUEADO', 'Muitas tentativas. Aguarde ' + Config.BLOQUEIO_LOGIN_MIN + ' minutos ou ligue 180 se precisar de ajuda agora.');
    }
    var u = Repositorio.buscar('Usuarias', function (x) {
      return x.email === e;
    });
    // Mesma mensagem para e-mail inexistente e senha errada: não revela quem tem conta
    if (!u || !Seguranca.verificarSenha(senha, u.salt, u.senhaHash, Ambiente.digestHex)) {
      var n = Sessao.registrarFalhaLogin(e);
      Log.aviso('LOGIN_FALHOU', { email: Seguranca.mascararEmail(e), tentativa: n });
      throw Erros.criar('CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.');
    }
    Sessao.limparFalhasLogin(e);
    return { token: Sessao.criar(u), usuaria: perfilPublico(u) };
  }

  function sair(token) {
    Sessao.encerrar(token);
    return true;
  }

  function obter(sessao) {
    var u = Repositorio.buscarPorId('Usuarias', sessao.usuariaId);
    if (!u) throw Erros.criar('SESSAO_INVALIDA', 'Conta não encontrada. Entre novamente.');
    return perfilPublico(u);
  }

  /** Exclui a conta e todos os dados pessoais associados (LGPD, art. 18). */
  function excluirConta(sessao, senha) {
    var u = Repositorio.buscarPorId('Usuarias', sessao.usuariaId);
    if (!u || !Seguranca.verificarSenha(senha, u.salt, u.senhaHash, Ambiente.digestHex)) {
      throw Erros.criar('CREDENCIAIS_INVALIDAS', 'Senha incorreta.');
    }
    return Repositorio.comLock(function () {
      var acionamentos = Repositorio.listar('Acionamentos', function (a) {
        return a.usuariaId === u.id;
      }).map(function (a) {
        return a.id;
      });
      Repositorio.removerOnde('Localizacoes', function (l) {
        return acionamentos.indexOf(l.acionamentoId) !== -1;
      });
      Repositorio.removerOnde('Acionamentos', function (a) {
        return a.usuariaId === u.id;
      });
      Repositorio.removerOnde('Contatos', function (c) {
        return c.usuariaId === u.id;
      });
      // Agendamentos ficam com a equipe, mas desvinculados da titular
      Repositorio.listar('Agendamentos', function (a) {
        return a.usuariaId === u.id;
      }).forEach(function (a) {
        Repositorio.atualizar('Agendamentos', a.id, { usuariaId: 'EXCLUIDA', observacao: '' });
      });
      Repositorio.remover('Usuarias', u.id);
      Sessao.encerrar(sessao.token);
      Log.info('CONTA_EXCLUIDA', { id: u.id });
      return true;
    });
  }

  return { perfilPublico: perfilPublico, cadastrar: cadastrar, entrar: entrar, sair: sair, obter: obter, excluirConta: excluirConta };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { ServicoUsuaria: ServicoUsuaria };
