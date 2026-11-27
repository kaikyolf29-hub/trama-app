# Decisões

Cada decisão importante numa linha, com data e motivo. A mais nova fica embaixo. Mudou de ideia?
Não apague: escreva uma linha nova dizendo o que substitui.

## Tarefa #1 — Fundação do repositório

- 2026-11-27 · **Monorepo com pnpm 12 (fixado em `packageManager`) + Turborepo 2.** Motivo: é o que o plano pede, na versão atual de cada um; o pnpm fixado garante a mesma versão no CI e nas máquinas.
- 2026-11-27 · **Instalar o pnpm 12 direto (`npm install -g pnpm@12` ou `corepack enable`), não pela troca automática a partir de um pnpm 10 ou 11.** Motivo: a troca automática não roda o script de instalação do pnpm 12 e deixa um arquivo de texto no lugar do binário nativo; o Turborepo então falha de vez em quando com "Exec format error".
- 2026-11-27 · **Manter o `minimumReleaseAge` padrão do pnpm 12 (recusa pacotes publicados há menos de um dia), sem exceções.** Motivo: proteção contra pacote comprometido recém-publicado; por isso o Vite ficou em 8.3.8 em vez do 8.4.0 lançado na véspera.
- 2026-11-27 · **Node 24 LTS no CI (`.nvmrc`); `engines` a partir de 22.12.** Motivo: LTS com manutenção até 2028 e com corepack incluído; 22.12 é o mínimo do Vite 8 e do Vitest 5.
- 2026-11-27 · **TypeScript 6.0, não 7.** Motivo: o typescript-eslint só aceita TypeScript abaixo de 6.1; o TypeScript 7 (nativo) entra quando o lint suportar.
- 2026-11-27 · **Pacotes internos sem etapa de build: `exports` aponta para `src/index.ts`.** Motivo: Vite, Vitest e o wrangler já compilam TypeScript; menos etapas e nenhum `dist` desatualizado entre pacotes.
- 2026-11-27 · **No Turborepo, `typecheck` e `test` dependem da mesma tarefa nos pacotes de que dependem.** Motivo: sem build entre pacotes, é isso que faz o cache do site invalidar quando o `core` muda.
- 2026-11-27 · **Versões compartilhadas (TypeScript, Vitest, zod, @types/node) no `catalog` do `pnpm-workspace.yaml`.** Motivo: uma versão só para todos os pacotes, sem os dois agentes divergirem.
- 2026-11-27 · **zod 4 para os esquemas de `packages/core`.** Motivo: valida em tempo de execução e gera os tipos; também exporta JSON Schema, que servirá para as ferramentas MCP e a saída estruturada da IA.
- 2026-11-27 · **Código e dados em inglês; interface e documentação em português.** Motivo: é o padrão das bibliotecas e dos dois agentes, e o plano já usa nomes de tabela em inglês. O glossário fica no `AGENTS.md`.
- 2026-11-27 · **Passo da aula se chama `PresentationStep`.** Motivo: "lesson" já é a aula dos cadernos de Estudos (tabela `lessons`).
- 2026-11-27 · **Posições sempre absolutas no quadro, inclusive de blocos dentro de moldura (`frameId`).** Motivo: mais simples para a IA, o MCP e o layout automático; o `packages/canvas` converte para o formato relativo do React Flow.
- 2026-11-27 · **A ordem da lista `presentation` é a ordem do modo aula; um passo revela vários nós; cada nó fica em no máximo um passo.** Motivo: a tela 2 mostra imagem e cartão revelados juntos no mesmo passo.
- 2026-11-27 · **O selo de status ("Vídeo pronto") é o campo `status` do cartão, não um bloco solto, e marcado exige `doneAt`.** Motivo: o plano diz "dentro do cartão de projeto" e a tela 1 mostra assim; a hora alimenta a Agenda.
- 2026-11-27 · **"Vídeo ou link" é um bloco `link`; se é YouTube, Vimeo ou outro site sai da URL por `parseLinkEmbed`, sem ser guardado.** Motivo: evita a mesma informação gravada duas vezes e fora de sincronia.
- 2026-11-27 · **Os dados do fluxo guardam nomes de token (`yellow`, `serif`, `strong`), nunca hex.** Motivo: nenhuma cor fora dos tokens, e o modo claro vira só uma troca de valores.
- 2026-11-27 · **Bloco de texto: texto simples com listas por linha ("- " e "1. "), com fonte, tamanho, cor, negrito e itálico valendo para o bloco todo.** Motivo: é o que a barra de contexto da tela 1 oferece e é fácil para a IA gerar; texto rico (Tiptap) fica para Roteiros e Estudos.
- 2026-11-27 · **A integridade do fluxo é checada no próprio esquema: ids únicos no documento, setas e passos apontando para nós existentes, `frameId` válido.** Motivo: o site, a API, a IA e o MCP ganham a mesma garantia de nunca gravar um fluxo que o quadro não abre.
- 2026-11-27 · **Roteiro e caderno têm `content` livre até a V1.** Motivo: os formatos serão definidos junto com essas telas; o tipo do projeto já precisa existir para a tabela `projects`.
- 2026-11-27 · **ESLint 10 com regras de tipo do typescript-eslint, mais duas regras do Trama: hex só em `packages/ui/tokens.ts` e nada de emoji no código de interface.** Motivo: transforma o "nunca fazer" do `AGENTS.md` em erro de CI.
- 2026-11-27 · **Prettier, conferido no CI.** Motivo: dois agentes no mesmo repositório; evita PRs com diferenças só de formatação.
- 2026-11-27 · **Um job de CI: tipos, lint, formatação, testes e build.** Motivo: rápido o bastante por enquanto; o preview na Cloudflare entra junto com o deploy, na tarefa de login.
- 2026-11-27 · **`apps/api` e `apps/mcp` ficam vazios, sem Hono nem wrangler.** Motivo: entram com o login e o deploy; instalar agora seria código sem uso.
- 2026-11-27 · **`packages/ui/tokens.ts` não foi criado.** Motivo: `packages/ui` é do Codex e os tokens são a próxima tarefa dele; o lint já reserva esse arquivo como o único lugar de hex.
- 2026-11-27 · **`apps/desktop` não foi criado.** Motivo: é da Fase 4.
- 2026-11-27 · **`.env.example` usa as chaves novas do Supabase (publicável e secreta), não `anon` e `service_role`.** Motivo: são o modelo atual de chaves do Supabase e podem ser trocadas sem derrubar o app.
- 2026-11-27 · **`docs/PLAN.md` é a transcrição completa do PDF do plano de 26 nov 2026.** Motivo: o arquivo ainda não existia no repositório; transcrever tudo evita perder detalhes que um resumo cortaria.
- 2026-11-27 · **As imagens de `docs/telas/` foram geradas do canvas da prévia, sem executar scripts.** Motivo: a pasta ainda não existia; o HTML de cada artboard foi convertido em página estática e capturado em 2x.
