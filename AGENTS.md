# AGENTS.md — regras comuns do Trama

Fonte única de regras para o Claude Code e o Codex. O `CLAUDE.md` importa este arquivo.
O plano completo está em `docs/PLAN.md`; as decisões, em `docs/DECISIONS.md`.

O Trama é um app web de quadro visual (estilo Miro, com a cara do Notion no modo escuro) para
montar fluxos de vídeo, aulas, planos e roteiros, salvar no Google Drive da pessoa e transformar
fala em fluxo com IA. A referência visual oficial são as 8 telas em `docs/telas/`.

## Stack

| Camada      | Escolha                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| Monorepo    | pnpm 12 + Turborepo, tudo em TypeScript                                        |
| Site        | React 19 + Vite (`apps/web`); depois TanStack Router e Zustand                 |
| Quadro      | React Flow (`@xyflow/react`) em `packages/canvas`                              |
| Contrato    | zod 4 em `packages/core`                                                       |
| Estilo      | Tailwind CSS com os tokens de `packages/ui/tokens.ts`                          |
| API e MCP   | Hono em Cloudflare Workers (`apps/api`, `apps/mcp`)                            |
| Dados       | Supabase (Postgres, Auth, Storage, RLS) e cópia no Google Drive (`drive.file`) |
| E-mail      | Resend + React Email (`packages/emails`)                                       |
| IA          | SDKs oficiais de Anthropic, Google e OpenAI em `packages/ai`                   |
| Testes e CI | Vitest, Playwright, GitHub Actions                                             |

Node 24 (`.nvmrc`). Instale o pnpm 12 de verdade (`npm install -g pnpm@12` ou
`corepack enable`): a troca automática a partir de um pnpm 10 ou 11 deixa um binário quebrado
(veja `docs/DECISIONS.md`).

## Comandos

Rode sempre da raiz.

| Comando          | O que faz                                                      |
| ---------------- | -------------------------------------------------------------- |
| `pnpm install`   | Instala tudo                                                   |
| `pnpm dev`       | Sobe o site (localhost:5173) e a API (localhost:8787)          |
| `pnpm test`      | Testes de todos os pacotes (Vitest)                            |
| `pnpm typecheck` | Checagem de tipos de todos os pacotes                          |
| `pnpm lint`      | ESLint no código e Stylelint nas folhas de estilo              |
| `pnpm format`    | Formata com Prettier (`pnpm format:check` só confere)          |
| `pnpm build`     | Build de produção                                              |
| `pnpm check`     | Tipos + lint + formatação + testes: rode antes de abrir um PR  |
| `pnpm e2e`       | Playwright: constrói o site e testa os fluxos e os 500 blocos  |
| `pnpm e2e:perf`  | Só o teste de desempenho com 500 blocos (usa o `dist/` pronto) |

Um pacote só: `pnpm --filter @trama/core test`. O CI roda typecheck, lint, formatação,
testes e build em todo PR (`.github/workflows/ci.yml`); o deploy na Cloudflare publica a `main`
e um preview de cada PR (`docs/DEPLOY.md`).

Testes de ponta a ponta (`apps/web/e2e`, Playwright, `*.e2e.ts`): rodam contra o site construído
(`vite build` + `vite preview`) com o login do Supabase e a API simulados no navegador, sem tocar
em nada de verdade. Antes da primeira vez: `pnpm --filter @trama/web exec playwright install
chromium` (no CI, `--with-deps`). Variáveis: `E2E_PORT` (porta, padrão 4173), `E2E_SKIP_BUILD=1`
(reaproveita o `dist/`), `E2E_PERF_*` (limites do teste de 500 blocos, veja `perf.e2e.ts`). Um
arquivo por assunto (`auth`, `home`, `board`, `project`, `perf`); o `support/` tem a API falsa
(`FakeApi`), a sessão falsa e os ajudantes do quadro. O job `e2e` do CI roda tudo e guarda o
relatório como artefato quando falha.

## Quem faz o quê

Desde 27 nov 2026 (`docs/DECISIONS.md`):

- **Claude Code faz tudo**: código, telas, componentes, e-mails, testes, banco e deploy. Ele
  decide o que é técnico e faz o merge quando o CI está verde.
- **Codex revisa no fim.** Quando o Claude Code termina, o Codex sobe o projeto no ambiente na
  nuvem, testa e escreve o relatório no GitHub. O Claude Code recebe o aviso e corrige.
- **O que só a pessoa dona do projeto pode fazer** (contas, chaves, painéis, pagamentos): o
  Claude Code escreve um pedido pronto para o Codex, que controla o computador da pessoa e faz.
  O mesmo vale para **imagens** (ilustração, arte, foto): o Codex gera. Ícones e o logo são SVG
  em código.
- **Só planos grátis.** Nada pago enquanto o projeto não crescer; quando crescer, os planos pagos
  previstos em `docs/PLAN.md` ("Custos estimados") entram por decisão da pessoa dona do projeto.

