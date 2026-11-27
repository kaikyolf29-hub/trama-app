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

## Revisão do PR #1 e mudança de plano

- 2026-11-27 · **O Claude Code faz todas as etapas; o Codex só revisa, no GitHub.** Motivo: pedido da pessoa dona do projeto; substitui a divisão por pastas da primeira versão do plano.
- 2026-11-27 · **Imagens geradas (ilustração, arte, foto) são pedidas à pessoa dona do projeto, que pede ao Codex; ícones e logo são SVG em código.** Motivo: o Claude Code não gera imagens.
- 2026-11-27 · **A revisão do Codex é um comentário que termina com "Aprovar" ou "Pedir mudanças", com os pontos marcados como `[bloqueia]`, `[sugestão]` ou `[nit]`.** Motivo: os dois agentes usam a mesma conta do GitHub, que não deixa o autor de um PR aprovar ou pedir mudanças formalmente.
- 2026-11-27 · **Login por e-mail e senha (nome, e-mail e senha no cadastro), com recuperação de senha; sem login com Google por enquanto.** Motivo: pedido da pessoa dona do projeto; o Google continua só para a cópia no Drive.
- 2026-11-27 · **Todos os e-mails levam o logo do Trama.** Motivo: pedido da pessoa dona do projeto.
- 2026-11-27 · **As regras de lint do Trama ficam em `tooling/`, com testes de regressão.** Motivo: a revisão mostrou que bandeiras escapavam da regra de emoji; agora cada caso pego vira teste.
- 2026-11-27 · **A regra de emoji cobre pictogramas, indicadores regionais (bandeiras), U+FE0F e U+20E3.** Motivo: toda sequência de emoji tem ao menos um desses pontos de código; setas como "→" e "▾" continuam aceitas.
- 2026-11-27 · **Stylelint com `color-no-hex` em todo CSS, sem exceção.** Motivo: o ESLint não lê CSS, e uma cor fixa numa folha de estilo passava no CI; o CSS usa as variáveis dos tokens.
- 2026-11-27 · **Só `packages/ui/tokens.ts` pode ter hex, e ele faz parte do projeto TypeScript do `packages/ui`.** Motivo: a segunda exceção (`src/tokens.ts`) abria uma brecha, e fora do `tsconfig` o arquivo nem passava no lint.
- 2026-11-27 · **`parseLinkEmbed` só reconhece caminhos de UM vídeo do Vimeo e guarda o `hash` dos vídeos não listados.** Motivo: uma página de coleção (showcase, album) virava um vídeo inexistente no quadro; sem o hash, o player não toca vídeo não listado.
- 2026-11-27 · **O bloco de texto inteiro usa uma fonte e um tamanho; título e lista da tela 1 são dois blocos.** Motivo: o editor, o modo aula e a exportação desenham o bloco do mesmo jeito, sem uma regra escondida de "primeira linha é título".
- 2026-11-27 · **Node a partir de 22.22.2 ou 24.15.** Motivo: é o mínimo do Stylelint 18.

## Etapa 0.2 — Tokens e componentes base

- 2026-11-27 · **O tema do Tailwind 4 vem dos tokens por `@config` (`apps/web/tailwind.config.ts` → `@trama/ui/tailwind-theme`).** Motivo: `tokens.ts` continua sendo a única fonte, e nenhum CSS precisa escrever uma cor.
- 2026-11-27 · **O tema substitui a paleta padrão do Tailwind.** Motivo: `bg-red-500` ou `text-white` não existem, então ninguém usa cor fora dos tokens nem por engano.
- 2026-11-27 · **Os nomes de cor viram kebab-case no Tailwind (`textStrong` → `bg-text-strong`).** Motivo: com camelCase as classes saíam como `bg-textStrong`, e o botão principal ficou sem fundo; há um teste para isso.
- 2026-11-27 · **Fontes servidas pelo próprio site (`@fontsource-variable`): Inter, Lora, JetBrains Mono e Caveat.** Motivo: sem pedido ao Google Fonts a cada visita; a mono e a manuscrita do plano ficam definidas.
- 2026-11-27 · **Erros usam o par rosa das notas; sucesso, o verde de concluído; informação, o azul.** Motivo: o plano só permite cor com significado, e esses pares já existem nos tokens, todos com contraste AA testado.
- 2026-11-27 · **Vitrine dos componentes em `#design` até o roteador chegar (etapa 0.5).** Motivo: dá para revisar os componentes no navegador, e o Codex consegue testar a etapa no ambiente dele.

## Etapa 0.4 — E-mails com o logo

