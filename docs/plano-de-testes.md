# Plano de testes

Continua o **Plano de Qualidade Preliminar** da 1ª entrega do A3 e o leva para testes automatizados executados no pipeline.

## 1. Estratégia: orientada a risco

A pergunta-guia é: *o que pode dar errado, qual o impacto e que evidência precisamos antes de liberar?*

| Área | Risco | Prioridade (A3) | Profundidade de teste |
|---|---|---|---|
| Botão de pânico e localização (RF03/RF04) | Alerta não chega; posição errada ou exposta | **Crítica** | Unidade + integração + sistema + cenários de falha (FMECA) + aceitação |
| Contatos, rotas e pontos (RF02/RF05/RF06) | Contato não recebe; rota para local não oficial | Alta | Unidade + integração + sistema |
| Cadastro, psicossocial e jurídico (RF01/RF07/RF08) | Dado inválido; atendimento perdido | Média | Unidade + integração |
| Segurança e privacidade (RNF01/RNF02) | Vazamento de dados de vítimas | **Máxima** (atributo prioritário) | Unidade + integração + contrato (estático) |
| Pipeline e ferramentas de manutenção | Falha silenciosa no CI/CD | Média | Unidade + validação de configuração |

## 2. Pirâmide de testes

```
                 ▲  Aceitação (manual): CT-ACE01, CT-ACE02 — com a equipe e um grupo focal
                ▲▲  Sistema (simulado): CT-SIS01, CT-SIS02 — fluxo completo pela API pública
              ▲▲▲▲  Integração / contrato: serviços + fakes do Google, regras do Apps Script
          ▲▲▲▲▲▲▲▲  Unidade: regras puras (validação, distância, estados, GUT, Pareto)
```

Os serviços do Google (Sheets, MailApp, Maps, Cache, Lock) são substituídos por **fakes em memória** (`test/helpers/gasFakes.js`). Os fakes também simulam falhas: e-mail que falha uma vez ou sempre, cota esgotada, Maps fora do ar, geocodificação sem resultado. Assim os testes de integração rodam em segundos, sem conta Google e com resultado determinístico.

Depois do deploy, o **smoke test** (`scripts/smoke.sh`) verifica o ambiente real. Ele também é um **teste de confirmação**: confere se o `commit` publicado é o esperado.

## 3. Técnicas de projeto de casos aplicadas

| Técnica | Onde |
|---|---|
| Particionamento de equivalência | e-mail, telefone (DDD válido/inválido, celular/fixo), senha, coordenadas |
| Análise de valor-limite | senha 7/8/64/65; e-mail 254/255; 5 contatos aceita, 6 rejeita; expiração 12 h ± 1 ms; agendamento +60/+61 dias; GUT 11/12, 35/36, 79/80; capacidade do abrigo |
| Tabela de decisão | situação do envio (ENVIADO, PARCIAL, FALHOU, SEM_CONTATOS); compatibilidade anfitrião × necessidade |
| Transição de estados | alerta (ATIVO, ENCERRADO, EXPIRADO), atendimento (SOLICITADO → CONFIRMADO → REALIZADO / CANCELADO), cadastro do abrigo, bloqueio de login após 5 tentativas |
| Baseado em cenários | CT-SIS01: fluxo de emergência completo |
| Baseado em falhas (FMECA) | sem GPS, e-mail falhando, cota esgotada, duplo toque, Maps indisponível, concorrência |

## 4. Matriz de rastreabilidade

