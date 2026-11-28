# Pedidos para o Codex (o que só a pessoa dona do projeto pode fazer)

Estado em 28 nov 2026, 12h UTC. A **Parte A** pode ser feita já. A **Parte B** só depois do merge
dos PRs indicados (o Claude Code avisa). Nenhum segredo vai para chat, issue, PR, commit ou log.

## Parte A — já pode fazer

Codex, preciso que você configure o Google Drive, os e-mails da API e o modelo de troca de e-mail do Trama
(repositório kaikyolf29-hub/trama-app). Tudo em planos grátis. Não cole nenhum segredo em chat,
issue, PR, commit ou log: cada valor vai direto para o painel indicado.

## 1. Google Cloud Console (console.cloud.google.com), na conta da pessoa dona

1. Crie um projeto chamado "Trama".
2. Em "APIs e serviços > Biblioteca", ative a **Google Drive API** e a **Google Picker API**.
3. Em "Google Auth Platform" (tela de consentimento OAuth):
   - Tipo de usuário: Externo. Nome do app: Trama. E-mail de suporte e de contato: o da conta.
   - Não envie logo agora (logo pede verificação da marca e atrasa).
   - Escopos: só `https://www.googleapis.com/auth/drive.file`.
   - Publique o app ("Em produção"). Em "Teste", o acesso vence em 7 dias. Se o Google pedir
     verificação, pare e me diga o que ele pediu.
4. Em "Clientes", crie um **ID do cliente OAuth** do tipo "Aplicativo da Web", nome "Trama API":
   - Origens JavaScript autorizadas: `https://trama.trama-kaiky.workers.dev` e
     `http://localhost:5173`
   - URIs de redirecionamento autorizados: `https://trama-api.trama-kaiky.workers.dev/drive/callback`
     e `http://localhost:8787/drive/callback`
   - Guarde o ID do cliente e a chave secreta só para os passos 2 e 4 (não salve em arquivo).
5. Em "Credenciais", crie uma **chave de API** chamada "Trama Picker":
   - Restrição de API: só a Google Picker API.
   - Restrição de aplicativo: referenciadores HTTP `https://trama.trama-kaiky.workers.dev/*`,
     `https://*-trama.trama-kaiky.workers.dev/*` e `http://localhost:5173/*`.

## 2. Resend (resend.com), na conta que já existe

Crie uma API key chamada "trama-api" com permissão só de envio ("Sending access").

## 3. Cloudflare, Worker `trama-api` (Workers e Pages > trama-api > Configurações > Variáveis e segredos)

Adicione como **Segredo** (tipo Secret, não texto):

| Nome                   | Valor                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | o ID do cliente OAuth do passo 1.4                                                                                               |
| `GOOGLE_CLIENT_SECRET` | a chave secreta do cliente OAuth do passo 1.4                                                                                    |
| `TOKEN_ENCRYPTION_KEY` | 32 bytes aleatórios em base64: gere com `openssl rand -base64 32` e cole direto no campo, sem mostrar nem salvar em lugar nenhum |
| `RESEND_API_KEY`       | a API key do passo 2                                                                                                             |
| `EMAIL_FROM`           | `Trama <onboarding@resend.dev>`                                                                                                  |

Observação: com o remetente de teste do Resend (`onboarding@resend.dev`), os e-mails só chegam
ao endereço da própria conta do Resend. Isso muda quando houver um domínio próprio (fica para
quando o projeto crescer).

## 4. GitHub (repositório > Settings > Secrets and variables > Actions > aba Variables)

Crie duas **variáveis** (são públicas, vão para o navegador):

- `VITE_GOOGLE_CLIENT_ID`: o mesmo ID do cliente OAuth do passo 1.4
- `VITE_GOOGLE_API_KEY`: a chave de API do passo 1.5

## 5. Depois

Em Actions, rode de novo o último "Deploy" da `main` e confirme que passou. Abra
https://trama.trama-kaiky.workers.dev, entre na conta e veja se o cartão do Google Drive no Início
mostra "Conectar". Não precisa conectar.

Responda com: o que foi criado (nomes, sem valores), o resultado do deploy e qualquer coisa que o
Google pediu e você não conseguiu fazer.

## 6. Supabase (projeto "trama") → Authentication

1. Emails → Templates → **Change Email Address**: cole o conteúdo de
   `supabase/templates/email_change.html` e use o assunto `Confirme o novo e-mail do Trama`.
2. Sign In / Providers → Email: deixe **Secure email change** ligado.

## Parte B — depois do merge dos PRs (o Claude Code avisa quando)

### Depois do PR #43 (resumo semanal e lembrete de revisão)

No Worker `trama-api` (Cloudflare → Workers e Pages → trama-api → Configurações → Variáveis e
segredos):

- Segredo `SUPABASE_SECRET_KEY`: a chave secreta do Supabase (painel do Supabase → Project
  Settings → API Keys → Secret key, `sb_secret_...`). Ela só é usada na tarefa agendada dos
  e-mails e no link de descadastro, por funções do banco liberadas para ela.
- Variável (texto) `API_URL`: `https://trama-api.trama-kaiky.workers.dev`.

### Depois do PR #45 (conector MCP)

1. Cloudflare → Workers e Pages → KV: crie o namespace `trama-mcp-oauth` e copie o id.
2. GitHub → Settings → Secrets and variables → Actions → aba Variables: crie
   `MCP_KV_NAMESPACE_ID` com esse id.
3. Depois do primeiro deploy do Worker `trama-mcp`, crie nele o segredo `MCP_ENCRYPTION_KEY`
   (gere com `openssl rand -base64 32` e cole direto no campo, sem mostrar nem salvar).

Responda com o que foi criado (nomes, sem valores) e qualquer coisa que um painel pediu e você
não conseguiu fazer.
