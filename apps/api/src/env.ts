/** Variáveis e segredos do Worker (wrangler.jsonc e `wrangler secret put`). */
export interface Env {
  APP_URL?: string;
  SUPABASE_URL?: string;
  /** Chave publicável (pública): com o token da pessoa, o banco aplica a RLS. */
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Subdomínio workers.dev da conta: libera o site e os previews dos PRs no CORS. */
  WORKERS_SUBDOMAIN?: string;
  /** Cliente OAuth web do Google (Google Cloud Console > Credenciais). Segredo do Worker. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /**
   * 32 bytes em base64 (`openssl rand -base64 32`): cifra o refresh token do Drive e as chaves de
   * IA das pessoas, e assina o `state`.
   */
  TOKEN_ENCRYPTION_KEY?: string;
}
