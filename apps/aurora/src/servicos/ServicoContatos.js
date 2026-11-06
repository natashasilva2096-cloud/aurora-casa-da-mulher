/**
 * RF02 — Contatos de confiança que recebem o alerta.
 */
var ServicoContatos = (function () {
  function publico_(c) {
    return { id: c.id, nome: c.nome, email: c.email, telefone: c.telefone, relacao: c.relacao };
  }

  function daUsuaria_(usuariaId) {
    return Repositorio.listar('Contatos', function (c) {
      return c.usuariaId === usuariaId;
    });
  }

  function listar(sessao) {
    return daUsuaria_(sessao.usuariaId).map(publico_);
  }

  /** Uso interno do alerta: retorna os registros completos. */
  function listarParaAlerta(usuariaId) {
    return daUsuaria_(usuariaId);
  }

  function salvar(sessao, contato) {
    var c = contato || {};
    var v = Validacao.validarContato(c);
    if (!v.valido) throw Erros.criar('DADOS_INVALIDOS', 'Revise os dados do contato.', v.erros);

    var dados = {
      nome: Validacao.limitarTexto(c.nome, 100),
      email: Validacao.normalizarEmail(c.email),
      telefone: c.telefone ? Validacao.normalizarTelefone(c.telefone) : '',
      relacao: Validacao.limitarTexto(c.relacao, 40),
    };

    return Repositorio.comLock(function () {
      var existentes = daUsuaria_(sessao.usuariaId);
      var duplicado = existentes.filter(function (x) {
        return x.email === dados.email && x.id !== c.id;
      });
      if (duplicado.length) throw Erros.criar('CONTATO_DUPLICADO', 'Este e-mail já está na sua lista de contatos.');

      if (c.id) {
        var atual = existentes.filter(function (x) {
          return x.id === c.id;
        })[0];
        if (!atual) throw Erros.criar('NAO_ENCONTRADO', 'Contato não encontrado.');
        return publico_(Repositorio.atualizar('Contatos', c.id, dados));
      }

      if (existentes.length >= Config.MAX_CONTATOS) {
        throw Erros.criar('LIMITE_CONTATOS', 'Você pode cadastrar até ' + Config.MAX_CONTATOS + ' contatos de confiança.');
      }
      dados.usuariaId = sessao.usuariaId;
      dados.criadoEm = Ambiente.agora().toISOString();
      return publico_(Repositorio.inserir('Contatos', dados));
    });
  }

  function remover(sessao, id) {
    var c = Repositorio.buscarPorId('Contatos', id);
    if (!c || c.usuariaId !== sessao.usuariaId) throw Erros.criar('NAO_ENCONTRADO', 'Contato não encontrado.');
    Repositorio.remover('Contatos', id);
    return true;
  }

  return { listar: listar, listarParaAlerta: listarParaAlerta, salvar: salvar, remover: remover };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { ServicoContatos: ServicoContatos };