- 2026-11-27 · **E-mails no visual escuro do app (fundo do quadro, cartão de superfície, botão claro), com o logo e o nome no topo.** Motivo: pedido de e-mails caprichados com o logo, no preto e branco do Trama.
- 2026-11-27 · **O logo vai como PNG hospedado no site (`/email/logo.png`, 80×80).** Motivo: vários programas de e-mail não mostram SVG, e o Gmail bloqueia imagens embutidas; os e-mails do Supabase Auth também não aceitam anexo.
- 2026-11-27 · **O modelo de recuperação de senha do Supabase é gerado do componente React (`supabase/templates/recovery.html`), com um teste que avisa quando ficou desatualizado.** Motivo: um só desenho para os e-mails do Supabase e os do Resend.
- 2026-11-27 · **O modelo do Supabase sai sem quebra de linha automática.** Motivo: a quebra caiu no meio de um `{{ else }}` dos modelos do Supabase.
- 2026-11-27 · **O script de instalação do esbuild (dependência do tsx) fica negado em `allowBuilds`.** Motivo: o pnpm 12 recusa instalar com script não decidido, e o esbuild não precisa dele, porque o binário vem no pacote da plataforma.

## Etapa 0.5 — Login e o novo jeito de trabalhar

- 2026-11-27 · **O Claude Code faz o merge quando o CI está verde; o Codex revisa tudo no fim, no GitHub.** Motivo: pedido da pessoa dona do projeto; substitui a revisão do Codex a cada PR.
- 2026-11-27 · **PRs empilhados entram em ordem, com commit de merge (sem squash).** Motivo: com squash, o PR seguinte reapareceria com os commits do anterior e daria conflito.
- 2026-11-27 · **O que só a pessoa dona do projeto pode fazer (contas, chaves, painéis) e as imagens geradas viram um pedido pronto para o Codex, que controla o computador dela.** Motivo: pedido dela, para tirar o máximo de trabalho das mãos dela.
- 2026-11-27 · **Só planos grátis; os pagos de "Custos estimados" só se o projeto crescer.** Motivo: pedido da pessoa dona do projeto, sem mudar o plano.
- 2026-11-27 · **Cadastro sem confirmar o e-mail: a pessoa cria a senha e já entra.** Motivo: é o fluxo que a pessoa dona do projeto descreveu. O risco (alguém usar um e-mail que não é seu) fica aceito; a tela já trata o caso de confirmação se ela for ligada no Supabase.
- 2026-11-27 · **Rotas com TanStack Router, definidas em código (`apps/web/src/router.ts`).** Motivo: é o roteador do plano; em código, sem gerador de arquivos, fica mais simples enquanto são poucas rotas.
- 2026-11-27 · **As guardas das rotas perguntam a sessão ao cliente de login, e não ao estado do React.** Motivo: logo depois de entrar, o estado do React ainda está atrasado e a pessoa voltaria para /entrar.
- 2026-11-27 · **O `volta` do login só aceita caminhos do próprio site, conferido na rota e de novo na tela.** Motivo: o TanStack Router mantém os parâmetros originais quando a validação devolve um objeto vazio, e um teste pegou `?volta=//outro.site` levando para fora.
- 2026-11-27 · **A recuperação de senha usa o `token_hash` no link (`/nova-senha?token_hash=…`), conferido pela tela com `verifyOtp`.** Motivo: o link padrão do Supabase só funciona no navegador que pediu a troca, e é comum pedir no computador e abrir no celular; programas que abrem links de e-mail também não gastam o token.
- 2026-11-27 · **Senha de 8 a 72 caracteres.** Motivo: 8 é o mínimo combinado para o Supabase; acima de 72 o bcrypt ignora o resto.
- 2026-11-27 · **Sem as variáveis do Supabase, o site abre e as telas de login explicam o que falta.** Motivo: `pnpm dev` funciona do zero, sem conta nenhuma.
- 2026-11-27 · **As "skills" de agente que vêm em dependências (o pnpm 12 pergunta) ficam negadas.** Motivo: seriam instruções para os agentes vindas de fora do repositório; as regras deles estão no AGENTS.md.

## Etapa 0.3 — Supabase

- 2026-11-27 · **Projeto Supabase novo, "trama", em São Paulo (`sa-east-1`), no plano grátis.** Motivo: mais rápido para quem está no Brasil; o projeto que já existia (vazio, nos EUA) ficou intocado, e o plano grátis permite dois.
- 2026-11-27 · **`profiles` nasce sozinho no cadastro (gatilho em `auth.users`), com o nome de `user_metadata.name`, e só pode ser lido e editado pela própria pessoa.** Motivo: o app não precisa criar perfil, e nada além de nome, fuso e preferências de e-mail pode ser mudado pelo app.
- 2026-11-27 · **Funções de gatilho no esquema `private`, com `search_path` vazio e sem permissão de execução pela API.** Motivo: funções `security definer` no esquema público ficariam expostas pela API.
- 2026-11-27 · **Testes de RLS em SQL (`supabase/tests/`), que rodam dentro de uma transação e desfazem tudo.** Motivo: dá para provar as regras no projeto real sem deixar dado, e sem precisar de Docker.
- 2026-11-27 · **`apps/web/.env` entra no repositório, só com a URL e a chave publicável do Supabase.** Motivo: são valores públicos (vão para o navegador), e assim `pnpm dev` já fala com o login de verdade; segredos continuam fora.
- 2026-11-27 · **Configuração do login versionada em `supabase/config.toml`; no projeto, os mesmos valores vão pelo painel, com o endereço publicado no lugar de localhost.** Motivo: o conector do Supabase não muda a configuração do login, então o painel é ajustado pelo Codex, seguindo este arquivo.
- 2026-11-27 · **E-mails do login pelo SMTP do Resend, remetente `onboarding@resend.dev` até existir um domínio.** Motivo: domínio é pago; sem ele, o Resend grátis só entrega no e-mail do dono da conta, o que basta para testar.

