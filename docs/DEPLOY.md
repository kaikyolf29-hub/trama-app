# Deploy

O site e a API rodam no **Cloudflare Workers, plano grátis**. O workflow
`.github/workflows/deploy.yml` publica sozinho:

| Quando          | O que sai                                                | Endereço                                                                                |
| --------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Merge na `main` | Site e API em produção                                   | `https://trama.<subdomínio>.workers.dev` e `https://trama-api.<subdomínio>.workers.dev` |
| Cada PR         | Preview do site; o endereço aparece num comentário do PR | `https://pr-<número>-trama.<subdomínio>.workers.dev`                                    |

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
| `TOKEN_ENCRYPTION_KEY`  | Worker da API; gere com `openssl rand -base64 32`                                | Segredo  |
| `RESEND_API_KEY`        | Worker da API (a mesma do SMTP do Supabase, ou outra)                            | Segredo  |
| `EMAIL_FROM`            | Worker da API, ex.: `Trama <ola@seu-dominio>` (domínio no Resend com SPF e DKIM) | Segredo  |
| `VITE_GOOGLE_CLIENT_ID` | GitHub (Settings > Variables > Actions): o mesmo ID do cliente                   | Variável |
| `VITE_GOOGLE_API_KEY`   | GitHub (Variables): a chave de API do Picker                                     | Variável |

O site embute as duas `VITE_` no build (o `deploy.yml` já as repassa). O número do projeto, que o
Picker pede como `appId`, vem do começo do ID do cliente (`VITE_GOOGLE_APP_ID` só se for preciso
trocar). Guarde a `TOKEN_ENCRYPTION_KEY` num cofre: sem ela, os tokens do Drive já gravados não
abrem e as pessoas precisam conectar de novo.

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
