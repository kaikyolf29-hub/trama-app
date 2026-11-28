/** Variáveis e segredos do Worker (wrangler.jsonc e `wrangler secret put`). */
export interface Env {
  /** Endereço do site; sem ele, vale https://trama.<WORKERS_SUBDOMAIN>.workers.dev (tarefa agendada). */
  APP_URL?: string;
  SUPABASE_URL?: string;
  /** Chave publicável (pública): com o token da pessoa, o banco aplica a RLS. */
  SUPABASE_PUBLISHABLE_KEY?: string;
  /**
   * Chave secreta (sb_secret_...), ignora a RLS. Segredo do Worker (`wrangler secret put`), usada
   * SÓ pela tarefa agendada e pelo link de descadastro (apps/api/src/digest), por funções do
   * banco que só a `service_role` chama (supabase/migrations/..._emails_estudos.sql).
   */
  SUPABASE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Subdomínio workers.dev da conta: libera o site e os previews dos PRs no CORS. */
  WORKERS_SUBDOMAIN?: string;
  /**
   * Endereço público da própria API (sem barra no fim), para o link de descadastro dos e-mails.
   * Sem ele, vale https://trama-api.<WORKERS_SUBDOMAIN>.workers.dev.
   */
  API_URL?: string;
  /** Cliente OAuth web do Google (Google Cloud Console > Credenciais). Segredo do Worker. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /**
   * 32 bytes em base64 (`openssl rand -base64 32`): cifra o refresh token do Drive e as chaves de
   * IA das pessoas, e assina o `state`.
   */
  TOKEN_ENCRYPTION_KEY?: string;
}