## Etapa 0.6 — Deploy na Cloudflare

- 2026-11-27 · **O site vai para o Cloudflare Workers como arquivos estáticos (`assets` com `single-page-application`), não para o Pages.** Motivo: plano grátis, a mesma plataforma da API, e preview por PR com as `preview_urls` do Workers.
- 2026-11-27 · **Produção a cada merge na `main`; preview do site em cada PR com `wrangler versions upload --preview-alias pr-<n>`, com o link num comentário do PR.** Motivo: é o "preview em todo PR" do plano, sem serviço extra.
- 2026-11-27 · **Sem os segredos da Cloudflare (ou em PR de fork), o deploy é pulado com um aviso, e o CI continua verde.** Motivo: o repositório funciona antes da conta existir, e um fork nunca recebe os segredos.
- 2026-11-27 · **A API ganha o esqueleto em Hono (`GET /health`) e sobe junto com o site.** Motivo: o plano põe site e API no ar na Fase 0; as rotas chegam etapa por etapa.
- 2026-11-27 · **O script de instalação do workerd (do wrangler) fica negado, como o do esbuild; todas as permissões de dependência ficam em `permissions` no `pnpm-workspace.yaml`.** Motivo: o binário já vem no pacote da plataforma, e uma seção só é mais fácil de revisar.
- 2026-11-27 · **Sem telemetria do wrangler no deploy (`WRANGLER_SEND_METRICS=false`).** Motivo: nada sai do CI além do próprio deploy.

## Etapa 1.1 — Quadro base

- 2026-11-27 · **React Flow 13 (`@xyflow/react`, MIT), com as mudanças aplicadas por `NodeChangeset.applyTo`.** Motivo: é o quadro do plano; na versão 13 o `applyNodeChanges` deu lugar ao `NodeChangeset`.
- 2026-11-27 · **A conversão entre o core e o React Flow fica em `packages/canvas/src/convert.ts`: posição absoluta no core, relativa à moldura no React Flow (`parentId`), e de volta encaixada na grade de 8 px.** Motivo: o resto do app só conhece o formato do core.
- 2026-11-27 · **Molduras ficam numa camada abaixo de todos os blocos.** Motivo: a moldura é o fundo da seção e nunca cobre um bloco.
- 2026-11-27 · **Os pontos de conexão ficam no meio de cada borda e servem de saída e de chegada (modo de conexão solto).** Motivo: a seta "sai do meio da borda" (plano) e pode ligar qualquer lado a qualquer lado.
- 2026-11-27 · **Ícones da Lucide (ISC, traço fino), reexportados por `@trama/ui/icons` com nomes do Trama.** Motivo: o mesmo estilo de ícone da tela 1 em todo o app.
- 2026-11-27 · **Tokens novos da tela 1: fundo e borda da moldura, traço da seta e o véu do minimapa.** Motivo: o quadro desenha essas cores, e cor só existe nos tokens.
- 2026-11-27 · **Ferramentas das próximas etapas aparecem desativadas ("em breve"), na ordem da tela 1.** Motivo: a barra já fica no lugar certo e cada etapa só liga a sua ferramenta.
- 2026-11-27 · **`/exemplo` abre o fluxo de vídeo da tela 1 no quadro, sem login.** Motivo: dá para ver e testar o quadro (e o preview de cada PR) antes de os projetos da pessoa chegarem na etapa 1.5.

## Etapa 1.2 — Blocos

