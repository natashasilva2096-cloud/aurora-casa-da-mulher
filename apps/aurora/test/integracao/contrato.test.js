/**
 * Testes de contrato (análise estática) — protegem regras do Apps Script que
 * não aparecem nos testes funcionais:
 *  1. todos os arquivos dividem o mesmo escopo global: nomes não podem repetir;
 *  2. nenhum arquivo pode depender de outro no carregamento (a ordem do push é indefinida);
 *  3. toda função chamada pela interface (google.script.run) existe no servidor;
 *  4. todo include('...') aponta para um arquivo existente.
 */
const fs = require('fs');
const path = require('path');
const { listarArquivos, lerFonte, RAIZ } = require('../../../../test/helpers/carregarApp');

const APPS = ['aurora', 'abrigo'];

function nomesGlobais(fonte) {
  const nomes = [];
  const re = /^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(fonte))) nomes.push(m[1]);
  return nomes;
}

function htmlsDoApp(app) {
  const dir = path.join(RAIZ, 'apps', app, 'src', 'ui');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => path.join(dir, f)) : [];
}

describe.each(APPS)('app %s', (app) => {
  const arquivos = listarArquivos(app);

  test('todos os arquivos listados existem', () => {
    arquivos.forEach((a) => expect(fs.existsSync(a)).toBe(true));
  });

  test('não há nomes globais repetidos entre arquivos', () => {
    const vistos = {};
    arquivos.forEach((arq) => {
      nomesGlobais(fs.readFileSync(arq, 'utf8')).forEach((n) => {
        expect({ nome: n, arquivo: path.relative(RAIZ, arq), jaEm: vistos[n] }).toEqual({ nome: n, arquivo: path.relative(RAIZ, arq), jaEm: undefined });
        vistos[n] = path.relative(RAIZ, arq);
      });
    });
  });

  test('cada arquivo carrega sozinho, sem serviços do Google nem outros arquivos', () => {
    arquivos.forEach((arq) => {
      jest.isolateModules(() => {
        expect(() => require(arq)).not.toThrow();
      });
    });
  });

  test('toda chamada google.script.run da interface existe no servidor', () => {
    const servidor = new Set(arquivos.flatMap((a) => nomesGlobais(fs.readFileSync(a, 'utf8'))));
    const chamadas = new Set();
    htmlsDoApp(app).forEach((h) => {
      const fonte = fs.readFileSync(h, 'utf8');
      for (const m of fonte.matchAll(/api\('([a-zA-Z_]\w*)'/g)) chamadas.add(m[1]);
      for (const m of fonte.matchAll(/\.(api_\w+)\(/g)) chamadas.add(m[1]);
    });
    expect(chamadas.size).toBeGreaterThan(0);
    chamadas.forEach((fn) => {
      expect({ fn, existe: servidor.has(fn) }).toEqual({ fn, existe: true });
      expect(fn.endsWith('_')).toBe(false); // funções privadas não são chamáveis
    });
  });

  test("todo include('...') aponta para um HTML existente", () => {
    htmlsDoApp(app).forEach((h) => {
      const fonte = fs.readFileSync(h, 'utf8');
      for (const m of fonte.matchAll(/include\('([^']+)'\)/g)) {
        const noApp = path.join(RAIZ, 'apps', app, 'src', m[1] + '.html');
        const noShared = path.join(RAIZ, 'shared', 'src', m[1] + '.html');
        expect({ include: m[1], existe: fs.existsSync(noApp) || fs.existsSync(noShared) }).toEqual({ include: m[1], existe: true });
      }
    });
  });

  test('manifesto do web app: V8, fuso de Salvador e acesso anônimo (contatos abrem o link sem conta Google)', () => {
    const manifesto = JSON.parse(lerFonte(`apps/${app}/src/appsscript.json`));
    expect(manifesto.runtimeVersion).toBe('V8');
    expect(manifesto.timeZone).toBe('America/Bahia');
    expect(manifesto.webapp).toEqual({ executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
  });
});

test('o JavaScript embutido nos HTML não tem erro de sintaxe', () => {
  const vm = require('vm');
  APPS.flatMap(htmlsDoApp).forEach((h) => {
    const fonte = fs.readFileSync(h, 'utf8');
    for (const m of fonte.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      // scriptlets do Apps Script viram um literal qualquer antes da análise
      const js = m[1].replace(/<\?=?!?[\s\S]*?\?>/g, '"x"');
      expect(() => new vm.Script(js, { filename: path.relative(RAIZ, h) })).not.toThrow();
    }
  });
});

test('a interface não usa innerHTML com dados (prevenção de XSS)', () => {
  APPS.flatMap(htmlsDoApp).forEach((h) => {
    expect(fs.readFileSync(h, 'utf8')).not.toMatch(/\.innerHTML\s*=/);
  });
});
