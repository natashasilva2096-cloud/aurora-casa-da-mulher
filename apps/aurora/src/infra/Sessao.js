/**
 * Sessões da usuária guardadas no CacheService (expiram sozinhas).
 * O token é aleatório (64 hex) e nunca é registrado em log.
 * Também controla o bloqueio após tentativas de login (transição: ativo -> bloqueado).
 */
var Sessao = (function () {
  var PREFIXO = 'sessao:';
  var PREFIXO_TENTATIVAS = 'login:';

  function cache_() {
    return CacheService.getScriptCache();
  }

  function criar(usuaria) {
    var token = Ambiente.tokenAleatorio();
    var dados = { usuariaId: usuaria.id, perfil: usuaria.perfil, nome: usuaria.nome };
    cache_().put(PREFIXO + token, JSON.stringify(dados), Config.SESSAO_HORAS * 3600);
    return token;
  }

  /** Retorna a sessão ou lança SESSAO_INVALIDA. */
  function exigir(token) {
    if (!token || typeof token !== 'string' || token.length < 32) {
      throw Erros.criar('SESSAO_INVALIDA', 'Sua sessão expirou. Entre novamente.');
    }
    var bruto = cache_().get(PREFIXO + token);
    if (!bruto) throw Erros.criar('SESSAO_INVALIDA', 'Sua sessão expirou. Entre novamente.');
    // Expiração deslizante: cada uso renova o prazo, para a sessão não vencer
    // enquanto o app está em uso (FMECA: sessão expirada no momento do pânico)
    cache_().put(PREFIXO + token, bruto, Config.SESSAO_HORAS * 3600);
    var s = JSON.parse(bruto);
    s.token = token;
    return s;
  }

  function exigirPerfil(token, perfisPermitidos) {
    var s = exigir(token);
    if (perfisPermitidos.indexOf(s.perfil) === -1) {
      throw Erros.criar('ACESSO_NEGADO', 'Você não tem permissão para esta área.');
    }
    return s;
  }

  function encerrar(token) {
    if (token) cache_().remove(PREFIXO + token);
  }

  function chaveTentativas_(email) {
    return PREFIXO_TENTATIVAS + Ambiente.digestHex(String(email).toLowerCase()).substring(0, 32);
  }

  function estaBloqueado(email) {
    var n = parseInt(cache_().get(chaveTentativas_(email)) || '0', 10);
    return n >= Config.MAX_TENTATIVAS_LOGIN;
  }

  function registrarFalhaLogin(email) {
    var chave = chaveTentativas_(email);
    var n = parseInt(cache_().get(chave) || '0', 10) + 1;
    cache_().put(chave, String(n), Config.BLOQUEIO_LOGIN_MIN * 60);
    return n;
  }

  function limparFalhasLogin(email) {
    cache_().remove(chaveTentativas_(email));
  }

  return {
    criar: criar,
    exigir: exigir,
    exigirPerfil: exigirPerfil,
    encerrar: encerrar,
    estaBloqueado: estaBloqueado,
    registrarFalhaLogin: registrarFalhaLogin,
    limparFalhasLogin: limparFalhasLogin,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Sessao: Sessao };