- 2026-11-27 · **O conteúdo do fluxo fica numa ref dentro do quadro, e toda mudança (mover, criar, editar, apagar) passa por um `commit` que lê as posições com `getNodes()` e avisa `onFlowChange`.** Motivo: na 1.1 o aviso saía de dentro de um atualizador de estado, o que o React pode rodar duas vezes.
- 2026-11-27 · **Apagar (Delete ou Backspace) passa por `removeNodes`, em `packages/canvas`: some com as setas ligadas, tira o nó dos passos da aula e apaga o passo que ficar vazio. Apagar uma moldura apaga o que está dentro.** Motivo: nada pode ficar apontando para um bloco que não existe (o core recusa), e é assim que o React Flow e o Miro tratam a moldura.
- 2026-11-27 · **Criar: a ferramenta (ou a tecla T, C, N, R, F) vale para um clique; o bloco nasce centrado no clique, na grade, já selecionado e em edição, e a ferramenta volta para selecionar.** Motivo: o fluxo mais curto para escrever logo; clique duplo num ponto vazio cria um texto.
- 2026-11-27 · **O cartão não tem botão na barra: entra pela tecla C.** Motivo: a barra segue a tela 1, que não tem botão de cartão.
- 2026-11-27 · **O texto solto não tem caixa nem fundo; fonte, tamanho e cor valem para o bloco todo, e as linhas "- " e "1. " viram listas.** Motivo: é como o texto aparece na tela 1 e a convenção de listas do core.
- 2026-11-27 · **O selo de status do cartão é uma caixa de marcar (`role="checkbox"`) que guarda a data em que foi marcado.** Motivo: marcar "Vídeo pronto" é um clique, e a data mostra quando ficou pronto.
- 2026-11-27 · **A edição é um campo de texto no lugar do texto, com a mesma fonte; sair do campo ou Esc confirmam, e Enter confirma nos campos de uma linha (título do cartão, nome da moldura).** Motivo: editar parece escrever direto no quadro, sem caixa de diálogo.

## Etapa 1.3 — Imagem, vídeo ou link, e etapas

- 2026-11-27 · **O quadro não sabe onde as imagens moram: quem usa o `FlowCanvas` passa um `CanvasMedia` (subir o arquivo e resolver o endereço). Sem ele, a imagem vale só enquanto a aba estiver aberta.** Motivo: o mesmo quadro serve o exemplo sem login, o app com o Supabase Storage e, depois, o Drive.
- 2026-11-27 · **Imagens aceitas: PNG, JPG, WebP e GIF, até 10 MB. SVG fica de fora.** Motivo: SVG pode carregar script; os outros quatro todo navegador mostra com segurança.
- 2026-11-27 · **O bloco de imagem tem até 280 × 360 px, na proporção da imagem, sem esticar imagem pequena; embaixo vão o nome (ou a legenda) e o tamanho original.** Motivo: é o bloco da thumbnail na tela 1.
- 2026-11-27 · **YouTube e Vimeo só carregam o player depois do clique em tocar (YouTube pelo `youtube-nocookie.com`).** Motivo: o quadro abre rápido mesmo com muitos vídeos, e nada do Google ou do Vimeo carrega antes de a pessoa pedir.
- 2026-11-27 · **Link comum vira cartão com o nome do site; título, descrição e imagem de prévia vêm depois, pela API.** Motivo: o navegador não pode ler outro site (CORS); a prévia precisa do Worker.
- 2026-11-27 · **Colar (fora de um campo) uma imagem ou um link que começa com http cria o bloco onde está o ponteiro. Arrastar arquivos ou links para o quadro também.** Motivo: "colar imagem ou link direto no quadro cria o bloco certo" (plano). Texto comum colado não vira nada.
- 2026-11-27 · **Etapas entram pela tecla E até o menu de blocos chegar com o clique direito (etapa 1.4).** Motivo: a barra da tela 1 não tem botão de etapas.
- 2026-11-27 · **A lista de etapas muda de altura com o número de etapas (56 px + 32 px por etapa + 16 px).** Motivo: as 5 etapas da tela 1 cabem certinho, e nenhuma etapa fica escondida.
- 2026-11-27 · **Token novo `media` (preto) para o fundo do vídeo e o selo de duração.** Motivo: na tela 1 o vídeo é preto, mais escuro que o quadro.
- 2026-11-27 · **Imagens no Supabase Storage, no bucket privado `arquivos` (10 MB, só PNG, JPG, WebP e GIF), em `<id da pessoa>/<uuid>.<ext>`. A RLS só deixa cada pessoa ler e gravar a própria pasta; para mostrar, o app pede uma URL assinada de 1 hora.** Motivo: o Storage grátis tem 1 GB e a RLS já protege sem passar pela API; a cópia no Drive entra na etapa 1.6.
- 2026-11-27 · **O site cria um só cliente do Supabase (`apps/web/src/supabase.ts`), usado pelo login e pelos arquivos.** Motivo: os dois precisam da mesma sessão.
- 2026-11-27 · **Imagem que sai do quadro não é apagada do Storage na hora.** Motivo: o histórico de versões (etapa 1.5) ainda pode apontar para ela; a limpeza vem depois, olhando o que nenhuma versão usa.

## Etapa 1.4 — Setas, seleção, atalhos, barra de contexto e clique direito

