# Deploy

O site, a API e o conector MCP rodam no **Cloudflare Workers, plano grátis**. O workflow
`.github/workflows/deploy.yml` publica sozinho:

| Quando          | O que sai                                                | Endereço                                                                                                                              |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Merge na `main` | Site, API e conector MCP em produção                     | `https://trama.<subdomínio>.workers.dev`, `https://trama-api.<subdomínio>.workers.dev` e `https://trama-mcp.<subdomínio>.workers.dev` |
| Cada PR         | Preview do site; o endereço aparece num comentário do PR | `https://pr-<número>-trama.<subdomínio>.workers.dev`                                                                                  |

O site é só arquivos estáticos (`apps/web/wrangler.jsonc`): qualquer caminho sem arquivo abre o
`index.html`, e o roteador decide a tela. A API é o Worker de `apps/api`.

## O que precisa estar configurado (uma vez)

No GitHub (Settings → Secrets and variables → Actions):

| Nome                           | Tipo     | O que é                                                                          |
| ------------------------------ | -------- | -------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`         | Segredo  | Token da Cloudflare com o modelo "Edit Cloudflare Workers"                       |
| `CLOUDFLARE_ACCOUNT_ID`        | Segredo  | ID da conta da Cloudflare                                                        |
| `CLOUDFLARE_WORKERS_SUBDOMAIN` | Variável | O subdomínio `workers.dev` da conta (sem `.workers.dev`), para o link do preview |

Sem os dois segredos, o deploy é pulado com um aviso, e o CI continua verde.

No Supabase (projeto "trama" → Authentication → URL Configuration), o endereço do site e os de
retorno precisam incluir o site publicado e os previews:

- Site URL: `https://trama.<subdomínio>.workers.dev`
- Redirect URLs: `http://localhost:5173/**`, `https://trama.<subdomínio>.workers.dev/**`,
  `https://*-trama.<subdomínio>.workers.dev/**`

## Publicar à mão (raramente)

```bash
pnpm --filter @trama/web build
pnpm --filter @trama/web exec wrangler deploy
pnpm --filter @trama/api exec wrangler deploy
```

O `wrangler` pede login na primeira vez (`wrangler login`), ou usa `CLOUDFLARE_API_TOKEN`.

## Troca de e-mail no Supabase (etapa 2.5)

No painel do Supabase (projeto "trama" → Authentication → Emails → Templates → **Change Email
Address**), cole o conteúdo de `supabase/templates/email_change.html` e use o assunto
`Confirme o novo e-mail do Trama`. Em Authentication → Sign In / Providers → Email, deixe ligado
**Secure email change** (os links vão ao e-mail atual e ao novo). O `supabase/config.toml` já
traz os dois (`[auth.email.template.email_change]` e `double_confirm_changes = true`), para quem
usar `supabase config push`. Os endereços de retorno do passo anterior já cobrem
`/configuracoes` e `/confirmar-email`.

## API de projetos (etapa 1.5)

- A API fala com o Supabase com a chave **publicável** e o token de login da pessoa, então o
  banco aplica a RLS como se fosse ela. Os dois valores públicos ficam nas `vars` de
  `apps/api/wrangler.jsonc`; a chave secreta não é usada aqui.
- O deploy passa `WORKERS_SUBDOMAIN` para a API, que só aceita pedidos (CORS) do site
  `trama.<subdomínio>.workers.dev`, dos previews `pr-<n>-trama.<subdomínio>.workers.dev` e do
  `pnpm dev` (`localhost:5173`).
- O site é construído com `VITE_API_URL=https://trama-api.<subdomínio>.workers.dev`.

## Google Drive e e-mails (etapa 1.6)

A cópia dos projetos para o Drive, o "Abrir do Drive" e os e-mails (boas-vindas e Aviso do Drive)
saem pela API. Nada disto precisa estar pronto para o resto do app funcionar: sem as chaves, o
cartão do Drive no Início diz que a conexão "ainda não está ligada neste ambiente", e os e-mails
são pulados.

### O que a pessoa dona do projeto cria no Google Cloud

