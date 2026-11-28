import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

/** Variáveis, segredos e ligações do Worker (wrangler.jsonc e `wrangler secret put`). */
export interface Env {
  /** Onde a biblioteca de OAuth guarda clientes, concessões e tokens. */
  OAUTH_KV: KVNamespace;
  /** Posto pela biblioteca em cada pedido: as funções de autorização. */
  OAUTH_PROVIDER: OAuthHelpers;
  /** A API do Trama por service binding (de Worker para Worker). */
  TRAMA_API?: Fetcher;
  /** Endereço público da API; só vale sem o service binding (por exemplo, no `pnpm dev`). */
  TRAMA_API_URL?: string;
  /** O site: para onde o `/authorize` leva a pessoa e quem o CORS libera. */
  APP_URL?: string;
  /** O endereço deste Worker, sem barra no fim. Sem ele, vale o endereço do pedido. */
  MCP_URL?: string;
  SUPABASE_URL?: string;
  /** Chave publicável (pública): com o token da pessoa, o banco aplica a RLS. A secreta não entra. */
  SUPABASE_PUBLISHABLE_KEY?: string;
  /**
   * 32 bytes em base64 (`openssl rand -base64 32`): cifra o refresh token do Supabase que fica
   * nas concessões e assina o bilhete do consentimento. Segredo do Worker; sem ele, o conector
   * não autoriza ninguém.
   */
  MCP_ENCRYPTION_KEY?: string;
  /** Subdomínio workers.dev da conta: libera o site e os previews dos PRs no CORS. */
  WORKERS_SUBDOMAIN?: string;
}

/** O que as concessões guardam: quem autorizou e o refresh token do Supabase, cifrado. */
export interface GrantProps {
  userId: string;
  clientName: string;
  /** O refresh token da sessão do conector no Supabase, cifrado (veja `vault.ts`). */
  sealedRefreshToken: string;
}

/** O que cada token de acesso carrega: vale uma hora, o tempo do token do Supabase. */
export interface AccessProps {
  userId: string;
  grantId: string;
  clientName: string;
  /** O token de acesso do Supabase; só vive na memória do pedido, nunca vai ao cliente nem a log. */
  supabaseAccessToken: string;
}