- 2026-11-27 · **Toda seta usa um componente só (`arrow-edge.tsx`): curva ou reta pelo campo `route` do core, texto no meio e, selecionada, uma barrinha com Curva, Reta, Texto e Apagar.** Motivo: a seta "pode ser curva ou reta e aceita texto" (plano), e trocar isso tem que estar a um clique.
- 2026-11-27 · **Puxar o ponto azul de um bloco até outro cria a seta; a ferramenta Seta (tecla S) mostra os pontos em todos os blocos. Não se liga um nó a ele mesmo nem se repete uma ligação.** Motivo: o core recusa a seta de um nó para ele mesmo, e duas setas iguais só confundem.
- 2026-11-27 · **Shift, Ctrl ou Cmd somam blocos à seleção; arrastar no vazio faz o laço.** Motivo: "Shift ou o laço de seleção para pegar vários" (plano).
- 2026-11-27 · **O texto e a barrinha da seta ficam acima dos blocos.** Motivo: no React Flow a camada dos rótulos fica embaixo dos nós, e a barrinha sumia atrás de um bloco vizinho (achado no teste no navegador).
- 2026-11-27 · **Desfazer e refazer guardam fotos do fluxo inteiro (até 100), tiradas no mesmo `commit` por onde passa toda mudança. Uma mudança que não muda nada (soltar o bloco no lugar) não entra no histórico nem avisa.** Motivo: um ponto só de gravação deixa o histórico certo para qualquer ação, inclusive as que ainda vão chegar; 100 fotos de um fluxo grande ainda cabem com folga na memória.
- 2026-11-27 · **Ctrl+D duplica a seleção 24 px abaixo e à direita; moldura vem com os blocos de dentro, e setas entre nós copiados vêm junto. Ctrl+G põe os blocos selecionados numa moldura nova com 32 px de folga, já com o nome selecionado para trocar.** Motivo: os atalhos do plano, com o comportamento do Miro; molduras não se aninham, então Ctrl+G ignora molduras na seleção.
- 2026-11-27 · **Os atalhos com Ctrl ou Cmd ficam quietos enquanto a pessoa escreve num campo.** Motivo: ali o Ctrl+Z é o do próprio campo.
- 2026-11-27 · **A barra de contexto usa o `NodeToolbar` do React Flow e só aparece com um nó sozinho na seleção, fora da edição. Texto: fonte, tamanho, negrito, itálico e cor; nota: cor; forma: tipo; todos: "Aula: passo N" e apagar.** Motivo: é a barra da tela 1; com vários nós selecionados ela não teria um valor só para mostrar.
- 2026-11-27 · **Os menus da barra usam `<select>` do navegador, com o visual dos tokens.** Motivo: teclado, leitor de tela e celular funcionam sem código a mais.
- 2026-11-27 · **Clique direito: num nó, duplicar, trazer para frente, travar, passo da aula e apagar; no vazio, o menu de blocos (é por ele que as etapas entram, além da tecla E). Arrastar com o botão direito continua movendo o quadro; o menu só abre se o ponteiro quase não andou.** Motivo: o React Flow não chama o menu do vazio quando o botão direito também move o quadro, então o quadro trata o clique ele mesmo.
- 2026-11-27 · **Nó travado não se move, não apaga e não edita; destrava pelo clique direito.** Motivo: travar serve para proteger o fundo e os títulos enquanto se mexe no resto.
- 2026-11-27 · **O menu do clique direito abre no corpo da página e muda de lado perto da borda.** Motivo: perto do rodapé ele saía da tela (achado no teste no navegador).
- 2026-11-27 · **Guias de alinhamento ao arrastar um nó sozinho: bordas e meio contra bordas e meio dos outros nós, encaixando a até 6 px na tela, e só quando o encaixe fica na grade de 8 px. As linhas azuis atravessam o quadro e somem ao soltar; a barra de contexto some durante o arraste.** Motivo: alinhar sem sair da grade é o que deixa o quadro "premium" (plano); um encaixe fora da grade voltaria 4 px ao salvar.
- 2026-11-27 · **O encaixe troca a mudança de posição antes de o React Flow aplicar (`NodeChangeset.getForNode`, `remove`, `add`).** Motivo: o bloco já aparece no lugar certo durante o arraste, sem pular depois.

## Etapa 1.5 — Salvamento

