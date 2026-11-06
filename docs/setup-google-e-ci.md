# Configuração: Google Apps Script + GitHub Actions

Faça isto **uma vez**. Até lá, o pipeline roda normalmente os gates de qualidade e apenas pula o deploy, com um aviso.

São 4 projetos Apps Script: Aurora (staging e produção) e Aurora Abrigo (staging e produção). Cada um tem sua própria planilha de dados, então os testes em staging nunca misturam dados com produção.

## 1. Preparar a conta Google

1. Entre na conta Gmail que vai hospedar os projetos.
2. Abra https://script.google.com/home/usersettings e **ative a "API do Google Apps Script"**. Sem isso o `clasp` não consegue enviar o código.

## 2. Fazer login do clasp na sua máquina

```bash
npm ci
npx clasp login
```

O navegador abre para autorizar. Depois disso existe o arquivo `~/.clasprc.json` (no Windows: `C:\Users\<você>\.clasprc.json`). **Não commite este arquivo**: ele dá acesso à sua conta.

## 3. Criar os projetos

Repita para cada combinação (`Aurora (staging)`, `Aurora (produção)`, `Aurora Abrigo (staging)`, `Aurora Abrigo (produção)`):

1. Em https://script.google.com clique em **Novo projeto** e dê o nome.
2. Vá em **Configurações do projeto (⚙)**, copie o **ID do script** e marque **"Mostrar o arquivo de manifesto appsscript.json"**.
3. Envie o código pela primeira vez:
   ```bash
   SCRIPT_ID=<id-do-script> node scripts/build.js aurora     # ou abrigo
   cd dist/aurora && npx clasp push --force && cd ../..
   ```
   No PowerShell: `$env:SCRIPT_ID="<id>"; node scripts/build.js aurora`
4. De volta ao editor, em **Configurações do projeto → Propriedades do script**, adicione:
   | Propriedade | Valor |
   |---|---|
   | `AMBIENTE` | `staging` ou `producao` |
   | `EMAIL_EQUIPE_PSICOSSOCIAL` | (opcional) e-mail que recebe aviso de novas solicitações |
   | `EMAIL_EQUIPE_JURIDICA` | (opcional) idem para o jurídico |
   | `EMAIL_EQUIPE_ABRIGO` | (opcional, só no Abrigo) |
5. No editor, selecione a função **`setup`** e clique em **Executar**. Autorize as permissões (planilha, e-mail, gatilhos, Maps). O log mostra a URL da planilha criada e `saude.ok: true`.
6. **Implantar → Nova implantação → ⚙ App da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa** (os contatos de confiança abrem o link de rastreio sem conta Google)
   - Copie o **ID da implantação** (`AKfycb…`) e a **URL do app da Web** (`…/exec`).
7. Volte às **Propriedades do script** e adicione `APP_URL` = a URL `/exec` do passo anterior. É ela que vai no link de rastreio enviado por e-mail.
8. Teste: abra `<URL>/exec?action=health`. O resultado deve ser `"ok": true`.

> A partir daqui, o pipeline atualiza **sempre o mesmo deployment**, então a URL de cada ambiente não muda.

## 4. Configurar o GitHub

Em **Settings → Secrets and variables → Actions**:

**Secret** (aba *Secrets*):

| Nome | Valor |
|---|---|
| `CLASPRC_JSON` | conteúdo inteiro do arquivo `~/.clasprc.json` |

**Variables** (aba *Variables*). Não são secretas:

| Nome | Valor |
|---|---|
| `SCRIPT_ID_AURORA_STAGING` | ID do script Aurora (staging) |
| `DEPLOYMENT_ID_AURORA_STAGING` | ID da implantação Aurora (staging) |
| `SCRIPT_ID_AURORA_PRODUCAO` | … |
| `DEPLOYMENT_ID_AURORA_PRODUCAO` | … |
| `SCRIPT_ID_ABRIGO_STAGING` | … |
| `DEPLOYMENT_ID_ABRIGO_STAGING` | … |
| `SCRIPT_ID_ABRIGO_PRODUCAO` | … |
| `DEPLOYMENT_ID_ABRIGO_PRODUCAO` | … |

**Environments** (Settings → Environments):

- `staging`: sem regras.
- `producao`: marque **Required reviewers** e adicione as integrantes da equipe. Esse é o gate de aprovação manual antes de produção.

**Proteção da main** (Settings → Branches → Add rule para `main`):

- Require a pull request before merging (1 aprovação)
- Require status checks to pass → selecione **Qualidade**

## 5. Conferir

Faça um commit na `main` (ou rode **Actions → Pipeline → Run workflow**). O fluxo esperado é:
`Qualidade ✔ → Staging · aurora ✔ / Staging · abrigo ✔ → (aprovar) → Produção ✔`.

## Perfis da equipe (painel de atendimento)

Toda conta nasce com o perfil `USUARIA`. Para dar acesso ao painel, edite a coluna `perfil` da aba **Usuarias** na planilha do ambiente:
`EQUIPE_PSICOSSOCIAL`, `EQUIPE_JURIDICA` ou `ADMIN`.

## Riscos conhecidos desta configuração

- O `CLASPRC_JSON` dá ao pipeline acesso aos projetos Apps Script da conta. Em repositório público, workflows disparados por *fork* não recebem secrets, mas **não aprove** a execução de workflows de PRs de desconhecidos. Para uso real, crie uma conta Google só para o projeto.
- O MailApp de conta Gmail gratuita envia cerca de **100 e-mails por dia**. O health check avisa quando a cota acaba. Para produção real, o canal de alerta precisa de um gateway dedicado (SMS ou WhatsApp).
