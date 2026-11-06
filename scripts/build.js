#!/usr/bin/env node
/**
 * Monta dist/<app>/ = shared/src + apps/<app>/src + BuildInfo.js
 * É essa pasta que o clasp envia para o Apps Script.
 *
 * Uso: node scripts/build.js aurora|abrigo
 * Variáveis opcionais: GITHUB_SHA (commit), SCRIPT_ID (gera .clasp.json no dist)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const app = process.argv[2];
const APPS = fs.readdirSync(path.join(RAIZ, 'apps'));

if (!APPS.includes(app)) {
  console.error(`Uso: node scripts/build.js <${APPS.join('|')}>`);
  process.exit(1);
}

function copiar(origem, destino) {
  fs.mkdirSync(destino, { recursive: true });
  for (const item of fs.readdirSync(origem, { withFileTypes: true })) {
    const o = path.join(origem, item.name);
    const d = path.join(destino, item.name);
    if (item.isDirectory()) copiar(o, d);
    else {
      if (fs.existsSync(d)) throw new Error(`Conflito: ${path.relative(RAIZ, d)} existe em shared e no app`);
      fs.copyFileSync(o, d);
    }
  }
}

function commitAtual() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.substring(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
}

const dist = path.join(RAIZ, 'dist', app);
fs.rmSync(dist, { recursive: true, force: true });
copiar(path.join(RAIZ, 'shared', 'src'), dist);
copiar(path.join(RAIZ, 'apps', app, 'src'), dist);

const info = { commit: commitAtual(), data: new Date().toISOString() };
fs.writeFileSync(
  path.join(dist, 'BuildInfo.js'),
  `// Gerado por scripts/build.js — não editar\nvar BuildInfo = ${JSON.stringify(info)};\n`
);

// .clasp.json: do ambiente (CI) ou o arquivo local do desenvolvedor (apps/<app>/.clasp.json, fora do git)
const claspLocal = path.join(RAIZ, 'apps', app, '.clasp.json');
if (process.env.SCRIPT_ID) {
  fs.writeFileSync(path.join(dist, '.clasp.json'), JSON.stringify({ scriptId: process.env.SCRIPT_ID, rootDir: '.' }, null, 2));
} else if (fs.existsSync(claspLocal)) {
  const conf = JSON.parse(fs.readFileSync(claspLocal, 'utf8'));
  fs.writeFileSync(path.join(dist, '.clasp.json'), JSON.stringify({ scriptId: conf.scriptId, rootDir: '.' }, null, 2));
}

const arquivos = [];
(function listar(dir) {
  for (const i of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, i.name);
    if (i.isDirectory()) listar(p);
    else arquivos.push(path.relative(dist, p));
  }
})(dist);
console.log(`Build ${app} (${info.commit}) -> dist/${app} [${arquivos.length} arquivos]`);