- 2026-11-27 · **O contrato da API de projetos fica em `packages/core/src/api.ts`: criar (só fluxo até a V1, título padrão "Sem título"), salvar com `baseRevision`, resumo da lista e versão do histórico.** Motivo: site, API e MCP validam a mesma coisa; mudança no core entra antes, num PR só dela.
- 2026-11-27 · **O projeto ganha `revision`, que sobe 1 a cada gravação. Salvar diz em qual revisão o site se baseou; se o projeto mudou em outro lugar, vale a gravação mais nova e a outra vai para o histórico.** Motivo: é a regra do plano para conflito ("vale a versão mais nova, e a anterior fica no histórico"), sem travar ninguém.
- 2026-11-27 · **Projetos em `projects` e versões em `project_versions`, com RLS por dono. Gravar passa pela função `save_project` (uma transação): conflito guarda a gravação substituída como `conflict`; sem conflito, uma foto `autosave` de 10 em 10 minutos; cada projeto guarda as 50 versões mais novas.** Motivo: histórico útil sem uma linha a cada 2 s, e nada se perde num conflito.
- 2026-11-27 · **A API usa a chave publicável com o token de login da pessoa, não a chave secreta.** Motivo: a RLS do banco continua valendo dentro da API; um erro no código não expõe o projeto de outra pessoa.
- 2026-11-27 · **A API só aceita pedidos (CORS) do site, dos previews dos PRs e do `pnpm dev`; corpo de até 5 MB, o mesmo limite do conteúdo no banco.** Motivo: o fluxo de 500 blocos cabe com folga, e nada maior chega ao banco.
- 2026-11-27 · **As rotas falam com um `ProjectStore`: a versão real usa o Supabase; os testes usam uma em memória com as mesmas regras de revisão.** Motivo: testar as rotas (validação, erros, conflito) sem banco; as regras do banco têm o teste em SQL (`supabase/tests/projetos_rls.sql`).
- 2026-11-27 · **Os testes em SQL rodam também num Postgres local com uma imitação mínima do `auth` do Supabase, antes de aplicar a migration no projeto.** Motivo: achar erro de SQL sem mexer no banco de produção, já que aplicar pede aprovação.
- 2026-11-27 · **Salvar sozinho fica numa classe sem React (`Autosaver`): espera 2 s sem mudança, manda só a versão mais nova, nunca dois pedidos ao mesmo tempo, tenta de novo com espera crescente (até 30 s) e usa a revisão devolvida na gravação seguinte.** Motivo: dá para testar com relógio falso, e a regra não se mistura com a tela.
- 2026-11-27 · **Ao trocar de aba ou fechar, o que estiver pendente sai na hora com `keepalive`; fechar com mudança pendente pede confirmação ao navegador.** Motivo: nada se perde se a pessoa fechar antes dos 2 s.
- 2026-11-27 · **O cliente da API valida toda resposta com os esquemas do core; sem conexão vira um aviso em português e o salvamento tenta de novo.** Motivo: a tela nunca recebe dado fora do contrato.
- 2026-11-27 · **O Início ganha a lista "Seus fluxos" e o botão "Novo fluxo", que cria e abre o projeto em um clique (`/p/<id>`).** Motivo: criar um fluxo em até 3 cliques (regra visual); a tela Início completa (tela 4) é a etapa 1.8.
- 2026-11-27 · **Erro 5xx do Supabase Auth não é mais "sem conexão"; na recuperação de senha, vira "Não deu para enviar o e-mail agora".** Motivo: o supabase-js marca respostas 5xx como erro de rede, e no teste do site publicado uma falha do SMTP apareceu como "Confira a internet".

## Etapa 1.7 — Modo aula

- 2026-11-27 · **O modo aula é um segundo quadro só de leitura (outro React Flow, numa camada de tela cheia) montado a partir de uma foto do fluxo na hora de apresentar. O quadro do editor continua por baixo, com `inert`, e os atalhos dele ficam quietos.** Motivo: nada do que acontece na aula (câmera, ocultar, caneta) pode escapar para o fluxo salvo, e o editor volta exatamente como estava.
- 2026-11-27 · **Nó que não está em nenhum passo aparece sempre, como fundo. Bloco dentro de uma moldura que é um passo aparece com a moldura, a não ser que tenha passo próprio.** Motivo: títulos, molduras de contexto e a seção "Vídeo" do exemplo não devem sumir; mandar a moldura inteira para um passo é o jeito mais curto de revelar uma seção.
- 2026-11-27 · **Passo que ainda não chegou vira um quadro tracejado "Passo N · ainda oculto" no lugar do bloco (como na tela 2); o texto só aparece em blocos com 64 px de altura ou mais, e o que só segue a moldura some de vez. Setas ligadas a um nó oculto não aparecem; as ligadas a um passo que já passou ficam discretas.** Motivo: a tela 2 mostra onde o próximo passo vai entrar; um título de 40 px com o texto dentro ficava poluído.
- 2026-11-27 · **Passos que já passaram ficam visíveis a 45% de opacidade; o de agora ganha contorno de 2 px na cor de texto forte (sem brilho nem degradê).** Motivo: dá contexto sem competir com o passo atual, e segue "preto e branco, cor só para significado".
- 2026-11-27 · **A câmera enquadra o retângulo que une os nós do passo, com zoom máximo de 100% e folga para o título e os controles; anda em 600 ms (sem animação com `prefers-reduced-motion`) e enquadra de novo, sem animar, quando a tela muda de tamanho. Sem passos, enquadra o quadro todo e o rodapé explica como criar passos.** Motivo: o enquadramento é uma conta pura (testável sem navegador); 100% de zoom máximo mantém o texto na proporção do editor.
- 2026-11-27 · **Tela cheia pela Fullscreen API ao abrir. Se o navegador recusar, a aula segue numa camada sobre a página; sair da tela cheia pelo navegador (Esc) sai da aula.** Motivo: o Esc em tela cheia é do navegador e não chega ao app; tratar a saída como "sair" mantém o "Esc sai" do plano.
- 2026-11-27 · **Teclas: → ↓ Espaço PageDown avançam; ← ↑ Shift+Espaço PageUp voltam; Home e End vão ao primeiro e ao último; Esc sai; P liga a caneta e L o destaque; Delete limpa o desenho. Espaço em cima de um botão aperta o botão.** Motivo: são as teclas dos controles de apresentação comuns, sem apertar o botão duas vezes.
- 2026-11-27 · **A caneta é um desenho fino (3 px, cor de seleção) em coordenadas da tela, e o destaque é um anel que segue o ponteiro. Os dois valem só durante a aula, nunca entram no fluxo, e o desenho some ao trocar de passo e ao sair. Só um dos dois fica ligado por vez.** Motivo: a anotação vale para o passo em que foi feita; guardar em coordenadas do quadro exigiria acompanhar a câmera sem ganho, já que ela não anda enquanto se desenha.
- 2026-11-27 · **"Ordem da apresentação" é um painel do quadro (botão na barra de ferramentas, abaixo de Moldura) com os passos numerados, nome (título ou nome dos blocos), reordenar (arrastar ou subir e descer), renomear, apagar e "Adicionar a seleção como passo". Tudo passa pelo `commit` do quadro, então entra no desfazer.** Motivo: um caminho só de gravação (decisão da etapa 1.4); apagar o passo não apaga os blocos.
- 2026-11-27 · **O botão "Apresentar" recebe `present` por uma função em `topRight`, que o quadro chama com `CanvasControls`.** Motivo: o botão fica na barra do app (ele escolhe o visual), mas só o quadro sabe o fluxo de agora.
- 2026-11-27 · **O "Ajustar" e o ajuste ao abrir o quadro nunca passam de 100% de zoom (`FIT_VIEW.maxZoom`, em `packages/canvas/src/fit.ts`). O modo aula também para em 100%.** Motivo: com um bloco só o React Flow chegava a 400% e o quadro abria gigante; no modo aula, 100% mantém o texto na proporção do editor.

