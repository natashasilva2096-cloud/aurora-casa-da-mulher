/**
 * Regras da rede de hospedagem solidária (Aurora Abrigo).
 *
 * PRINCÍPIO DE SEGURANÇA: o endereço e a identidade de quem hospeda NUNCA são
 * expostos para busca. A usuária só vê disponibilidade genérica (visaoPublica);
 * o encaminhamento e a liberação do endereço são feitos pela equipe da Casa da
 * Mulher, depois da validação por órgão público.
 *
 * Estados do cadastro (transição de estados):
 *   PENDENTE -> EM_ANALISE -> VALIDADO | RECUSADO
 *   VALIDADO <-> SUSPENSO
 *   qualquer estado não final -> DESLIGADO
 */
var Anfitriao = (function () {
  var STATUS = {
    PENDENTE: 'PENDENTE',
    EM_ANALISE: 'EM_ANALISE',
    VALIDADO: 'VALIDADO',
    RECUSADO: 'RECUSADO',
    SUSPENSO: 'SUSPENSO',
    DESLIGADO: 'DESLIGADO',
  };

  var TRANSICOES = {
    PENDENTE: ['EM_ANALISE', 'DESLIGADO'],
    EM_ANALISE: ['VALIDADO', 'RECUSADO', 'DESLIGADO'],
    VALIDADO: ['SUSPENSO', 'DESLIGADO'],
    SUSPENSO: ['VALIDADO', 'DESLIGADO'],
    RECUSADO: [],
    DESLIGADO: [],
  };

  var LIMITES = { pessoasMin: 1, pessoasMax: 6, filhosMin: 1, filhosMax: 5, diasMin: 1, diasMax: 90 };

  /** Conteúdo da capacitação obrigatória antes de receber alguém ("educação" do anfitrião). */
  var MODULOS_CAPACITACAO = [
    { id: 'SIGILO', titulo: 'Sigilo e segurança', resumo: 'Não divulgar a presença da hóspede, não postar fotos, não informar o endereço a ninguém.' },
    { id: 'ACOLHIMENTO', titulo: 'Acolhimento sem julgamento', resumo: 'Escutar sem pressionar decisões; respeitar o tempo e a privacidade da hóspede.' },
    { id: 'REDE', titulo: 'Rede de proteção', resumo: 'Como acionar a Casa da Mulher, a DEAM, o NUDEM e o 190 em caso de risco.' },
    { id: 'DIREITOS', titulo: 'Direitos e Lei Maria da Penha', resumo: 'Noções de medida protetiva, guarda dos filhos e apoio financeiro durante a separação.' },
  ];

  function inteiro_(v) {
    var n = Number(v);
    return typeof v !== 'boolean' && v !== '' && v !== null && isFinite(n) && Math.floor(n) === n ? n : null;
  }

  function entre_(n, min, max) {
    return n !== null && n >= min && n <= max;
  }

  function validarCadastro(dados) {
    var d = dados || {};
    var erros = {};
    if (!Validacao.validarNome(d.nome)) erros.nome = 'Informe o nome completo.';
    if (!Validacao.validarEmail(d.email)) erros.email = 'Informe um e-mail válido.';
    if (!Validacao.validarTelefone(d.telefone)) erros.telefone = 'Informe um telefone com DDD válido.';
    var bairro = String(d.bairro || '').trim();
    if (bairro.length < 2 || bairro.length > 80) erros.bairro = 'Informe o bairro.';
    var endereco = String(d.endereco || '').trim();
    if (endereco.length < 5 || endereco.length > 200) erros.endereco = 'Informe o endereço completo (ele fica em sigilo).';

    var pessoas = inteiro_(d.maxPessoas);
    if (!entre_(pessoas, LIMITES.pessoasMin, LIMITES.pessoasMax)) {
      erros.maxPessoas = 'Informe de ' + LIMITES.pessoasMin + ' a ' + LIMITES.pessoasMax + ' pessoas.';
    }
    if (d.aceitaFilhos === true) {
      var filhos = inteiro_(d.maxFilhos);
      if (!entre_(filhos, LIMITES.filhosMin, LIMITES.filhosMax)) {
        erros.maxFilhos = 'Informe de ' + LIMITES.filhosMin + ' a ' + LIMITES.filhosMax + ' crianças.';
      } else if (pessoas !== null && filhos > pessoas - 1) {
        erros.maxFilhos = 'O total (mulher + crianças) não pode passar do número de pessoas que você recebe.';
      }
    } else if (d.aceitaFilhos !== false) {
      erros.aceitaFilhos = 'Informe se pode receber crianças.';
    }
    if (!entre_(inteiro_(d.duracaoMaxDias), LIMITES.diasMin, LIMITES.diasMax)) {
      erros.duracaoMaxDias = 'Informe de ' + LIMITES.diasMin + ' a ' + LIMITES.diasMax + ' dias.';
    }
    if (d.observacoes && String(d.observacoes).length > 500) erros.observacoes = 'Até 500 caracteres.';
    if (d.consentimento !== true) erros.consentimento = 'É necessário aceitar o termo de participação e a verificação pelo órgão público.';
    if (d.termoSigilo !== true) erros.termoSigilo = 'É necessário aceitar o compromisso de sigilo.';
    return { valido: Object.keys(erros).length === 0, erros: erros };
  }

  function podeTransicionar(de, para) {
    return (TRANSICOES[de] || []).indexOf(para) !== -1;
  }

  function transicionar(de, para) {
    if (!podeTransicionar(de, para)) {
      throw Erros.criar('TRANSICAO_INVALIDA', 'Não é possível mudar o cadastro de ' + de + ' para ' + para + '.');
    }
    return para;
  }

  /** Só pode receber quem foi validado pelo órgão público E concluiu a capacitação. */
  function disponivel(a) {
    return !!a && a.status === STATUS.VALIDADO && a.capacitacaoConcluida === true;
  }

  /** O que pode ser mostrado fora da equipe: nada que identifique ou localize a casa. */
  function visaoPublica(a) {
    return {
      id: a.id,
      bairro: a.bairro,
      maxPessoas: a.maxPessoas,
      aceitaFilhos: a.aceitaFilhos === true,
      maxFilhos: a.aceitaFilhos === true ? a.maxFilhos : 0,
      duracaoMaxDias: a.duracaoMaxDias,
      acessivel: a.acessivel === true,
    };
  }

  /**
   * @param {object} a  cadastro do anfitrião
   * @param {{filhos:number, dias:number, precisaAcessibilidade?:boolean, evitarBairros?:string[]}} n
   */
  function compativel(a, n) {
    if (!disponivel(a)) return false;
    var filhos = n.filhos || 0;
    if (1 + filhos > a.maxPessoas) return false;
    if (filhos > 0 && (a.aceitaFilhos !== true || filhos > a.maxFilhos)) return false;
    if ((n.dias || 1) > a.duracaoMaxDias) return false;
    if (n.precisaAcessibilidade && a.acessivel !== true) return false;
    var evitar = (n.evitarBairros || []).map(function (b) {
      return String(b).trim().toLowerCase();
    });
    if (evitar.indexOf(String(a.bairro || '').trim().toLowerCase()) !== -1) return false;
    return true;
  }

  /** Lista compatível (somente visão pública), preferindo quem oferece mais tempo. */
  function compativeis(lista, necessidade) {
    return (lista || [])
      .filter(function (a) {
        return compativel(a, necessidade);
      })
      .sort(function (x, y) {
        return y.duracaoMaxDias - x.duracaoMaxDias;
      })
      .map(visaoPublica);
  }

  function gerarProtocolo(dataIso, sufixo) {
    return 'AB-' + String(dataIso).replace(/-/g, '') + '-' + String(sufixo).substring(0, 4).toUpperCase();
  }

  return {
    STATUS: STATUS,
    LIMITES: LIMITES,
    MODULOS_CAPACITACAO: MODULOS_CAPACITACAO,
    validarCadastro: validarCadastro,
    podeTransicionar: podeTransicionar,
    transicionar: transicionar,
    disponivel: disponivel,
    visaoPublica: visaoPublica,
    compativel: compativel,
    compativeis: compativeis,
    gerarProtocolo: gerarProtocolo,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Anfitriao: Anfitriao };
