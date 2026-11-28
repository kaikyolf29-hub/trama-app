<!-- Cópia do roteiro que a sessão do Claude Code passava aos agentes (Sonnet, em worktrees).
Os caminhos de /tmp/claude-0/... eram do contêiner daquela sessão: numa sessão nova, troque pelo
scratchpad dela e instale o pnpm 12 e o Postgres local como descrito em docs/ANDAMENTO.md. -->

# Roteiro comum dos agentes do Trama

Você é um agente trabalhando numa etapa do Trama (app de quadro visual, estilo Miro com a cara do
Notion escuro). Quem coordena é a sessão principal: ela revisa e faz o merge. Você entrega um PR
pronto e testado. **Não faça merge de nada.**

## Antes de começar

1. Leia `AGENTS.md`, `CLAUDE.md`, `docs/DECISIONS.md` (decisões já tomadas: siga-as),
   `docs/DESIGN.md` e as seções do `docs/PLAN.md` da sua etapa. Veja a tela de referência em
   `docs/telas/` (abra a imagem com a ferramenta Read).
2. Olhe o código que já existe antes de criar algo: `packages/core` (contrato, zod 4),
   `packages/canvas` (quadro em React Flow 13, `FlowCanvas.tsx`, `canvas-context.ts`, `steps.ts`,
   `edit.ts`), `packages/ui` (tokens, componentes, ícones em `@trama/ui/icons`), `apps/web`
   (TanStack Router em `router.ts`, `services.ts`, `api/projects-api.ts`, `api/autosave.ts`,
   páginas em `pages/`), `apps/api` (Hono, `src/projects/*`), `supabase/` (migrations e testes SQL).

## Ambiente

- pnpm 12 fica fora do PATH padrão. Em todo comando:
  `export PATH=/tmp/claude-0/-home-user-trama-app/34c3a2cd-524f-502e-a196-1366bfd6a783/scratchpad/pnpm12/bin:$PATH`
- No seu worktree, rode `pnpm install --frozen-lockfile` primeiro. Adicionar dependência só com
  motivo escrito no PR (e respeitando o `minimumReleaseAge` do pnpm: se uma versão nova demais for
  recusada, use a anterior).
- `pnpm check` (tipos, lint, formatação, testes) precisa passar antes do PR. Rode `pnpm format`
  antes. `pnpm build` também precisa passar.
- Chromium e Playwright já estão instalados: `require('playwright')` funciona; **não rode
  `playwright install`**. Para ver a tela, suba o site com
  `pnpm --filter @trama/web exec vite --port <SUA_PORTA> --strictPort` em segundo plano e tire
  capturas (deviceScaleFactor 1) para conferir. Use a porta que o seu pedido indicar.
- Páginas que precisam de login: no Playwright, salve uma sessão falsa em
  `localStorage['sb-jebksiyftodpbvhndoqf-auth-token']` (JSON com access_token, refresh_token,
  token_type 'bearer', expires_in 3600, expires_at agora+3600 em segundos, e user com id, email,
  aud/role 'authenticated', user_metadata.name), bloqueie `https://jebksiyftodpbvhndoqf.supabase.co/**`
  (route.abort) e simule a API (`http://localhost:8787/**`, com cabeçalhos CORS) com `page.route`.
  Nunca crie conta nem dado no Supabase de produção.
- Banco: **não aplique migration no Supabase de produção** (isso pede aprovação da pessoa dona).
  Escreva o arquivo em `supabase/migrations/` (nome `AAAAMMDDHHMMSS_nome.sql`, hora UTC atual) e o
  teste em `supabase/tests/<nome>_rls.sql` (transação com `rollback`, como os que existem).
  Dá para testar num Postgres 16 local que já está rodando, com uma imitação do `auth` e do
  `storage` do Supabase. O banco `trama_base` tem as migrations da `main` (até a 1.5) aplicadas;
  crie o seu a partir dele e aplique só as suas (e as do PR em que o seu se apoia):
  `createdb -h /var/tmp/trama-pg -p 5433 -U postgres -T trama_base <nome_do_seu_banco>` e
  `psql -h /var/tmp/trama-pg -p 5433 -U postgres -d <nome_do_seu_banco> -v ON_ERROR_STOP=1 -f <arquivo>`.
  Rode todos os testes de `supabase/tests/` no fim (cada um termina em `rollback`).
- Segredos: nunca no código, em log ou commit. Valores ficam nos painéis (Cloudflare, Supabase,
  GitHub). Variáveis novas vão no `.env.example` com explicação.
- Só planos grátis. Nada pago.

## Regras de código (resumo do AGENTS.md)

- A interface fala português do Brasil (claro, curto, sem jargão); o código fala inglês.
  Comentários em português.
- Toda cor vem de `packages/ui/tokens.ts` (o lint recusa hex fora de lá e emoji na interface).
  Espaços em múltiplos de 8 px, animações de ~150 ms, sem degradê nem brilho.
- Toda entrada externa é validada com os esquemas de `@trama/core`. Mudança no core vai num PR
  só dela, antes dos PRs que a usam (abra o PR do core primeiro e empilhe o resto em cima).
- Tabela nova sempre com RLS. Nunca edite migration já aplicada.
- Teste o que fizer (Vitest; jsdom não mede elementos, então o React Flow não desenha setas nem
  mede nós lá: use funções puras testáveis e confira o visual no navegador).
- Registre as decisões que mudam como o projeto funciona em `docs/DECISIONS.md` (uma linha com
  data 2026-11-27 e motivo), numa seção da sua etapa.

## Git e PR

- Branch a partir da `main` atual (`git fetch origin main`), com o nome indicado no seu pedido.
- Commits em Conventional Commits, em português. Toda mensagem de commit termina com:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01UCt5kjSDXUXWeLDVnqWug8
  ```
- Push com `git push -u origin <branch>` (tente de novo até 4 vezes se a rede falhar).
- Abra o PR com as ferramentas do GitHub (`mcp__github__create_pull_request`, repositório
  `kaikyolf29-hub/trama-app`, base `main` ou a branch do seu PR anterior se estiver empilhado),
  seguindo `.github/pull_request_template.md` (Etapa, O que mudou, Como testar, Checklist), em
  português, com frases claras e listas curtas. Diga o que você conferiu no navegador.
  O corpo termina com:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  https://claude.ai/code/session_01UCt5kjSDXUXWeLDVnqWug8

  ---
  _Generated by [Claude Code](https://claude.ai/code)_
  ```
- Não faça merge, não feche PR de ninguém, não comente em outros PRs.

## Ao terminar, responda (curto, até 15 linhas)

- Branch(es) e link(s) do(s) PR(s), na ordem de merge.
- O que entrou, em poucas linhas.
- Quantos testes passam no `pnpm check` e o que conferiu no navegador.
- Migration criada (se houver) e o que precisa ser aplicado.
- O que ficou de fora ou precisa da pessoa dona do projeto (contas, chaves).
