# Trama — Plano do produto e da construção

> Transcrito do documento "Trama — Plano do produto e da construção" de 26 nov 2026. Mudanças no
> plano entram por PR, com a decisão registrada em `docs/DECISIONS.md`.
>
> **Mudanças de 27 nov 2026:** o Claude Code faz todas as etapas e o Codex revisa no GitHub
> (veja "Divisão do trabalho"); o login é por e-mail e senha, com recuperação de senha, sem
> login com Google por enquanto; os e-mails levam o logo do Trama.

## Visão geral

O Trama é um app web de quadro visual, no estilo do Miro, com a cara e a simplicidade do Notion no
modo escuro. Serve para montar fluxos de vídeo, aulas, planos e roteiros, salvar tudo no Google
Drive e transformar ideias faladas em fluxos organizados com IA.

**Para quem:** criadores de conteúdo, professores de cursos e qualquer pessoa que planeja um
projeto e pensa melhor vendo as partes ligadas.

**Princípios de experiência**

1. **O quadro vem primeiro.** Abrir o app e começar a arrastar blocos tem que levar segundos.
2. **Simples como o Notion.** Criar um fluxo em até 3 cliques. O que é avançado fica escondido até
   a pessoa precisar.
3. **Preto e branco, sem cara de IA.** Nada de degradês, emojis ou brilho. Cor só para dar
   significado: seleção, concluído, notas.
4. **Os dados são da pessoa.** Os projetos ficam no Google Drive dela, e não só no nosso servidor.
5. **IA barata por padrão.** A voz é transcrita no próprio computador. A API paga entra só para
   organizar, e a pessoa escolhe o modelo.

**Nome do repositório:** `trama` no GitHub, privado. Se o nome já estiver em uso na sua conta, use
`trama-app`. O mesmo repositório é conectado ao Claude Code e ao Codex. O domínio do site ainda
precisa ser escolhido e ter a disponibilidade checada.

## Referências visuais

