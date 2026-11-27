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
