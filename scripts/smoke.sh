#!/usr/bin/env bash
# Smoke test pós-deploy: chama ?action=health do web app e confere
#   1) HTTP 200 com JSON válido;
#   2) ok == true (planilha, abas, pontos seguros e núcleo funcionando);
#   3) commit == commit esperado (teste de confirmação: a versão nova está no ar).
#
# Uso: scripts/smoke.sh <URL_DO_WEB_APP> [COMMIT_ESPERADO]
set -euo pipefail

URL="${1:?Informe a URL /exec do web app}"
ESPERADO="${2:-}"
TENTATIVAS="${SMOKE_TENTATIVAS:-6}"
ESPERA="${SMOKE_ESPERA:-10}"

for i in $(seq 1 "$TENTATIVAS"); do
  echo "Tentativa $i/$TENTATIVAS: ${URL}?action=health"
  if RESP=$(curl -fsSL --max-time 30 "${URL}?action=health"); then
    if echo "$RESP" | jq -e . >/dev/null 2>&1; then
      OK=$(echo "$RESP" | jq -r '.ok')
      COMMIT=$(echo "$RESP" | jq -r '.commit')
      echo "$RESP" | jq .
      if [[ -n "$ESPERADO" && "$COMMIT" != "${ESPERADO:0:7}" ]]; then
        echo "Commit publicado ($COMMIT) ainda não é o esperado (${ESPERADO:0:7})."
      elif [[ "$OK" == "true" ]]; then
        echo "SMOKE OK"
        exit 0
      else
        echo "::error::Health check respondeu ok=false — avisos: $(echo "$RESP" | jq -c '.avisos')"
        exit 1
      fi
    else
      echo "Resposta não é JSON (o deploy pode estar sem acesso anônimo)."
    fi
  fi
  sleep "$ESPERA"
done

echo "::error::Smoke test falhou após $TENTATIVAS tentativas"
exit 1
