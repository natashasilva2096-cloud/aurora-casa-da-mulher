/**
 * Fakes em memória dos serviços do Google Apps Script.
 * Permitem rodar os serviços do app em Node (Jest) sem conta Google — base dos
 * testes de integração (Nível 2) e de sistema simulados (Nível 3).
 *
 * Cada fake guarda o que foi chamado para os testes inspecionarem
 * (ex.: fakes.mail.enviados) e expõe "botões" para simular falhas
 * (ex.: fakes.mail.falharPara.add(email), fakes.maps.falhar = true).
 */
const crypto = require('crypto');

class FakeRange {
  constructor(sheet, linha, coluna, nLinhas, nColunas) {
    Object.assign(this, { sheet, linha, coluna, nLinhas, nColunas });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nLinhas; r++) {
      const fonte = this.sheet.dados[this.linha - 1 + r] || [];
      const linha = [];
      for (let c = 0; c < this.nColunas; c++) {
        const v = fonte[this.coluna - 1 + c];
        linha.push(v === undefined ? '' : v);
      }
      out.push(linha);
    }
    return out;
  }
  setValues(valores) {
    if (valores.length !== this.nLinhas || valores.some((l) => l.length !== this.nColunas)) {
      throw new Error('FakeRange: dimensões incompatíveis');
    }
    valores.forEach((l, r) => {
      const idx = this.linha - 1 + r;
      while (this.sheet.dados.length <= idx) this.sheet.dados.push([]);
      l.forEach((v, c) => {
        this.sheet.dados[idx][this.coluna - 1 + c] = v;
      });
    });
    return this;
  }
  setNumberFormat() {
    return this;
  }
}

class FakeSheet {
  constructor(nome) {
    this.nome = nome;
    this.dados = [];
  }
  getName() {
    return this.nome;
  }
  getRange(linha, coluna, nLinhas = 1, nColunas = 1) {
    return new FakeRange(this, linha, coluna, nLinhas, nColunas);
  }
  getLastRow() {
    return this.dados.length;
  }
  getMaxRows() {
    return Math.max(1000, this.dados.length);
  }
  appendRow(linha) {
    this.dados.push(linha.slice());
    return this;
  }
  deleteRow(i) {
    this.dados.splice(i - 1, 1);
  }
  setFrozenRows() {
    return this;
  }
}

class FakeSpreadsheet {
  constructor(id, nome) {
    this.id = id;
    this.nome = nome;
    this.abas = new Map([['Sheet1', new FakeSheet('Sheet1')]]);
  }
  getId() {
    return this.id;
  }
  getUrl() {
    return 'https://docs.google.com/spreadsheets/d/' + this.id;
  }
  getSheetByName(n) {
    return this.abas.get(n) || null;
  }
  insertSheet(n) {
    const s = new FakeSheet(n);
    this.abas.set(n, s);
    return s;
  }
  getSheets() {
    return Array.from(this.abas.values());
  }
  deleteSheet(s) {
    this.abas.delete(s.getName());
  }
  /** Ajuda nos testes: linhas da aba como objetos */
  linhas(nomeAba) {
    const s = this.getSheetByName(nomeAba);
    if (!s || !s.dados.length) return [];
    const [cab, ...resto] = s.dados;
    return resto.map((l) => Object.fromEntries(cab.map((c, i) => [c, l[i]])));
  }
}

function formatarData(d, tz, formato) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  const mapa = {
    yyyy: partes.year,
    MM: partes.month,
    dd: partes.day,
    HH: partes.hour === '24' ? '00' : partes.hour,
    mm: partes.minute,
    ss: partes.second,
  };
  return formato.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, literal) => (literal !== undefined ? literal : mapa[m]));
}