| Pasta                                      | O que é                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| raiz, `.github/`, `AGENTS.md`, `CLAUDE.md` | Monorepo, CI e regras                                                    |
| `tooling/`                                 | Regras de lint do Trama (cor só nos tokens, sem emoji) e os testes delas |
| `packages/core`                            | Tipos do fluxo, esquemas zod, regras de negócio                          |
| `packages/ui`                              | Tokens (`tokens.ts`), componentes e o logo                               |
| `packages/canvas`                          | Blocos, setas, seleção, atalhos, modo aula                               |
| `packages/emails`                          | Modelos de e-mail                                                        |
| `packages/ai`                              | Provedores, prompts, saída em JSON                                       |
| `apps/web`                                 | Site: casca, login e as telas                                            |
| `apps/api`                                 | Worker Hono: projetos, Drive, e-mails, tarefas agendadas                 |
| `apps/mcp`                                 | Servidor MCP                                                             |
| `supabase/`                                | Migrations, RLS, configuração do login e modelos de e-mail do Auth       |
| `docs/`                                    | Plano, decisões e telas de referência                                    |

## O contrato: `packages/core`

- É o formato que o site, a API, a IA e o MCP compartilham. Valide toda entrada externa
  (corpo de requisição, saída da IA, chamada MCP, arquivo `.trama`) com os esquemas dele.
- Mudança no core entra **antes**, num PR próprio, e só depois as telas que a usam.
- Mudou o formato do fluxo? Suba `FLOW_SCHEMA_VERSION` e escreva a migração.
- Dados guardam **nomes de token** (`yellow`, `serif`, `strong`), nunca hex.
- Pacotes internos exportam o código TypeScript direto (`"exports": "./src/index.ts"`); não
  há etapa de build entre pacotes.

Glossário (a interface fala português; o código, inglês):

| Na interface                                                             | No código                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| fluxo / roteiro / caderno                                                | `flow` / `script` / `notebook` (`ProjectKind`)                           |
| bloco                                                                    | `Block`                                                                  |
| texto, cartão, nota adesiva, forma, imagem, vídeo ou link, etapas, áudio | `text`, `card`, `sticky`, `shape`, `image`, `link`, `checklist`, `audio` |
| selo de status ("Vídeo pronto")                                          | `StatusBadge` (campo `status` do cartão)                                 |
| moldura                                                                  | `Frame`                                                                  |
| seta                                                                     | `Arrow`                                                                  |
| nó (bloco ou moldura)                                                    | `nodeId`                                                                 |
| passo da aula (modo aula)                                                | `PresentationStep`                                                       |
| aula de um caderno (Estudos)                                             | `Lesson` (tabela `lessons`), não confundir                               |

## Branches, commits e PRs

1. Cada tarefa segue as etapas de `docs/PLAN.md` ("Roadmap por fases"): a tela de referência e o
   critério de pronto vêm de lá.
2. Branch `claude/<número>-<nome>`, a partir da `main` (ou da branch da tarefa anterior, quando
   ela ainda espera o merge).
3. Commits em Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`.
4. PR pequeno, seguindo `.github/pull_request_template.md`: o que mudou, como testar e uma
   imagem quando mexer em tela.
5. O Claude Code faz o merge quando o CI está verde. PRs empilhados entram em ordem, com commit
   de merge (sem squash), e o seguinte passa a apontar para a `main`.
6. A revisão do Codex vem no fim, no GitHub. Como os dois agentes usam a mesma conta, a revisão é
   um comentário que termina com **Aprovar** ou **Pedir mudanças**, com cada ponto marcado como
   `[bloqueia]`, `[sugestão]` ou `[nit]`. O autor responde em cada conversa e resolve o que
   corrigiu.

## Regras visuais

- O quadro vem primeiro; criar um fluxo leva no máximo 3 cliques.
- Preto e branco, sem degradê, sem brilho, sem emoji. Cor só para dar significado: seleção,
  concluído, notas.
- Toda cor vem de `packages/ui/tokens.ts`. O lint recusa hex fora de lá (no código e no CSS) e
  emoji no código de interface; as regras e os testes delas estão em `tooling/`.
- Espaçamento em múltiplos de 8 px; animações de ~150 ms; sombra discreta só em blocos e menus
  flutuantes.
- Cada tarefa de tela aponta a tela de `docs/telas/` que está reproduzindo.

## O que nunca fazer

- Cor fora dos tokens, degradê ou emoji na interface.
- Segredo no código, em log ou em commit. O repositório só tem o `.env.example`; os valores
  ficam nos painéis da Cloudflare, do Supabase e do GitHub.
- Ler chave de IA fora do Worker da API ou devolvê-la ao navegador.
- Tabela sem RLS, ou editar uma migration já aplicada (crie outra).
- Gravar fluxo sem validar com `@trama/core`.
- Push direto na `main`, merge com CI vermelho, ou pular, desligar ou apagar teste para o CI
  passar.
- Contratar plano pago ou serviço cobrado sem a pessoa dona do projeto pedir.
- Copiar código do AppFlowy (AGPL-3.0) ou usar o tldraw (exige licença paga em produção).
- Adicionar dependência sem motivo registrado no PR.
- Começar algo da V1 antes de o portão da Fase 1 ser cumprido.