## Etapa 1.8 — Modelos de início e a tela Início

- 2026-11-27 · **Os modelos de início moram em `packages/core/src/templates/`: cada um é um fluxo válido na grade de 8 px (`FlowTemplate.content()` devolve um fluxo novo a cada chamada), na ordem e com os textos da tela 4.** Motivo: o site, a API e, depois, a IA e o MCP criam projetos do mesmo modelo, e o core já valida tudo.
- 2026-11-27 · **Todo modelo cria um projeto do tipo `flow`; o "Roteiro de vídeo" é a versão em quadro (cenas como cartões em sequência, com notas de fala e B-roll).** Motivo: a API só cria fluxos até a V1, e os roteiros em texto (tipo `script`) são da V1.
- 2026-11-27 · **"Falar e organizar" abre um quadro com uma nota azul que diz que a voz chega numa próxima etapa e uma moldura vazia, "Seu fluxo".** Motivo: a gravação, a transcrição e a IA são da fase seguinte (tela 5); o cartão já fica no lugar da tela 4 sem prometer o que ainda não existe. A moldura vazia evita que o quadro, ao ajustar a câmera a uma nota só, abra com 400% de zoom.
- 2026-11-27 · **Os modelos não trazem imagem, vídeo nem áudio de exemplo, só cartões com a instrução do que pôr ali.** Motivo: um bloco de imagem aponta para um arquivo de verdade; o do exemplo da tela 1 ficaria quebrado no projeto da pessoa.
- 2026-11-27 · **`PATCH /projects/:id` (`updateProjectRequestSchema`: `title` e/ou `status`, ao menos um) renomeia e muda o status sem mexer no conteúdo.** Motivo: a lista do Início não tem o conteúdo em mãos, e regravar o fluxo inteiro só para trocar o nome criaria versões à toa.
- 2026-11-27 · **`PATCH /projects/:id` muda `updated_at` mas não a `revision`, e o CORS da API passou a liberar o método PATCH.** Motivo: renomear conta como editar (a lista do Início mostra a data), mas subir a revisão faria o salvamento do quadro aberto em outra aba virar conflito; sem PATCH no CORS o navegador barrava o pedido.
- 2026-11-27 · **A tela Início reproduz a tela 4: saudação em Inter negrito (como na imagem, e não em Lora), barra lateral com Início ativo e Buscar, Templates e Configurações desligados ("em breve"), modelos em grade de 3 colunas e "Recentes" numa tabela.** Motivo: a tela de referência manda; os itens das próximas etapas ficam no lugar certo sem prometer uma tela que não existe.
- 2026-11-27 · **Cada linha dos recentes renomeia (Enter ou sair do campo confirmam, Esc cancela), muda o status por um menu e apaga depois de uma confirmação na própria linha ("não dá para desfazer").** Motivo: igual à edição de texto do quadro; a confirmação na linha dispensa janela e funciona com teclado e leitor de tela.
- 2026-11-27 · **A faixa do Google Drive é o componente `DriveStatus`, hoje com "Google Drive · conectar em breve".** Motivo: a etapa do Drive troca só esse componente (conectado, pasta "Trama", "Abrir pasta no Drive") sem mexer no Início.