No [Google Cloud Console](https://console.cloud.google.com), num projeto novo (por exemplo "Trama"):

1. **APIs e serviços > Biblioteca**: ativar **Google Drive API** e **Google Picker API**.
2. **Tela de consentimento OAuth** (Google Auth Platform > Branding e Público): tipo **Externo**,
   nome "Trama", e-mail de suporte, logo e domínio do site. Em **Acesso a dados**, adicionar só o
   escopo `https://www.googleapis.com/auth/drive.file` (não sensível). Em **Público**, publicar o
   app ("Em produção"): em "Teste", o Google vence o refresh token em 7 dias.
3. **Credenciais > Criar credenciais > ID do cliente OAuth**, tipo **Aplicativo da Web**, nome "Trama":
   - Origens JavaScript autorizadas: `https://trama.<subdomínio>.workers.dev` e
     `http://localhost:5173`.
   - URIs de redirecionamento autorizados (os da **API**, não os do site):
     `https://trama-api.<subdomínio>.workers.dev/drive/callback` e
     `http://localhost:8787/drive/callback`.
   - Guardar o **ID do cliente** e o **Segredo do cliente**.
4. **Credenciais > Criar credenciais > Chave de API**, nome "Trama Picker":
   - Restrições de API: só **Google Picker API**.
   - Restrições de aplicativo: **Sites** (referenciadores HTTP), com
     `https://trama.<subdomínio>.workers.dev/*`, `https://*-trama.<subdomínio>.workers.dev/*` e
     `http://localhost:5173/*`.

### Onde cada valor vai

| Nome                    | Onde                                                                             | Tipo     |
| ----------------------- | -------------------------------------------------------------------------------- | -------- |
| `GOOGLE_CLIENT_ID`      | Worker da API (`wrangler secret put GOOGLE_CLIENT_ID`)                           | Segredo  |
| `GOOGLE_CLIENT_SECRET`  | Worker da API (`wrangler secret put GOOGLE_CLIENT_SECRET`)                       | Segredo  |
| `TOKEN_ENCRYPTION_KEY`  | Worker da API; gere com `openssl rand -base64 32` (Drive e chaves de IA)         | Segredo  |
| `RESEND_API_KEY`        | Worker da API (a mesma do SMTP do Supabase, ou outra)                            | Segredo  |
| `EMAIL_FROM`            | Worker da API, ex.: `Trama <ola@seu-dominio>` (domínio no Resend com SPF e DKIM) | Segredo  |
| `VITE_GOOGLE_CLIENT_ID` | GitHub (Settings > Variables > Actions): o mesmo ID do cliente                   | Variável |
| `VITE_GOOGLE_API_KEY`   | GitHub (Variables): a chave de API do Picker                                     | Variável |

O site embute as duas `VITE_` no build (o `deploy.yml` já as repassa). O número do projeto, que o
Picker pede como `appId`, vem do começo do ID do cliente (`VITE_GOOGLE_APP_ID` só se for preciso
trocar). Guarde a `TOKEN_ENCRYPTION_KEY` num cofre: sem ela, os tokens do Drive e as chaves de IA já
gravados não abrem e as pessoas precisam conectar o Drive e colar as chaves de novo.

No `pnpm dev`, os mesmos nomes vão em `apps/api/.dev.vars` (segredos) e `apps/web/.env.local`
(`VITE_`), como no `.env.example`.

### Como funciona (para quem for mexer)

- `POST /drive/connect` devolve o endereço de consentimento do Google (`access_type=offline`,
  `prompt=consent`, escopo `drive.file`) com um `state` assinado (HMAC) e preso à pessoa, que vale 10
  minutos. O site abre esse endereço.
- `GET /drive/callback` (o Google chama, sem login) confere o `state`, troca o código com o segredo
  do cliente e devolve o navegador ao site em `/drive/retorno#t=<bilhete>`. O bilhete é o refresh
  token criptografado (AES-GCM, preso ao id da pessoa, vale 10 minutos).
- `POST /drive/connection` recebe o bilhete **com o token de login da pessoa** e grava a conexão em
  `drive_connections` (com RLS). Por isso a API **não precisa da chave secreta do Supabase**.
- O refresh token fica criptografado na tabela; o token de acesso do Google (1 hora) nunca é
  guardado, só pedido de novo a cada cópia. O único lugar que recebe um token de acesso é o
  navegador, para o Picker (`POST /drive/picker-token`, `Cache-Control: no-store`).
- Migrations (já aplicadas em produção em 28 nov 2026): `20261128021617_drive.sql` (tabela
  `drive_connections`, a função `drive_record_copy` e o limite de um "Aviso do Drive" por dia) e
  `20261128021642_boas_vindas.sql` (colunas de `profiles` e as funções `claim_welcome_email` e
  `release_welcome_email`). Quem já tinha conta conta como "já recebeu" as boas-vindas.

## Conector MCP (etapa 3.4)

O Worker `trama-mcp` (`apps/mcp`) deixa o Claude, o ChatGPT e o Codex lerem e criarem fluxos,
roteiros e estudos na conta da pessoa, com login do Trama e as permissões que ela der. Nada
depende dele para o resto do app funcionar: enquanto a configuração abaixo não existe, o deploy
do conector é pulado com um aviso (o CI continua verde).

### O que a pessoa dona do projeto cria (uma vez)

1. **O namespace KV** da biblioteca de OAuth (plano grátis: 1.000 gravações e 100 mil leituras
   por dia):

   ```bash
   pnpm --filter @trama/mcp exec wrangler kv namespace create trama-mcp-oauth
   ```

   O comando mostra o `id` (32 letras e números).

2. **A variável `MCP_KV_NAMESPACE_ID`** no GitHub (Settings → Secrets and variables → Actions →
   Variables) com esse `id`. O deploy troca o id de exemplo do `apps/mcp/wrangler.jsonc` por ele.
3. **O segredo `MCP_ENCRYPTION_KEY`** no Worker, depois do primeiro deploy (cifra o refresh token
   guardado nas concessões e assina o bilhete da tela de consentimento; 32 bytes em base64):

   ```bash
   openssl rand -base64 32      # copie o valor
   pnpm --filter @trama/mcp exec wrangler secret put MCP_ENCRYPTION_KEY
   ```

   Guarde a chave num cofre. Se ela se perder ou mudar, as concessões não abrem mais e cada
   pessoa precisa conectar os aplicativos de novo. É uma chave **só do conector**, diferente da
   `TOKEN_ENCRYPTION_KEY` da API.

Não há mais nada: o conector usa a chave **publicável** do Supabase (já nas `vars` do
`wrangler.jsonc`), nunca a secreta, e fala com a API pelo service binding `TRAMA_API` (de Worker
para Worker, grátis). A API precisa estar publicada antes: o deploy a publica primeiro. O site é
construído com `VITE_MCP_URL`, que liga a tela de consentimento e Configurações → Conectores.

### Endereço e como conectar

O endereço é `https://trama-mcp.<subdomínio>.workers.dev/mcp` (aparece também em Configurações →
Conectores, com o botão Copiar). O login é a conta do Trama: o aplicativo abre o navegador numa
tela do site (`/conectar`) que mostra quem está pedindo, as permissões (leitura sempre; escrita
se a pessoa deixar) e pede a senha para permitir.

| Cliente | Como conectar                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude  | Configurações → Conectores → Adicionar conector personalizado → cole o endereço. No Claude Code: `claude mcp add --transport http trama <endereço>` e `/mcp` para entrar. |
| ChatGPT | Configurações → Conectores → (modo desenvolvedor) Criar → URL do servidor MCP = o endereço, autenticação OAuth.                                                           |
| Codex   | `codex mcp add trama --url <endereço>` e `codex mcp login trama`.                                                                                                         |

Estes passos seguem a documentação de cada cliente, mas **só foram conferidos até onde dá sem
eles**: o fluxo de OAuth e as nove ferramentas têm testes automáticos com o cliente do SDK, e o
Worker foi aberto no `wrangler dev` (workerd). Falta validar com cada cliente de verdade depois
do primeiro deploy, e com o MCP Inspector (`npx @modelcontextprotocol/inspector`, transporte
"Streamable HTTP", endereço `/mcp`).

### Como funciona (para quem for mexer)

- `GET /authorize` (o cliente abre) confere o pedido e leva a pessoa a `/conectar#t=<bilhete>`. O
  bilhete é assinado e vale 10 minutos. Nada é concedido ali.
- `POST /connect/decision` recebe a decisão do site. Permitir traz a sessão **nova** do Supabase
  que o site abriu com a senha (o token de acesso no cabeçalho, o refresh token no corpo): o
  Supabase troca o refresh token a cada uso, então a sessão do site não pode ser emprestada.
- A cada troca de código ou renovação do token do MCP, o Worker renova essa sessão e guarda o
  refresh token novo cifrado. O token de acesso do Supabase só vive dentro do token do MCP.
- As ferramentas chamam a API do Trama com esse token (a RLS vale como se fosse a pessoa).
  Nenhuma apaga nada. Cada escrita deixa uma anotação na Agenda com o nome do cliente.
- `GET /connectors` e `DELETE /connectors/:id` (com o token do site) alimentam Configurações →
  Conectores; revogar apaga a concessão e os tokens na hora.
- No `pnpm dev`: `apps/mcp/.dev.vars` com `MCP_ENCRYPTION_KEY` e `TRAMA_API_URL`
  (`.env.example`); o Worker sobe em http://localhost:8788 (`pnpm --filter @trama/mcp dev`).
