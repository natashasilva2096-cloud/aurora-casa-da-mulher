#!/usr/bin/env bash
# Publica um app em um projeto Apps Script e atualiza o deployment fixo do ambiente.
# A URL do web app não muda entre versões, porque o deployment é reaproveitado.
#
# Uso: scripts/deploy.sh <app> <script_id> <deployment_id> [descricao]
# Requer: variável CLASPRC_JSON com o conteúdo de ~/.clasprc.json (login do clasp)
set -euo pipefail

APP="${1:?app (aurora|abrigo)}"
SCRIPT_ID="${2:?script id}"
DEPLOYMENT_ID="${3:?deployment id}"
DESCRICAO="${4:-deploy $(date -u +%Y-%m-%dT%H:%MZ)}"

if [[ -n "${CLASPRC_JSON:-}" ]]; then
  printf '%s' "$CLASPRC_JSON" > "$HOME/.clasprc.json"
  chmod 600 "$HOME/.clasprc.json"
fi

SCRIPT_ID="$SCRIPT_ID" node scripts/build.js "$APP"
CLASP="$(pwd)/node_modules/.bin/clasp"

cd "dist/$APP"
echo "Enviando arquivos ($APP)…"
"$CLASP" push --force
echo "Criando versão e atualizando o deployment $DEPLOYMENT_ID…"
"$CLASP" update-deployment "$DEPLOYMENT_ID" --description "${DESCRICAO:0:90}"
echo "Publicado: https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"
