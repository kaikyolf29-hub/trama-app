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

| Comando          | O que faz                                                     |
| ---------------- | ------------------------------------------------------------- |
| `pnpm install`   | Instala tudo                                                  |
| `pnpm dev`       | Sobe o site em http://localhost:5173                          |
| `pnpm test`      | Testes de todos os pacotes (Vitest)                           |
| `pnpm typecheck` | Checagem de tipos de todos os pacotes                         |
| `pnpm lint`      | ESLint no repositório inteiro                                 |
| `pnpm format`    | Formata com Prettier (`pnpm format:check` só confere)         |
| `pnpm build`     | Build de produção                                             |
| `pnpm check`     | Tipos + lint + formatação + testes: rode antes de abrir um PR |

Um pacote só: `pnpm --filter @trama/core test`. O CI roda typecheck, lint, formatação,
testes e build em todo PR (`.github/workflows/ci.yml`).

## Estrutura e dono de cada pasta

Quem faz escreve; quem revisa aprova. **Quem escreve não aprova.**

| Pasta                                        | O que é                                                             | Quem faz    | Quem revisa |
| -------------------------------------------- | ------------------------------------------------------------------- | ----------- | ----------- |
| raiz, `.github/`, `AGENTS.md`, `CLAUDE.md`   | Monorepo, CI e regras                                               | Claude Code | Codex       |
| `packages/core`                              | Tipos do fluxo, esquemas zod, regras de negócio                     | Claude Code | Codex       |
| `supabase/`                                  | Migrations, RLS, login                                              | Claude Code | Codex       |
| `packages/canvas`                            | Blocos, setas, seleção, atalhos, modo aula                          | Claude Code | Codex       |
| `apps/api`                                   | Worker Hono; salvamento e sincronia com o Drive                     | Claude Code | Codex       |
| `packages/ai`                                | Provedores, prompts, saída em JSON                                  | Claude Code | Codex       |
| `apps/mcp`                                   | Servidor MCP                                                        | Claude Code | Codex       |
| `packages/ui`                                | Tokens e componentes                                                | Codex       | Claude Code |
| `apps/web` (telas)                           | Início, Roteiros, Estudos, Agenda, Configurações, Falar e organizar | Codex       | Claude Code |
| `packages/emails`                            | Modelos de e-mail e resumo semanal                                  | Codex       | Claude Code |
| testes Vitest e Playwright dos fluxos de uso | Um teste por fluxo de uso                                           | Codex       | Claude Code |
| exportar PNG/PDF, link de compartilhamento   | V1                                                                  | Codex       | Claude Code |
| `apps/desktop` (Tauri)                       | Fase 4, ainda não existe                                            | Codex       | Claude Code |
| `docs/`                                      | Plano, decisões, telas                                              | quem decide | o outro     |

Em `apps/web`, a casca (configuração, roteamento, login e a página que monta o quadro) é do
Claude Code; as telas são do Codex. Mexer na pasta do outro só pelo PR dele ou com aviso na
issue.

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

1. Cada tarefa nasce de uma issue com a etiqueta `agente:claude` ou `agente:codex`, a tela de
   referência e os critérios de pronto.
2. Branch `claude/<número>-<nome>` ou `codex/<número>-<nome>`, sempre a partir da `main`.
3. Commits em Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`.
4. PR pequeno, seguindo `.github/pull_request_template.md`: o que mudou, como testar e uma
   imagem quando mexer em tela.
5. Nada entra na `main` sem CI verde e a revisão do outro agente. Quem faz o merge é a pessoa
   dona do projeto, depois de olhar o preview.

## Regras visuais

- O quadro vem primeiro; criar um fluxo leva no máximo 3 cliques.
- Preto e branco, sem degradê, sem brilho, sem emoji. Cor só para dar significado: seleção,
  concluído, notas.
- Toda cor vem de `packages/ui/tokens.ts`. O lint recusa hex fora de lá e emoji no código de
  interface.
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
- Push direto na `main`, aprovar o próprio PR, ou pular, desligar ou apagar teste para o CI
  passar.
- Copiar código do AppFlowy (AGPL-3.0) ou usar o tldraw (exige licença paga em produção).
- Adicionar dependência sem motivo registrado no PR.
- Começar algo da V1 antes de o portão da Fase 1 ser cumprido.
