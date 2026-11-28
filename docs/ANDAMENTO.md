# Andamento do Trama

Passagem de bastão em **28 nov 2026, 12h UTC**. A sessão do Claude Code parou aqui a pedido da
pessoa dona do projeto, que vai continuar a partir de outra conta. Este arquivo diz o que está no
ar, o que está aberto, o que falta e como continuar. O resto está nos lugares de sempre:
`AGENTS.md` (regras), `docs/PLAN.md` (plano), `docs/DECISIONS.md` (decisões), `docs/DEPLOY.md`
(deploy).

## O que está no ar

- Site: https://trama.trama-kaiky.workers.dev · API: https://trama-api.trama-kaiky.workers.dev
  (preview de cada PR em `https://pr-<N>-trama.trama-kaiky.workers.dev`).
- Supabase: projeto `trama` (`jebksiyftodpbvhndoqf`, sa-east-1, plano grátis). Migrations
  aplicadas, na ordem: `profiles`, `arquivos`, `projetos`, `drive`, `boas_vindas`,
  `agenda_aulas`, `ia` — os arquivos em `supabase/migrations/` têm a versão aplicada no nome.
- **Teste de fumaça em produção (28 nov, 11:32 UTC)**, com uma conta temporária apagada em
  seguida: criar conta, Início, criar fluxo e ver "Salvo", Agenda com o evento "Fluxo criado",
  Configurações e a tela Falar e organizar — tudo passou, sem erro no console nem resposta de erro
  da API. Capturas em `docs/andamento/capturas/`. O roteiro do teste está em
  `docs/processo/teste-de-fumaca-producao.cjs`.

## Etapas (cópia do painel de acompanhamento)