As oito telas da [prévia no canvas](https://claude.ai/artifact/B23sXveBxHGxGQ36cYTUQs) são a
referência oficial de visual para os dois agentes. Cada tarefa de interface deve apontar a tela que
está reproduzindo. As imagens estão em [`docs/telas/`](telas/).

| Tela                  | O que ela define                                                                                                                          | Imagem                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1 · Editor de fluxo   | Quadro em tela cheia, ferramentas flutuantes, molduras, setas curvas, blocos de imagem, vídeo, texto e notas, seleção com alças, minimapa | [1-editor.png](telas/1-editor.png)                       |
| 2 · Modo aula         | Blocos revelados em ordem, bloco atual em destaque, os próximos ocultos, controles de avançar                                             | [2-modo-aula.png](telas/2-modo-aula.png)                 |
| 3 · Roteiros          | Página estilo Notion com propriedades, cenas, falas e o menu "/", ligada aos cartões do quadro                                            | [3-roteiros.png](telas/3-roteiros.png)                   |
| 4 · Início            | Modelos para começar, projetos recentes e o status do Google Drive                                                                        | [4-inicio.png](telas/4-inicio.png)                       |
| 5 · Falar e organizar | Gravação, transcrição local, escolha do modelo e o fluxo que a IA montou                                                                  | [5-falar-e-organizar.png](telas/5-falar-e-organizar.png) |
| 6 · Estudos           | Cadernos, tabela de aulas com datas de estudo e revisão, resumo por e-mail                                                                | [6-estudos.png](telas/6-estudos.png)                     |
| 7 · Agenda            | Ano em quadradinhos, mês com o que foi feito e o detalhe do dia com horário                                                               | [7-agenda.png](telas/7-agenda.png)                       |
| 8 · Marca             | Logo "T" com serifa e ponto de conexão, versões clara e escura, ícones                                                                    | [8-marca.png](telas/8-marca.png)                         |

As telas 2 e 3 ainda estão no visual da primeira rodada. Na construção, elas seguem o padrão da
tela 1.

**Tokens de design** (vão para `packages/ui/tokens.ts` antes de qualquer tela)

| Token           | Valor                                                                                                              | Uso                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Fundo do quadro | `#161616` com pontos `#2A2A2A` a cada 24 px                                                                        | Canvas                             |
| Fundo de página | `#191919`; barra lateral `#202020`                                                                                 | Páginas estilo Notion              |
| Superfície      | `#222222`, borda `#333333`, raio 12 px                                                                             | Blocos e painéis                   |
| Texto           | `#F0F0F0` forte, `#D4D4D4` normal, `#9B9B9B` discreto                                                              | Todo o app                         |
| Seleção         | `#2383E2`                                                                                                          | Contorno, alças, pontos de conexão |
| Concluído       | `#4DAB9A`                                                                                                          | "Vídeo pronto", etapas feitas      |
| Notas           | amarelo `#3B3110` / `#F1DE8E`, azul `#1D2B3A` / `#A9CDF0`, verde `#1F2E27` / `#93D6BA`, rosa `#3A2030` / `#EDB1CE` | Notas adesivas e etiquetas         |
| Fontes          | Inter (interface), Lora (títulos e opção serifada), uma mono, uma manuscrita                                       | Seletor de fonte do texto          |

O modo claro vem depois, com os mesmos tokens invertidos. O escuro é o padrão.

## Funcionalidades

O MVP entrega o quadro completo, o fluxo de vídeo, o modo aula e o salvamento no Drive. Roteiros,
Agenda, Estudos, IA e MCP vêm na versão 1.

| Funcionalidade          | Fase     | O que inclui                                                                                                                            |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Conta e login           | MVP      | Criar conta com nome, e-mail e senha, entrar e recuperar a senha por e-mail. A mesma conta vale no site e, depois, no app de computador |
| Quadro infinito         | MVP      | Arrastar, dar zoom, minimapa, molduras, setas, desfazer e refazer, guias de alinhamento                                                 |
| Blocos                  | MVP      | Texto (fonte, tamanho, cor), cartão, nota adesiva, forma, imagem, vídeo ou link, checklist, status                                      |
| Fluxo de vídeo          | MVP      | Modelo com tema, thumbnail, vídeo, texto, etapas e o selo "Vídeo pronto"                                                                |
| Modo aula               | MVP      | Ordem de revelação por bloco, apresentar em tela cheia, destacar e caneta                                                               |
| Google Drive            | MVP      | Cada projeto salvo na pasta "Trama" do Drive da pessoa, com imagens junto                                                               |
| Modelos de início       | MVP      | Em branco, fluxo de vídeo, aula por etapas, plano de projeto, roteiro, falar e organizar                                                |
| Agenda                  | V1       | Data e hora registradas sozinhas ao criar, editar, concluir ou estudar. Visões de ano, mês e dia                                        |
| Roteiros                | V1       | Editor de páginas com cenas, falas e B-roll. Cada cena vira cartão no quadro, e o contrário                                             |
| Estudos                 | V1       | Cadernos, aulas, status, data estudada e data de revisão                                                                                |
| Falar e organizar       | V1       | Transcrição local grátis e organização por API em fluxo, roteiro, plano ou prompt                                                       |
| Escolha de IA           | V1       | Provedor (Claude, Gemini, ChatGPT), modelo e esforço, com a chave da própria pessoa                                                     |
| E-mails                 | MVP e V1 | Login e avisos no MVP. Resumo semanal de estudos e lembrete de revisão na V1                                                            |
| Conector MCP            | V1       | Outras IAs leem e criam fluxos, roteiros e estudos no Trama                                                                             |
| Exportar e compartilhar | V1       | PNG, PDF e link só para leitura                                                                                                         |
| App de computador       | Depois   | Mesmo app empacotado, mesma conta, voz local mais rápida                                                                                |
| Edição em tempo real    | Depois   | Duas pessoas no mesmo quadro, com cursores                                                                                              |
| Modo claro e celular    | Depois   | Tema claro e versão instalável no celular                                                                                               |
| Login com Google        | Depois   | Talvez no futuro; por enquanto o login é só por e-mail e senha                                                                          |

## O quadro (editor de fluxo)

O quadro é a parte principal do app e segue a tela 1: tela cheia, ferramentas flutuando e cada
bloco arrastável, conectável e agrupável. A meta é a sensação do Miro com a calma do Notion.

**Blocos**

| Bloco         | Como entra                              | O que dá para fazer                                                              |
| ------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| Texto         | Tecla T ou clique duplo no quadro       | Fonte (Padrão, Serifa, Mono, Manuscrita), tamanho, cor, negrito, itálico, listas |
| Cartão        | Tecla C                                 | Título, descrição, etiqueta e status                                             |
| Nota adesiva  | Tecla N                                 | Quatro cores do Notion escuro                                                    |
| Forma         | Tecla R                                 | Retângulo, círculo e losango, com texto dentro                                   |
| Imagem        | Arrastar o arquivo, colar ou pelo botão | Legenda, recorte, tamanho original. É aqui que entra a thumbnail pronta          |
| Vídeo ou link | Colar o link                            | YouTube e Vimeo tocam dentro do bloco. Outros links viram cartão com prévia      |
| Etapas        | Pelo menu de blocos                     | Lista com marcar e contador (5/5)                                                |
| Status        | Dentro do cartão de projeto             | Selo "Vídeo pronto". Ao marcar, registra data e hora na Agenda                   |
| Áudio         | Gravando pela ferramenta de voz         | Toca o áudio e mostra a transcrição                                              |
| Moldura       | Tecla F                                 | Agrupa blocos, dá nome à seção e pode virar um passo do modo aula                |

**Interações**

- Arrastar para mover. Shift ou o laço de seleção para pegar vários.
- Puxar o ponto azul da borda para criar uma seta. A seta segue o bloco quando ele se move, pode
  ser curva ou reta e aceita texto.
- Guias de alinhamento aparecem ao arrastar, e tudo encaixa numa grade de 8 px.
- Atalhos: Ctrl+D duplica, Delete apaga, Ctrl+Z desfaz, Ctrl+Shift+Z refaz, Ctrl+G agrupa.
- Barra de contexto em cima do bloco selecionado, como na tela 1: fonte, tamanho, cor, passo da
  aula e apagar.
- Colar imagem ou link direto no quadro cria o bloco certo.
- Zoom com a roda do mouse ou com pinça, minimapa e botão "Ajustar".
- Clique direito: duplicar, trazer para frente, travar e definir o passo da aula.

**Modo aula**

Cada bloco ou moldura pode ganhar um número de passo no painel "Ordem da apresentação". Ao
apresentar, a câmera anda suavemente até cada passo, os blocos dos próximos passos ficam ocultos e
o atual ganha destaque. Setas do teclado avançam e voltam, e Esc sai. A caneta e o destaque servem
só durante a aula e não alteram o fluxo.

**O que deixa o quadro premium**

- Espaçamento sempre em múltiplos de 8 px, com blocos do mesmo tipo do mesmo tamanho.
- Setas curvas suaves que saem do meio da borda, nunca cruzando por cima de um bloco.
- Animações curtas, em torno de 150 ms, ao criar, mover e conectar.
- Sombra discreta só nos blocos e nos menus flutuantes.
- Meta de desempenho: 60 quadros por segundo com 500 blocos no quadro.

## IA: voz local e organização por API

A voz é transcrita de graça no navegador da pessoa. Só o texto vai para a API que ela escolheu, com
a chave dela, para virar fluxo, roteiro, plano ou prompt.

**Como funciona, passo a passo**

1. A pessoa aperta o microfone e fala do jeito que vier.
2. O Whisper roda no próprio navegador pelo Transformers.js, usando a placa de vídeo (WebGPU) e
   caindo para WASM quando ela não existe
   ([fonte](https://remotion.dev/docs/whisper-webgpu)). O modelo baixa uma vez e fica guardado no
   navegador ([fonte](https://blog.logrocket.com/?p=214704)). O áudio não sai do computador.
3. O texto bruto aparece na tela e pode ser corrigido à mão.
4. A pessoa escolhe o formato: Fluxo, Roteiro, Plano com tarefas ou Prompt organizado.
5. O app envia o texto com um prompt do Trama para o provedor e o modelo escolhidos.
6. A IA devolve um JSON validado com blocos, setas, molduras e as correções que percebeu ("trocou
   raposa por gato").
7. O layout automático posiciona os blocos na grade de 8 px, e a pessoa clica em "Inserir no
   quadro".

**Transcrição**

- Padrão: Whisper multilíngue (base ou small) no navegador. Os modelos ".en" são só de inglês e
  não servem para português.
- App de computador, depois: whisper.cpp nativo, mais rápido.
- Reserva: um Whisper na nuvem barato, para máquinas fracas. Desligado por padrão.

**Escolha de provedor, modelo e esforço** (tela Configurações → IA)

| Provedor           | Como a lista de modelos aparece                                                                                           | Controle de esforço                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Claude (Anthropic) | Lida da API da conta da pessoa. Sugestões: Haiku 5.5 para o dia a dia, Sonnet 5.5 para equilíbrio, Opus 5.5 para o máximo | Parâmetro `effort`: low, medium, high, xhigh, max ([docs](https://platform.claude.com/docs/en/build-with-claude/effort)) |
| Gemini (Google)    | Lida da API da conta da pessoa                                                                                            | Nível de raciocínio do próprio Gemini                                                                                    |
| ChatGPT (OpenAI)   | Lida da API da conta da pessoa                                                                                            | Esforço de raciocínio da OpenAI                                                                                          |

- A lista vem da API de cada provedor, então modelos novos aparecem sem mudar o código.
- Na tela, o esforço aparece como Rápido, Equilibrado e Caprichado. O pacote `packages/ai` traduz
  isso para o parâmetro de cada provedor.
- No Claude, Opus 5.5 e Haiku 5.5 usam medium por padrão, e os outros modelos usam high
  ([docs](https://platform.claude.com/docs/en/build-with-claude/effort.md)). O Trama sempre envia o
  esforço de forma explícita.
- A chave fica criptografada no servidor e nunca volta para o navegador. Antes de cada envio, o app
  mostra uma estimativa de custo.

**O que a IA faz no Trama**

- Organizar fala em fluxo, roteiro, plano com tarefas ou prompt.
- "Prompt organizado": reescreve o que a pessoa falou num prompt estruturado, seguindo o
  [guia de prompts da Anthropic](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview):
  objetivo claro, contexto, exemplos e seções marcadas.
- Arrumar um fluxo existente: alinhar, agrupar em molduras e sugerir o próximo passo.
- Resumir os estudos da semana para o e-mail.

Todos os prompts ficam versionados em `packages/ai/prompts/`, com testes de exemplo, para os dois
agentes poderem melhorar sem quebrar.

## Conector MCP do Trama

O Trama terá um servidor MCP remoto próprio. Com ele, outras IAs que aceitam MCP leem e criam
fluxos, roteiros, estudos e registros na agenda da pessoa, sempre com login e permissão dela.

**Onde roda:** um Worker separado (`apps/mcp`) na Cloudflare. A autorização usa a biblioteca
`@cloudflare/workers-oauth-provider`, que chegou à v1 com suporte completo à especificação MCP
2026-07-28
([fonte](https://developers.cloudflare.com/changelog/post/2026-10-01-workers-oauth-provider-1x/)).
O login é a mesma conta do Trama.

| Ferramenta         | O que faz                                                               | Permissão |
| ------------------ | ----------------------------------------------------------------------- | --------- |
| `listar_projetos`  | Lista fluxos, roteiros e cadernos, com filtro por tipo e data           | Leitura   |
| `ler_fluxo`        | Devolve um fluxo com blocos, setas e molduras em JSON                   | Leitura   |
| `criar_fluxo`      | Cria um fluxo a partir de um título e de uma lista de blocos e ligações | Escrita   |
| `adicionar_blocos` | Adiciona blocos e setas a um fluxo existente                            | Escrita   |
| `marcar_concluido` | Marca etapa ou "Vídeo pronto" e registra na Agenda                      | Escrita   |
| `organizar_texto`  | Usa a mesma lógica do "Falar e organizar" sobre um texto enviado        | Escrita   |
| `criar_roteiro`    | Cria um roteiro com cenas e falas, já ligado a um fluxo                 | Escrita   |
| `registrar_estudo` | Cria uma aula num caderno, com data de estudo e de revisão              | Escrita   |
| `buscar_agenda`    | Diz o que foi feito num dia, semana ou mês                              | Leitura   |

- Apagar não vira ferramenta no MVP do MCP. Quando entrar, pede uma permissão extra na hora, o que
  a biblioteca já oferece com `insufficientScope()`
  ([fonte](https://developers.cloudflare.com/changelog/post/2026-10-01-workers-oauth-provider-1x/)).
- Cada chamada fica registrada no histórico do projeto, com o nome do cliente que fez.
- A lógica fica em `packages/core`. O site, a API e o MCP usam o mesmo código, então o MCP nunca
  cria um fluxo que o quadro não sabe abrir.
- Teste com o MCP Inspector e com o Claude Code. Depois, validar a conexão no ChatGPT e no Codex.

## Stack técnica e arquitetura

Tudo é TypeScript num único repositório. O site roda na Cloudflare, os dados ficam no Supabase, os
e-mails saem pelo Resend e uma cópia de cada projeto vai para o Drive da pessoa.

**O navegador faz o trabalho pesado; a nuvem guarda, envia e conecta.**

```
Navegador da pessoa                     Cloudflare
┌──────────────────────────┐   HTTPS   ┌──────────────────────────┐ ──▶ APIs de IA (Claude, Gemini, OpenAI)
│ Site Trama               │ ────────▶ │ Worker da API            │ ──▶ Supabase (banco, login e arquivos)
│ React + Vite             │           │ Hono                     │ ──▶ Google Drive (cópia .trama da pessoa)
│ Quadro com React Flow    │           │ Projetos e Drive         │ ──▶ Resend (login e resumo semanal)
│ Roteiros, Agenda, Estudos│           │ IA com a chave da pessoa │
└──────────────────────────┘           │ E-mails e resumo (cron)  │
            ▲ texto                    └──────────────────────────┘
┌──────────────────────────┐                     ▲ mesmo núcleo
│ Whisper local            │           ┌──────────────────────────┐
│ WebGPU ou WASM           │           │ Worker MCP               │ ◀── Outras IAs (clientes MCP: Claude, Codex)
│ O áudio não sai do PC    │           │ OAuth + ferramentas      │
└──────────────────────────┘           └──────────────────────────┘
```

O áudio e o quadro ficam no navegador. O Worker da API é a única porta para o banco, o Drive, os
e-mails e as IAs, e o MCP usa o mesmo núcleo.

| Camada                       | Escolha                                                                | Por quê                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo                     | pnpm + Turborepo                                                       | Site, API, MCP e pacotes compartilhados no mesmo lugar, com builds rápidos                                                                                                                          |
| Site                         | React + Vite, TanStack Router, Zustand                                 | O quadro roda quase todo no navegador, então um app de página única é mais simples e mais barato                                                                                                    |
| Quadro                       | React Flow (`@xyflow/react`)                                           | Licença MIT e feito para nós e ligações ([fonte](https://hnews-reader.vercel.app/ask/45293839)). O tldraw exige chave de licença em produção ([fonte](https://tldraw.dev/sdk-features/license-key)) |
| Páginas (Roteiros e Estudos) | Tiptap                                                                 | Editor em blocos com menu "/", como o Notion                                                                                                                                                        |
| Layout automático            | dagre                                                                  | Organiza os blocos que a IA cria                                                                                                                                                                    |
| Estilo                       | Tailwind CSS com os tokens do Trama                                    | Os dois agentes usam os mesmos nomes de cor e espaço                                                                                                                                                |
| API                          | Hono em Cloudflare Workers                                             | Arquivos estáticos são grátis e ilimitados, e o plano grátis dá 100 mil requisições por dia ([fonte](https://developers.cloudflare.com/workers/platform/pricing/index.md))                          |
| Banco, login e arquivos      | Supabase (Postgres, Auth, Storage, RLS)                                | Login por e-mail e senha com recuperação, regras de acesso por linha                                                                                                                                |
| E-mail                       | Resend + React Email                                                   | Modelos de e-mail escritos em React, no mesmo repositório                                                                                                                                           |
| IA                           | `packages/ai` com os SDKs oficiais da Anthropic, do Google e da OpenAI | Uma interface só para os três provedores                                                                                                                                                            |
| Voz                          | `@huggingface/transformers` (Whisper)                                  | Transcrição grátis no navegador                                                                                                                                                                     |
| MCP                          | Worker `apps/mcp` + `workers-oauth-provider`                           | MCP remoto com OAuth pronto                                                                                                                                                                         |
| App de computador            | Tauri 2 (fase 4)                                                       | Reaproveita o site e deixa a voz local mais rápida                                                                                                                                                  |
| Testes e CI                  | Vitest, Playwright, GitHub Actions                                     | Cada PR roda checagem de tipos, testes e um preview                                                                                                                                                 |

**Estrutura do repositório**

```
trama/
├─ apps/
│  ├─ web/        site (React + Vite)
│  ├─ api/        Worker Hono: projetos, Drive, IA, e-mails, tarefas agendadas
│  ├─ mcp/        Worker do conector MCP
│  └─ desktop/    Tauri (fase 4)
├─ packages/
│  ├─ core/       tipos do fluxo, esquemas zod, regras de negócio
│  ├─ canvas/     blocos, setas e interações do quadro
│  ├─ ui/         tokens e componentes
│  ├─ ai/         provedores, prompts e testes de prompt
│  └─ emails/     modelos React Email
├─ supabase/      migrations e políticas RLS
├─ docs/          PLAN.md, DESIGN.md, DECISIONS.md, imagens das telas
├─ AGENTS.md      regras comuns (o Codex lê este arquivo)
└─ CLAUDE.md      regras do Claude Code (importa o AGENTS.md)
```

## Dados, contas e Google Drive

O Supabase guarda a versão de trabalho de cada projeto. O Drive da pessoa recebe uma cópia completa,
num arquivo `.trama` que ela pode baixar, mover ou abrir de novo no app.

**Google Drive**

- Escopo `drive.file`: o app só vê os arquivos que ele criou ou que a pessoa abriu com ele. O Google
  classifica esse escopo como não sensível e recomendado, e ele exige só a verificação básica do app
  ([fonte](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)).
- Pasta "Trama" no Drive, com uma subpasta por projeto: `projeto.trama` (JSON) e as imagens.
- O salvamento no Supabase acontece 2 s depois da última mudança. A cópia no Drive sai a cada 30 s
  com mudanças e ao fechar a aba.
- Se o mesmo projeto mudar em dois lugares, vale a versão mais nova, e a anterior fica no histórico
  de versões.
- "Abrir do Drive" usa o seletor de arquivos do Google, o que funciona com o mesmo escopo.

**Tabelas principais**

| Tabela             | Guarda                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `profiles`         | Nome, fuso horário (padrão America/Sao_Paulo), preferências de e-mail                    |
| `projects`         | Tipo (fluxo, roteiro, caderno), título, status, conteúdo em JSON, id do arquivo no Drive |
| `project_versions` | Versões anteriores para desfazer em caso de conflito                                     |
| `events`           | O que aconteceu e quando: criado, editado, concluído, estudado. Alimenta a Agenda        |
| `lessons`          | Aulas dos cadernos de Estudos: status, data estudada, data de revisão                    |
| `ai_keys`          | Chaves de API criptografadas, por provedor                                               |
| `ai_settings`      | Provedor, modelo e esforço preferidos                                                    |
| `mcp_clients`      | Clientes MCP autorizados e o que podem fazer                                             |

**Agenda:** cada ação importante grava uma linha em `events` com data e hora automáticas. A pessoa
só escolhe a data na mão quando quer registrar algo do passado.

**Segurança:** toda tabela tem RLS, e cada pessoa só lê e escreve as próprias linhas. As chaves de
API são lidas apenas pelo Worker da API.

## E-mails

O Resend envia todos os e-mails do Trama, inclusive os do login do Supabase (recuperação de
senha), que é configurado para usar o Resend como servidor de envio. Os modelos são escritos com
React Email em `packages/emails`, no mesmo visual preto e branco do app, e todos levam o logo do
Trama no topo.

| E-mail                    | Quando sai                                                                                      | Fase |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ---- |
| Recuperação de senha      | Quando a pessoa pede uma senha nova; o link abre a tela de criar a senha nova                   | MVP  |
| Boas-vindas               | Logo depois do cadastro, com o link para o primeiro fluxo                                       | MVP  |
| Aviso do Drive            | Quando a cópia para o Drive falha 3 vezes seguidas                                              | MVP  |
| Resumo semanal de estudos | Segunda às 8h no fuso da pessoa: o que estudou, o que revisar e os vídeos marcados como prontos | V1   |
| Lembrete de revisão       | No dia da revisão de uma aula, se a pessoa ligou essa opção                                     | V1   |

- O resumo semanal é disparado por uma tarefa agendada (Cron Trigger) no Worker da API. O texto é
  montado com o modelo de IA que a pessoa escolheu ou, sem chave, só com os dados da Agenda.
- Cada e-mail tem link de descadastro, e as preferências ficam em Configurações. Os e-mails da
  conta (recuperação de senha) não têm descadastro, porque a pessoa pediu por eles.
- O domínio de envio precisa dos registros SPF e DKIM configurados antes do lançamento.
- O plano grátis do Resend cobre 3.000 e-mails por mês, com no máximo 100 por dia
  ([fonte](https://resend.com/blog/new-free-tier)). Passando disso, o plano Pro custa US$ 20 por mês
  para 50.000 e-mails ([fonte](https://www.usecarly.com/blog/resend-pricing/)).

## Divisão do trabalho

Mudou em 27 nov 2026. Antes, o Claude Code fazia a arquitetura e o Codex fazia as telas; agora:

- **Claude Code faz todas as etapas**: código, telas, componentes, e-mails, testes, banco e
  deploy. Decide o que é técnico e faz o merge com o CI verde.
- **Codex revisa no fim.** Quando o Claude Code termina, ele sobe o projeto no ambiente na nuvem,
  testa e escreve o relatório no GitHub. O Claude Code recebe o aviso, corrige e responde lá
  mesmo.
- **O que só você pode fazer** (contas, chaves, painéis) e **imagens geradas**: o Claude Code
  escreve um pedido pronto, você manda ao Codex, que controla o seu computador e faz.
- **Só planos grátis.** Os planos pagos de "Custos estimados" só entram se o projeto crescer.
- **Você** acompanha pela página de andamento e confirma os portões.

**Regra de ouro:** quem escreve não aprova. O trabalho todo passa pela revisão do Codex.

## Como o trabalho anda no repositório

**Arquivos de instrução**

- `AGENTS.md`: a fonte única de regras. Traz a stack, os comandos (`pnpm dev`, `pnpm test`,
  `pnpm lint`), quem faz o quê, os tokens obrigatórios e o que nunca fazer (cores fora dos
  tokens, emoji na interface, segredos no código).
- `CLAUDE.md`: começa importando o `AGENTS.md` (`@AGENTS.md`) e acrescenta só o que é do Claude
  Code.
- `docs/DESIGN.md`: tokens e regras visuais, com as imagens das 8 telas em `docs/telas/`.
- `docs/DECISIONS.md`: cada decisão importante numa linha, com data e motivo.
- `docs/PLAN.md`: este plano.

**Ciclo de cada etapa**

1. O Claude Code pega a próxima etapa do roadmap (abaixo).
2. Cria a branch `claude/<número>-<nome>` e abre um PR pequeno, com o que mudou, como testar e
   uma imagem quando mexer em tela.
3. O CI roda tipos, lint, testes e publica um preview na Cloudflare.
4. Com o CI verde, o Claude Code faz o merge e segue para a próxima etapa.
5. No fim, o Codex revisa no GitHub. Os dois usam a mesma conta, então a revisão é um comentário
   que termina com **Aprovar** ou **Pedir mudanças**, com cada ponto marcado como `[bloqueia]`,
   `[sugestão]` ou `[nit]`. O Claude Code corrige e responde em cada conversa.

**Regras**

- Mudança em `packages/core` (o contrato entre as partes) entra antes, num PR próprio, e só depois
  as telas que usam a mudança.
- Mensagens de commit no padrão Conventional Commits (`feat:`, `fix:`, `docs:`).
- Segredos só nos painéis da Cloudflare, do Supabase e do GitHub. O repositório tem apenas um
  `.env.example`.

## Roadmap por fases

Cinco fases; cada uma só começa quando o portão da anterior passa. O Claude Code faz todas as
etapas, faz o merge com o CI verde, e o Codex revisa tudo no fim.

**Fase 0 · Fundação.** Portão: criar conta, entrar e recuperar a senha funcionam no preview.

| Etapa | O que entra                                                                                          | Referência     |
| ----- | ---------------------------------------------------------------------------------------------------- | -------------- |
| 0.1   | Repositório, monorepo, `AGENTS.md`, `CLAUDE.md`, contrato do fluxo em `packages/core`, CI            | —              |
| 0.2   | Tokens em `packages/ui/tokens.ts`, Tailwind, componentes base, logo em SVG e `docs/DESIGN.md`        | telas 1, 4 e 8 |
| 0.3   | Supabase: tabela `profiles` com RLS, cadastro com nome, e-mail e senha, login e recuperação de senha | —              |
| 0.4   | E-mails de recuperação de senha e de boas-vindas, com o logo, saindo pelo Resend                     | tela 8         |
| 0.5   | Casca do app e as telas de entrar, criar conta, esqueci a senha e nova senha                         | telas 4 e 8    |
| 0.6   | Deploy na Cloudflare (site e API) e preview em todo PR                                               | —              |

**Fase 1 · Quadro (MVP).** Portão: criar, salvar e apresentar um fluxo de vídeo completo.

| Etapa | O que entra                                                                                                  | Referência |
| ----- | ------------------------------------------------------------------------------------------------------------ | ---------- |
| 1.1   | Quadro base: grade de 8 px, zoom, minimapa, "Ajustar", ferramentas flutuantes                                | tela 1     |
| 1.2   | Blocos de texto, cartão com selo de status, nota adesiva, forma e moldura                                    | tela 1     |
| 1.3   | Blocos de imagem (com upload), vídeo ou link, e etapas                                                       | tela 1     |
| 1.4   | Setas, seleção, barra de contexto, guias de alinhamento, atalhos, desfazer e refazer, clique direito         | tela 1     |
| 1.5   | Salvamento: API de projetos, salvar sozinho em 2 s, histórico de versões                                     | —          |
| 1.6   | Google Drive: conectar, pasta "Trama", `projeto.trama`, cópia a cada 30 s, "Abrir do Drive", e-mail de aviso | tela 4     |
| 1.7   | Modo aula: ordem da apresentação, tela cheia, câmera, destaque e caneta                                      | tela 2     |
| 1.8   | Modelos de início e a tela Início                                                                            | tela 4     |
| 1.9   | Testes Playwright dos fluxos do MVP e o teste de 500 blocos no CI                                            | —          |

**Fase 2 · Organização.** Portão: uma semana de uso real sem perder dados.

| Etapa | O que entra                                                                  | Referência |
| ----- | ---------------------------------------------------------------------------- | ---------- |
| 2.1   | Formatos de roteiro, caderno e eventos no core; tabelas `events` e `lessons` | —          |
| 2.2   | Agenda com data e hora registradas sozinhas                                  | tela 7     |
| 2.3   | Roteiros (Tiptap), com cada cena ligada a um cartão do quadro                | tela 3     |
| 2.4   | Estudos: cadernos, aulas, datas de estudo e de revisão                       | tela 6     |
| 2.5   | Configurações: conta, troca de e-mail e de senha, preferências de e-mail     | —          |
| 2.6   | Resumo semanal e lembrete de revisão por e-mail                              | tela 6     |

**Fase 3 · IA e MCP.** Portão: uma fala de 2 minutos vira um fluxo correto.

| Etapa | O que entra                                                                                                      | Referência |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| 3.1   | `packages/ai`: Claude, Gemini e ChatGPT, esforço, prompts versionados, chaves criptografadas, Configurações → IA | —          |
| 3.2   | Voz local com Whisper no navegador                                                                               | tela 5     |
| 3.3   | Falar e organizar, com layout automático e "Inserir no quadro"                                                   | tela 5     |
| 3.4   | Conector MCP com login e permissões                                                                              | —          |

**Fase 4 · Lançamento.**

| Etapa | O que entra                              |
| ----- | ---------------------------------------- |
| 4.1   | Exportar PNG e PDF, link só para leitura |
| 4.2   | Domínio, SPF e DKIM, Supabase Pro        |
| 4.3   | App de computador com Tauri              |

A Fase 1 é o MVP e a prioridade. As fases não têm datas: cada uma termina quando o portão é
cumprido no preview, e você é quem confirma.

## Custos estimados

Dá para construir e testar sem custo fixo. Para lançar com backup e sem pausas, a conta começa em
cerca de US$ 30 por mês (Supabase Pro + Workers pago), fora o domínio.

| Serviço                     | O que o grátis cobre                                                                                                             | Quando passar a pagar                                | Preço pago                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Supabase                    | Projetos pausam após 1 semana sem uso e há limite de 2 projetos ativos ([fonte](https://www.withorb.com/pricing-atlas/supabase)) | No lançamento, pelos backups e para não pausar       | Pro: US$ 25/mês ([fonte](https://supabase.com/docs/pricing))                 |
| Cloudflare Workers          | 100 mil requisições por dia, arquivos estáticos ilimitados ([fonte](https://developers.cloudflare.com/workers/about/pricing))    | Quando o tráfego passar do limite diário             | US$ 5/mês ([fonte](https://developers.cloudflare.com/workers/about/pricing)) |
| Resend                      | 3.000 e-mails por mês, 100 por dia                                                                                               | Quando o resumo semanal passar de 100 envios num dia | Pro: US$ 20/mês para 50.000 e-mails                                          |
| Google Drive API            | Uso dentro das cotas do Google                                                                                                   | Não previsto                                         | —                                                                            |
| Transcrição de voz          | Roda no computador da pessoa                                                                                                     | Nunca, no modo local                                 | —                                                                            |
| APIs de IA                  | Cada pessoa usa a própria chave e paga o próprio uso                                                                             | —                                                    | Conforme o modelo e o esforço escolhidos                                     |
| Claude Code e ChatGPT/Codex | Seus planos atuais                                                                                                               | —                                                    | —                                                                            |
| Domínio                     | —                                                                                                                                | Antes do lançamento                                  | A pesquisar quando o nome do domínio for escolhido                           |

O limite de 100 e-mails por dia do Resend é o primeiro a apertar: com mais de 100 pessoas recebendo
o resumo de segunda, já é preciso o plano Pro.

## Riscos e decisões em aberto

**Riscos**

| Risco                                                 | O que fazer                                                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| O escopo cresce e o MVP não sai                       | Nada da V1 começa antes do portão da Fase 1 ser cumprido                                                   |
| WebGPU falha em alguns navegadores e a voz fica lenta | Detectar antes de gravar, avisar, usar WASM e oferecer a reserva na nuvem                                  |
| Os dois agentes mexem no mesmo arquivo                | Dono por pasta, `packages/core` sempre primeiro, PRs pequenos                                              |
| O quadro fica lento com muitos blocos                 | Teste de desempenho com 500 blocos no CI a partir da Fase 1                                                |
| Vazamento de chave de API                             | Chave criptografada, lida só no servidor, nunca registrada em log                                          |
| Copiar código do AppFlowy                             | Ele usa licença AGPL-3.0 ([fonte](https://github.com/appflowy-io/appflowy)). Serve só de inspiração visual |
| Sincronização com o Drive perde mudanças              | Supabase como versão principal, histórico de versões e aviso por e-mail após falhas                        |

**Decisões em aberto**

- [ ] Escolher o domínio e checar se está livre.
- [ ] Confirmar se o app será só seu no começo ou aberto para outras pessoas desde o MVP. Isso muda
      quando o Supabase Pro e a verificação do Google entram.
- [ ] Definir se o resumo semanal sem chave de IA é aceitável só com os dados da Agenda.
- [ ] Escolher o modelo de Whisper padrão (base ou small) depois de testar no seu computador.
