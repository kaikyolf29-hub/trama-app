# packages/ai — IA

Feito pelo Claude Code, revisado pelo Codex no fim · Etapa 3.1

Uma interface só (`AiProvider`: `listModels`, `organize`, `estimate`) para Claude, Gemini e ChatGPT, com os SDKs oficiais. Traduz o esforço da tela (Rápido, Equilibrado, Caprichado) para o parâmetro de cada provedor e sempre o envia de forma explícita. Só o Worker da API usa este pacote: a chave da pessoa nunca chega ao navegador.

- `src/anthropic.ts`, `google.ts`, `openai.ts`: um provedor por arquivo. Erros do SDK viram `AiError`, com um `code` do core e uma frase em português.
- `prompts/`: um prompt por formato e versão (`flow.v1.ts`, `plan.v1.ts`, `prompt.v1.ts`), com um exemplo de entrada e saída que os testes conferem no core. Mudou o texto de forma que muda a saída? Crie a `v2` e aponte `prompts/index.ts` para ela.
- `src/testing.ts` (`@trama/ai/testing`): `fetch` falso e provedor falso. Nenhum teste chama a rede.

A saída da IA é validada com os esquemas de `@trama/core` (`aiFlowOutputSchema`, `aiPromptOutputSchema`) antes de sair daqui, e `aiOutputToFlow` (no core) a converte num fluxo.