O painel ao vivo era um Artifact da conta anterior (https://claude.ai/artifact/LtCYaYKwWA17XHxH2svGFK);
em outra conta ele não abre. A cópia completa dos dados (etapas, painel e registro com 41 entradas)
está em `docs/andamento/painel.json`.

| Etapa   | O que entra                                                                         | Estado                                                                                  |
| ------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 0.1–0.6 | Fundação: monorepo, tokens, Supabase, e-mails, login, deploy                        | Feito                                                                                   |
| 1.1–1.5 | Quadro, blocos, imagem/vídeo/link/etapas, setas e atalhos, salvamento com histórico | Feito                                                                                   |
| 1.6     | Google Drive e e-mails da API (#19, #23, #30)                                       | Feito no código; liga quando o Codex fizer a Parte A de `docs/processo/pedido-codex.md` |
| 1.7     | Modo aula (#22, #27)                                                                | Feito                                                                                   |
| 1.8     | Modelos de início e tela Início (#20, #21)                                          | Feito                                                                                   |
| 1.9     | Playwright e teste de 500 blocos no CI (#24)                                        | Feito                                                                                   |
| 2.1–2.2 | Roteiro/caderno/eventos no core, tabelas e Agenda (#25, #28, #31)                   | Feito                                                                                   |
| 2.3     | Roteiros com Tiptap                                                                 | **PRs #37 e #42 abertos**                                                               |
| 2.4     | Estudos                                                                             | **PRs #36 e #40 abertos**                                                               |
| 2.5     | Configurações (#26, #29)                                                            | Feito; falta o modelo de e-mail de troca no Supabase (pedido ao Codex)                  |
| 2.6     | Resumo semanal e lembrete de revisão                                                | **PR #43 aberto** (empilhado no #40)                                                    |
| 3.1     | IA: Claude, Gemini, ChatGPT, chaves cifradas, Configurações → IA (#32, #34)         | Feito; liga com a `TOKEN_ENCRYPTION_KEY` no Worker                                      |
| 3.2     | Voz local com Whisper (#33)                                                         | Feito                                                                                   |
| 3.3     | Falar e organizar com a IA, layout automático, Inserir no quadro                    | **PRs #39 e #44 abertos**                                                               |
| 3.4     | Conector MCP                                                                        | **PRs #41 e #45 abertos**                                                               |
| 4.1     | Exportar PNG e PDF, link só para leitura                                            | A fazer                                                                                 |
| 4.2     | Domínio, SPF e DKIM, Supabase Pro                                                   | Fica para quando o projeto crescer (é pago)                                             |
| 4.3     | App de computador com Tauri                                                         | A fazer                                                                                 |

## PRs abertos, na ordem de merge

Os nove PRs abaixo foram feitos por agentes (Sonnet) e **ainda não foram revisados nem tiveram o
CI conferido** por quem coordena. Cada pilha começa por um PR só do core. Para cada um: fazer
merge da `main` na branch, resolver conflitos (quase sempre só `docs/DECISIONS.md`, com
`docs/processo/resolver-decisions.py`, e às vezes `packages/core/src/index.ts`, `apps/api/src/deps.ts`,
`apps/web/src/env.ts` e `services.ts`, onde é preciso juntar as duas partes), rodar
`pnpm check` e `pnpm e2e`, esperar o CI verde e fazer o merge com commit de merge (sem squash).
Depois do merge de um PR, o seguinte da pilha passa a apontar para a `main`.

1. **Roteiros (2.3):** #37 (core) → #42.
2. **Estudos e e-mails (2.4, 2.6):** #36 (core) → #40 → #43. O #43 traz a migration
   `20261128065500_emails_estudos.sql` e usa a chave secreta do Supabase **só** na tarefa agendada
   e no descadastro: revisar com cuidado (funções liberadas só para `service_role`). Depois do
   merge: aplicar a migration (com aprovação), renomear o arquivo para a versão aplicada e pedir
   ao Codex a Parte B do `pedido-codex.md`.
3. **Falar e organizar (3.3):** #39 (core) → #44.
4. **Conector MCP (3.4):** #41 (core) → #45. Precisa do namespace KV e do segredo do Worker (Parte
   B do `pedido-codex.md`); o `deploy.yml` passa a publicar o `trama-mcp`.

Os quatro PRs de core mexem em `packages/core/src/index.ts`: o segundo a entrar vai conflitar.

## Pendências da pessoa dona do projeto (via Codex)

Tudo em `docs/processo/pedido-codex.md`, pronto para mandar ao Codex:

- **Parte A (já):** projeto no Google Cloud (Drive API, Picker API, cliente OAuth, chave de API),
  API key do Resend, segredos do Worker `trama-api` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `TOKEN_ENCRYPTION_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`), variáveis do GitHub
  (`VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`) e o modelo de troca de e-mail no Supabase.
- **Parte B (depois dos merges):** `SUPABASE_SECRET_KEY` e `API_URL` (após #43); namespace KV,
  `MCP_KV_NAMESPACE_ID` e `MCP_ENCRYPTION_KEY` (após #45).

Sem a Parte A, o Drive, os e-mails da API e a IA ficam desligados em produção (o resto funciona).

## Pontos para a revisão do Codex e melhorias anotadas

- A seção IA de Configurações mostra o campo da chave mesmo sem a `TOKEN_ENCRYPTION_KEY` no
  Worker; salvar dá erro em vez de avisar antes ("a IA ainda não está ligada neste ambiente").
- A troca de senha confere a senha atual só no navegador (`secure_password_change` está desligado
  no Supabase, como na etapa 0.3).
- O Security Advisor aponta três funções `security definer` chamáveis por quem tem login
  (`claim_drive_notice`, `claim_welcome_email`, `release_welcome_email`): são intencionais, mexem
  só na linha da própria pessoa e têm limite (`docs/DECISIONS.md`, etapa 1.6).
- O selo "Vídeo pronto" ainda não gera evento na Agenda (só o status do projeto "concluído").
- Voz: WebGPU de verdade não foi testado (só WASM); a escolha do modelo padrão (base ou small)
  com voz humana fica com a pessoa dona do projeto.
- O remetente de teste do Resend (`onboarding@resend.dev`) só entrega no e-mail da própria conta:
  para outras pessoas receberem, é preciso domínio próprio (etapa 4.2, paga).

## Próximos passos, em ordem

1. Revisar e fazer o merge das quatro pilhas acima (ordem sugerida: 2.3, 2.4/2.6, 3.3, 3.4).
2. Aplicar a migration do #43 e pedir ao Codex as Partes A e B.
3. Etapa 4.1 (exportar PNG/PDF e link só para leitura) e 4.3 (Tauri).
4. Repetir o teste de fumaça em produção e pedir a revisão final do Codex (veja `AGENTS.md`).

## Como continuar (processo que vinha funcionando)

- **Quem faz o quê:** o Claude Code coordena; o trabalho grande vai para agentes (Sonnet, esforço
  médio ou alto) em worktrees isolados, em pacotes grandes, com o roteiro de
  `docs/processo/roteiro-dos-agentes.md`. O coordenador revisa cada PR (contrato, migrations,
  segurança), resolve conflitos, confere no navegador e faz o merge. O limite de 5 horas do
  Sonnet acaba em cerca de uma hora com 3 ou 4 agentes; depois de voltar, os agentes retomam de
  onde pararam.
- **pnpm 12 de verdade** (`npm install -g pnpm@12`); a troca automática a partir do pnpm 10 deixa
  um binário quebrado.
- **Postgres local para testar migrations:** um Postgres 16 com a imitação mínima do Supabase em
  `docs/processo/supabase-local-shim.sql` (papéis `anon`/`authenticated`, `auth.users`,
  `auth.uid()` e o `storage`). Criar um banco base, aplicar o shim e as migrations em ordem, e
  rodar os testes de `supabase/tests/` (cada um termina em `rollback`).
- **Migration em produção:** só com a aprovação da pessoa dona (o `apply_migration` do conector
  do Supabase pede). Depois, renomear o arquivo para a versão aplicada.
- **Conflitos em `docs/DECISIONS.md`:** `python3 docs/processo/resolver-decisions.py docs/DECISIONS.md`
  mantém as duas partes (primeiro a da `main`).
- **Nunca:** segredo no repositório ou no chat, plano pago, merge com CI vermelho, dado de teste
  deixado em produção.
