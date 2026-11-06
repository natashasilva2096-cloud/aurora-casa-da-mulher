# Arquitetura

## Camadas

```
apps/aurora/src
├── Main.js          doGet (roteamento), health check, setup, rotina de manutenção
├── Api.js           fachada chamada pelo navegador (google.script.run); formata respostas e erros
├── servicos/        casos de uso (cadastro, contatos, alerta, pontos, atendimento)
├── core/            regras puras: Config, Geo, Alerta, Agendamento  ← testadas sem Google
├── infra/           Sessao (Cache), EmailGateway (MailApp), MapsGateway (Maps), DadosIniciais
└── ui/              Index + App (aplicativo), Rastreio (página dos contatos)
shared/src
├── core/            Erros, Validacao, Seguranca
├── infra/           Ambiente, Repositorio (Sheets + Lock), Log
└── ui/Estilos.html  design compartilhado pelos dois apps
```

Regra de dependência: `ui → Api → servicos → core`. Só `infra` e `shared/infra` tocam serviços do Google.

## Restrições do Apps Script e como são tratadas

| Restrição | Solução | Protegida por |
|---|---|---|
| Todos os `.js` compartilham **um escopo global** | Cada arquivo define um único namespace (`var X = (function(){…})()`) | `contrato.test.js › nomes globais repetidos` |
| A ordem de carregamento dos arquivos é indefinida | Nenhum arquivo usa outro no carregamento, só dentro de funções | `contrato.test.js › carrega sozinho` |
| `google.script.run` não chama funções com `_` no fim | Funções privadas terminam com `_`; públicas começam com `api_` | `contrato.test.js › chamadas da interface` |
| Não existe `require`/`import` | Cada arquivo termina com `if (typeof module !== 'undefined') module.exports = …`, que no Apps Script é ignorado e no Node permite testar | carregador `test/helpers/carregarApp.js` |
| Sem KDF nativo para senha | SHA-256 + salt + 200 iterações (risco residual documentado) | `Seguranca.test.js` |
| Sheets converte texto em número/data | Colunas formatadas como texto e tipos convertidos na leitura | `Repositorio` + `pontos.test.js › booleano` |
| Injeção de fórmula em células | Valores começando com `=`, `+` ou `@` recebem um apóstrofo | `usuaria.test.js › injeção de fórmula` |

## Modelo de dados (planilha por ambiente)

| Aba | Conteúdo | Retenção |
|---|---|---|
| Usuarias | cadastro, hash da senha, perfil, data do consentimento | até a exclusão da conta |
| Contatos | contatos de confiança | até remoção ou exclusão da conta |
| Acionamentos | alertas (status, token do link, última posição, resultado do envio, duração) | coordenadas apagadas 30 dias após o fim |
| Localizacoes | histórico de posições durante o alerta | 30 dias |
| PontosSeguros | locais oficiais (`validado` = TRUE/FALSE) | mantido pela equipe |
| Agendamentos | solicitações psicossocial/jurídico | desvinculadas da titular se a conta for excluída |
| Logs | eventos técnicos, **sem dados pessoais** | 90 dias |

## Integração com o Aurora Abrigo (fase 2)

O Abrigo é um projeto Apps Script separado, com outra planilha, para isolar os endereços sigilosos. A integração planejada:

1. Na fase 2, a equipe da Casa da Mulher busca anfitriões compatíveis com a necessidade da usuária (`ServicoAnfitriao.buscarCompativeis`), que devolve **apenas a visão pública**.
2. O endereço só é liberado pela equipe, fora do app, depois do contato com as duas partes.
3. Para isso o Aurora vai chamar o Abrigo por um endpoint autenticado (`doPost` com chave de serviço), nunca pelo navegador da usuária.
