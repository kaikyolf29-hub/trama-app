/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_MCP_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Google Cloud: ID do cliente OAuth, chave de API restrita ao Picker e (opcional) o número do projeto. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly VITE_GOOGLE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