## Etapa 1.6 — Google Drive

- 2026-11-27 · **O arquivo da cópia é `projeto.trama`, um JSON com `format: "trama"`, `version: 1`, `savedAt`, os dados do projeto (id, título, status, datas) e o `content` validado por `flowContentSchema`. Só fluxos por enquanto.** Motivo: a pessoa pode baixar, mover e abrir de novo no app; o contrato fica em `packages/core/src/drive.ts`, e roteiros e cadernos entram com a V1.

## Etapa 1.9 — Testes de ponta a ponta e 500 blocos

- 2026-11-27 · **Os testes de ponta a ponta usam Playwright (`@playwright/test` 1.63.0, a mesma versão do Chromium da máquina) em `apps/web/e2e`, contra o site construído (`vite build` + `vite preview`), em arquivos `*.e2e.ts`.** Motivo: testar o que vai para o ar, não o servidor de desenvolvimento; o sufixo `.e2e.ts` mantém o Vitest longe deles.
- 2026-11-27 · **Nenhum teste toca o Supabase nem a API de verdade: o Supabase é bloqueado (`route.abort`), o login e o cadastro são simulados em `/auth/v1/token`, `/auth/v1/signup` e `/auth/v1/logout`, e a API de projetos é uma `FakeApi` em memória (criar, listar, abrir, PUT com revisão, PATCH, DELETE) que valida os corpos com os esquemas do `@trama/core`.** Motivo: testes rápidos e repetíveis, sem conta nem dado no banco de produção; a `FakeApi` segue as mesmas regras de revisão da API (PATCH não sobe a revisão).
- 2026-11-27 · **O teste de 500 blocos abre um projeto de 500 blocos (6 tipos, 25 molduras, 250 setas) pela própria rota `/p/<id>` com a API falsa; não existe rota só de teste no site.** Motivo: mede o caminho real (carregar, validar, desenhar, salvar) e não deixa nada de teste na produção.
- 2026-11-27 · **Limites do teste de desempenho no CI: abrir em menos de 4 s, média de pelo menos 24 quadros por segundo no pan e no zoom e de 20 no arraste de um bloco; a meta do plano continua sendo 60.** Motivo: o runner não tem GPU nem sobra de CPU. Medido aqui (Chromium sem GPU, CPU livre): abre em cerca de 0,4 s, 56 a 60 quadros por segundo no pan e no zoom e 55 a 57 no arraste. Com o processador 2x mais lento (`E2E_PERF_CPU_THROTTLE=2`): 48 e 34; com 4x: 26 e 12. Os limites ficam abaixo do que uma máquina 2x mais lenta faz, para não falhar à toa, e ainda acusam um erro grande (por exemplo, algo quadrático no número de blocos). Cada rodada registra os números no relatório e no resumo do GitHub Actions; `E2E_PERF_OPEN_MS`, `E2E_PERF_CAMERA_FPS` e `E2E_PERF_DRAG_FPS` mudam os limites.
- 2026-11-27 · **O CI ganhou o job `e2e` (instala o Chromium com `--with-deps`, constrói, roda os fluxos e depois o teste de 500 blocos, sozinho, e guarda `playwright-report/` e `test-results/` como artefato quando falha).** Motivo: o teste de desempenho roda depois dos fluxos e sem concorrência, senão eles disputariam a CPU e os quadros por segundo oscilariam.

## Etapa 2.5 — Configurações

- 2026-11-27 · **O perfil (`profileSchema`: nome, fuso, preferências de e-mail) e o pedido `PATCH /account/profile` (`updateProfileRequestSchema`) moram em `packages/core/src/profile.ts`. O e-mail e a senha ficam só no Supabase Auth.** Motivo: o perfil espelha a tabela `profiles`; e-mail e senha têm outro dono (o Auth), e duplicar o e-mail no perfil criaria dois lugares para ficar desatualizados.
- 2026-11-27 · **O fuso é um nome IANA conhecido pelo `Intl` (deslocamentos como "+03:00" são recusados), e o nome conta de 1 a 80 letras como o `char_length` do Postgres (um emoji vale 1).** Motivo: "+03:00" não segue o horário de verão, e contar diferente do banco deixaria passar um nome que o banco recusa.
- 2026-11-27 · **No `PATCH`, `emailPreferences` pode trazer só a chave que mudou (`applyProfileUpdate` junta com o que já existe); ao ler, chave que falta no banco vira o padrão (resumo ligado, lembrete desligado).** Motivo: ligar ou desligar uma preferência não pode apagar a outra, e o padrão do `profiles` já é esse.