| Requisito | Caso de teste (A3) | Teste automatizado |
|---|---|---|
| RF01 Cadastro | CT-U01 Validação de cadastro | `shared/test/Validacao.test.js`, `aurora/test/integracao/usuaria.test.js` |
| RF01 / RNF01 | CT-U02 Criptografia (hash da senha) | `shared/test/Seguranca.test.js`, `usuaria.test.js › grava a usuária com hash` |
| RF02 Contatos | (novo) CRUD, limite, isolamento por usuária | `contatos.test.js` |
| RF03 Botão de pânico | CT-INT01 Integração com geolocalização | `alerta.test.js › CT-INT01` |
| RF03 Botão de pânico | CT-INT02 Disparo do serviço de alerta | `alerta.test.js › CT-INT02`, `Alerta.test.js › mensagem de alerta` |
| RF03 / RF04 | CT-SIS01 Fluxo de emergência completo | `api-e-main.test.js › CT-SIS01` |
| RNF05 / RNF06 | CT-SIS02 Desempenho e stress (< 5 s) | `alerta.test.js › CT-SIS02` (simulado) + teste manual em staging (seção 6) |
| RF04 Localização em tempo real | (novo) atualização, expiração, privacidade do link | `alerta.test.js › RF04`, `› encerramento, expiração…` |
| RF05 Rotas seguras | Critério de aceite: só destinos oficiais validados | `Geo.test.js › RF06`, `pontos.test.js › critério de aceite` |
| RF06 Pontos seguros | (novo) proximidade, filtro, sem GPS | `Geo.test.js`, `pontos.test.js` |
| RF07 / RF08 | CT-ACE01 Homologação com a equipe (parte automatizável) | `Agendamento.test.js`, `atendimento.test.js` |
| RNF02 Privacidade | Critério de aceite: compartilhamento só com autorização | `Validacao.test.js › consentimento LGPD`, `alerta.test.js › rastreio só enquanto ATIVO` |
| RNF03 Usabilidade | CT-ACE02 Grupo focal (manual) | Roteiro na seção 6 |
| RNF07 Manutenibilidade | (novo) contratos do Apps Script | `contrato.test.js` (escopo global, carregamento isolado, front ↔ back) |
| ABRIGO | (novo) regras e sigilo do endereço | `abrigo/test/unit/Anfitriao.test.js`, `abrigo/test/integracao/anfitriao.test.js` |
| CI/CD | (novo) gates, triagem GUT, Pareto | `test/ferramentas/*.test.js` |

## 5. Critérios de saída (quality gates)

Um PR só entra na `main` quando passa por todos estes gates:

1. **Lint** sem erros.
2. **100% dos testes** passando (unidade, integração, contrato, ferramentas).
3. **Cobertura mínima**: 80% de linhas e statements no geral e **90% no `core/` do Aurora** (regras críticas). Este número **não** é meta de qualidade, só um alarme de área sem teste. A força da suíte está nos asserts de comportamento e nos cenários de falha.
4. **Build** dos dois apps gerado.

Para liberar em produção, também é preciso:

5. **Smoke test de staging** com `ok: true` e o commit esperado.
6. **Aprovação manual** de uma integrante no environment `producao`.
7. **Nenhum defeito aberto** com `prioridade:critica` no RF03/RF04.

## 6. Testes manuais (não automatizáveis no protótipo)

### CT-ACE02: usabilidade com grupo focal

- **Missão**: com o app aberto na tela inicial, peça "você está sendo seguida, peça ajuda". Cronometre do pedido até o alerta enviado.
- **Critérios**: concluir sem ajuda em menos de 10 s; nenhum acionamento acidental em 1 minuto de uso livre da tela; a usuária entende o status ("Contatos avisados", "Compartilhando").
- **Registrar**: tempo, erros, dúvidas e frases ditas. Defeitos viram issue com `Onde foi encontrado = Homologação (CT-ACE)`.

### CT-ACE01: homologação com a equipe técnica

- Um membro com perfil `EQUIPE_PSICOSSOCIAL` confirma e conclui uma solicitação. Outro, `EQUIPE_JURIDICA`, não deve enxergá-la.
- Conferir se a lista de **pontos seguros** (endereços, telefones e horários) está correta. Ela veio de fontes públicas e **precisa ser validada pela Casa da Mulher**.

### CT-SIS02 no ambiente real (staging)

Os testes automatizados medem a lógica, mas não a latência do Google. Em staging:

1. Crie 3 contas de teste, cada uma com 2 contatos (e-mails da equipe).
2. Acione o pânico nas 3 ao mesmo tempo, em celulares diferentes.
3. Anote a coluna `duracaoMs` da aba **Acionamentos** e o horário de chegada dos e-mails. Critério: `duracaoMs` < 5000 e e-mail recebido em até 1 minuto.

### Sessão de teste exploratório (45 min)

**Missão**: explorar o botão de pânico com foco em interrupções, como GPS negado, modo avião no meio do alerta, recarregar a página, bloquear a tela e voltar, ou pressionar duas vezes.

## 7. Métricas acompanhadas

| Métrica | Fonte | Decisão que apoia |
|---|---|---|
| Taxa de aprovação da suíte | resumo do pipeline | estabilidade; investigar produto, ambiente ou teste |
| Tempo de feedback do pipeline | duração do job Qualidade | manter abaixo de 10 min |
| Cobertura (linhas, ramos) | `coverage/` | localizar áreas sem teste no `core/` |
| Taxa de defeitos escapados | relatório mensal | eficácia dos testes pré-produção |
| Pareto de defeitos por causa e por requisito | relatório mensal | onde concentrar a próxima ação (80/20) |
| MTTR (tempo médio de correção) | relatório mensal | capacidade de manutenção corretiva |
| Flakiness | reexecuções do pipeline | quarentena e correção de testes instáveis |