function criarFakes() {
  const planilhas = new Map();
  const props = new Map();
  const cache = new Map();

  const fakes = {
    planilhas,
    props,
    cache,
    lock: { esperas: 0, liberacoes: 0 },
    mail: { enviados: [], falharPara: new Set(), falharUmaVezPara: new Set(), cota: 100 },
    maps: { falhar: false, rotas: 0, geocodificar: null, resposta: null },
    gatilhos: [],
  };

  const SpreadsheetApp = {
    openById(id) {
      if (!planilhas.has(id)) throw new Error('Planilha não encontrada: ' + id);
      return planilhas.get(id);
    },
    create(nome) {
      const id = 'planilha-' + (planilhas.size + 1);
      const ss = new FakeSpreadsheet(id, nome);
      planilhas.set(id, ss);
      return ss;
    },
  };

  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, String(v)),
        deleteProperty: (k) => props.delete(k),
      };
    },
  };

  const CacheService = {
    getScriptCache() {
      return {
        get(k) {
          const e = cache.get(k);
          if (!e) return null;
          if (Date.now() > e.expira) {
            cache.delete(k);
            return null;
          }
          return e.valor;
        },
        put(k, v, segundos = 600) {
          cache.set(k, { valor: String(v), expira: Date.now() + segundos * 1000 });
        },
        remove(k) {
          cache.delete(k);
        },
      };
    },
  };

  const LockService = {
    getScriptLock() {
      return {
        waitLock() {
          fakes.lock.esperas++;
        },
        releaseLock() {
          fakes.lock.liberacoes++;
        },
        hasLock: () => true,
      };
    },
  };

  const MailApp = {
    getRemainingDailyQuota: () => fakes.mail.cota,
    sendEmail(opcoes) {
      if (fakes.mail.falharPara.has(opcoes.to)) throw new Error('Falha simulada de envio');
      if (fakes.mail.falharUmaVezPara.has(opcoes.to)) {
        fakes.mail.falharUmaVezPara.delete(opcoes.to);
        throw new Error('Falha temporária simulada');
      }
      fakes.mail.cota--;
      fakes.mail.enviados.push(opcoes);
    },
  };

  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    computeDigest(alg, texto) {
      const buf = crypto.createHash(alg).update(String(texto), 'utf8').digest();
      return Array.from(buf).map((b) => (b > 127 ? b - 256 : b)); // bytes com sinal, como no Apps Script
    },
    getUuid: () => crypto.randomUUID(),
    formatDate: formatarData,
  };

  const Maps = {
    DirectionFinder: { Mode: { WALKING: 'walking', DRIVING: 'driving', TRANSIT: 'transit' } },
    newDirectionFinder() {
      const req = {};
      const b = {
        setOrigin: (lat, lng) => ((req.origem = { lat, lng }), b),
        setDestination: (lat, lng) => ((req.destino = { lat, lng }), b),
        setMode: (m) => ((req.modo = m), b),
        setLanguage: () => b,
        setRegion: () => b,
        getDirections() {
          fakes.maps.rotas++;
          fakes.maps.ultimaRequisicao = req;
          if (fakes.maps.falhar) throw new Error('Serviço Maps indisponível (simulado)');
          return (
            fakes.maps.resposta || {
              routes: [
                {
                  legs: [
                    {
                      distance: { text: '1,2 km', value: 1200 },
                      duration: { text: '15 min', value: 900 },
                      steps: [
                        { html_instructions: 'Siga pela <b>Av. Tancredo Neves</b>', distance: { text: '800 m' } },
                        { html_instructions: 'Vire à direita<div style="x">Destino à esquerda</div>', distance: { text: '400 m' } },
                      ],
                    },
                  ],
                },
              ],
            }
          );
        },
      };
      return b;
    },
    newGeocoder() {
      const b = {
        setRegion: () => b,
        setLanguage: () => b,
        geocode(endereco) {
          const fn = fakes.maps.geocodificar;
          const coord = fn ? fn(endereco) : { lat: -12.98, lng: -38.45 };
          if (!coord) return { status: 'ZERO_RESULTS', results: [] };
          return { status: 'OK', results: [{ geometry: { location: coord } }] };
        },
      };
      return b;
    },
  };

  const ScriptApp = {
    getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/FAKE/exec' }),
    getProjectTriggers: () => fakes.gatilhos.slice(),
    deleteTrigger(g) {
      fakes.gatilhos = fakes.gatilhos.filter((x) => x !== g);
    },
    newTrigger(handler) {
      const g = { handler, getHandlerFunction: () => handler };
      const b = { timeBased: () => b, everyHours: (h) => ((g.horas = h), b), create: () => (fakes.gatilhos.push(g), g) };
      return b;
    },
  };

  function saidaHtml(conteudo) {
    const o = {
      conteudo,
      titulo: '',
      metas: {},
      setTitle: (t) => ((o.titulo = t), o),
      addMetaTag: (k, v) => ((o.metas[k] = v), o),
      setXFrameOptionsMode: () => o,
      getContent: () => o.conteudo,
    };
    return o;
  }

  const HtmlService = {
    XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' },
    createTemplateFromFile(nome) {
      const t = { nome, evaluate: () => saidaHtml('<template ' + nome + '>') };
      return t;
    },
    createHtmlOutputFromFile: (nome) => saidaHtml('<arquivo ' + nome + '>'),
  };

  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput(texto) {
      const o = { texto, mime: null, setMimeType: (m) => ((o.mime = m), o), getContent: () => texto };
      return o;
    },
  };

  const globais = {
    SpreadsheetApp,
    PropertiesService,
    CacheService,
    LockService,
    MailApp,
    Utilities,
    Maps,
    ScriptApp,
    HtmlService,
    ContentService,
  };

  return { fakes, globais };
}

module.exports = { criarFakes, FakeSpreadsheet, FakeSheet, formatarData };
