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

## API de projetos (etapa 1.5)

- A API fala com o Supabase com a chave **publicável** e o token de login da pessoa, então o
  banco aplica a RLS como se fosse ela. Os dois valores públicos ficam nas `vars` de
  `apps/api/wrangler.jsonc`; a chave secreta não é usada aqui.
- O deploy passa `WORKERS_SUBDOMAIN` para a API, que só aceita pedidos (CORS) do site
  `trama.<subdomínio>.workers.dev`, dos previews `pr-<n>-trama.<subdomínio>.workers.dev` e do
  `pnpm dev` (`localhost:5173`).
- O site é construído com `VITE_API_URL=https://trama-api.<subdomínio>.workers.dev`.
