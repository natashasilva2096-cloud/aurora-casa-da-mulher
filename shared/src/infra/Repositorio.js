/**
 * Repositório genérico sobre Google Sheets: cada aba é uma "tabela" cujo
 * cabeçalho vem de Config.ESQUEMA. Tipos especiais em Config.CAMPOS_NUMERICOS e
 * Config.CAMPOS_BOOLEANOS.
 *
 * Escritas usam LockService para evitar condições de corrida quando vários
 * acionamentos chegam ao mesmo tempo (CT-SIS02).
 */
var Repositorio = (function () {
  var profundidadeLock_ = 0;

  function esquema_(nomeAba) {
    var cab = Config.ESQUEMA[nomeAba];
    if (!cab) throw new Error('ABA_DESCONHECIDA: ' + nomeAba);
    return cab;
  }

  function aba_(nomeAba) {
    var cab = esquema_(nomeAba);
    var ss = Ambiente.planilha();
    var sh = ss.getSheetByName(nomeAba);
    if (!sh) {
      sh = ss.insertSheet(nomeAba);
      sh.getRange(1, 1, 1, cab.length).setValues([cab]);
      sh.setFrozenRows(1);
      // Texto puro: impede o Sheets de converter telefones/datas automaticamente
      sh.getRange(1, 1, sh.getMaxRows(), cab.length).setNumberFormat('@');
    }
    return sh;
  }

  function garantirAbas() {
    Object.keys(Config.ESQUEMA).forEach(aba_);
  }

  function comLock(fn) {
    if (profundidadeLock_ > 0) return fn();
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    profundidadeLock_++;
    try {
      return fn();
    } finally {
      profundidadeLock_--;
      lock.releaseLock();
    }
  }

  function ehNumerico_(campo) {
    return (Config.CAMPOS_NUMERICOS || []).indexOf(campo) !== -1;
  }

  function ehBooleano_(campo) {
    return (Config.CAMPOS_BOOLEANOS || []).indexOf(campo) !== -1;
  }

  /** Converte o valor lido da planilha para o tipo usado pela aplicação. */
  function lerValor_(campo, v) {
    if (ehBooleano_(campo)) return v === true || String(v).toUpperCase() === 'TRUE';
    if (ehNumerico_(campo)) {
      if (v === '' || v === null || v === undefined) return null;
      var n = Number(v);
      return isNaN(n) ? null : n;
    }
    if (v instanceof Date) return v.toISOString();
    var s = v === null || v === undefined ? '' : String(v);
    return s.charAt(0) === "'" ? s.substring(1) : s;
  }

  /** Impede injeção de fórmula (=, +, @) e normaliza tipos para gravação. */
  function escreverValor_(campo, v) {
    if (v === null || v === undefined) return '';
    if (ehBooleano_(campo)) return v === true;
    if (ehNumerico_(campo)) return typeof v === 'number' ? v : Number(v);
    if (v instanceof Date) return v.toISOString();
    var s = String(v);
    return /^[=+@]/.test(s) ? "'" + s : s;
  }

  function paraObjeto_(cab, linha) {
    var o = {};
    for (var i = 0; i < cab.length; i++) o[cab[i]] = lerValor_(cab[i], linha[i]);
    return o;
  }

  function paraLinha_(cab, obj) {
    return cab.map(function (c) {
      return escreverValor_(c, obj[c]);
    });
  }

  function lerTudo_(nomeAba) {
    var cab = esquema_(nomeAba);
    var sh = aba_(nomeAba);
    var ultima = sh.getLastRow();
    if (ultima < 2) return { sh: sh, cab: cab, linhas: [] };
    var valores = sh.getRange(2, 1, ultima - 1, cab.length).getValues();
    return { sh: sh, cab: cab, linhas: valores };
  }

  function listar(nomeAba, filtro) {
    var dados = lerTudo_(nomeAba);
    var lista = [];
    for (var i = 0; i < dados.linhas.length; i++) {
      var o = paraObjeto_(dados.cab, dados.linhas[i]);
      if (!o.id) continue;
      if (!filtro || filtro(o)) lista.push(o);
    }
    return lista;
  }

  function buscar(nomeAba, filtro) {
    var l = listar(nomeAba, filtro);
    return l.length ? l[0] : null;
  }

  function buscarPorId(nomeAba, id) {
    if (!id) return null;
    return buscar(nomeAba, function (o) {
      return o.id === String(id);
    });
  }

  function inserir(nomeAba, obj) {
    return comLock(function () {
      var cab = esquema_(nomeAba);
      var novo = {};
      Object.keys(obj).forEach(function (k) {
        novo[k] = obj[k];
      });
      if (!novo.id) novo.id = Ambiente.uuid();
      aba_(nomeAba).appendRow(paraLinha_(cab, novo));
      return paraObjeto_(cab, paraLinha_(cab, novo));
    });
  }

  function indiceDaLinha_(dados, id) {
    var col = dados.cab.indexOf('id');
    for (var i = 0; i < dados.linhas.length; i++) {
      if (String(dados.linhas[i][col]) === String(id)) return i;
    }
    return -1;
  }

  function atualizar(nomeAba, id, patch) {
    return comLock(function () {
      var dados = lerTudo_(nomeAba);
      var idx = indiceDaLinha_(dados, id);
      if (idx === -1) return null;
      var atual = paraObjeto_(dados.cab, dados.linhas[idx]);
      Object.keys(patch).forEach(function (k) {
        if (k !== 'id' && dados.cab.indexOf(k) !== -1) atual[k] = patch[k];
      });
      var linha = paraLinha_(dados.cab, atual);
      dados.sh.getRange(idx + 2, 1, 1, dados.cab.length).setValues([linha]);
      return paraObjeto_(dados.cab, linha);
    });
  }

  function removerOnde(nomeAba, filtro) {
    return comLock(function () {
      var dados = lerTudo_(nomeAba);
      var removidas = 0;
      // de baixo para cima, para os índices não se deslocarem
      for (var i = dados.linhas.length - 1; i >= 0; i--) {
        var o = paraObjeto_(dados.cab, dados.linhas[i]);
        if (o.id && filtro(o)) {
          dados.sh.deleteRow(i + 2);
          removidas++;
        }
      }
      return removidas;
    });
  }

  function remover(nomeAba, id) {
    return (
      removerOnde(nomeAba, function (o) {
        return o.id === String(id);
      }) > 0
    );
  }

  function contar(nomeAba, filtro) {
    return listar(nomeAba, filtro).length;
  }

  return {
    garantirAbas: garantirAbas,
    comLock: comLock,
    listar: listar,
    buscar: buscar,
    buscarPorId: buscarPorId,
    inserir: inserir,
    atualizar: atualizar,
    remover: remover,
    removerOnde: removerOnde,
    contar: contar,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Repositorio: Repositorio };
