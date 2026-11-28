/** Conexão de uma pessoa com o Drive, como o banco guarda (o token só existe cifrado). */
export interface DriveConnection {
  email: string | null;
  refreshTokenEncrypted: string;
  rootFolderId: string | null;
  consecutiveFailures: number;
  lastCopyAt: string | null;
  lastError: string | null;
}

/**
 * Onde a conexão com o Drive mora, do ponto de vista das rotas. A versão de verdade usa o
 * Supabase com o token da pessoa (a RLS só deixa ver a própria linha); os testes usam uma em
 * memória. Cada instância já é "da pessoa que fez o pedido".
 */
export interface DriveStore {
  get(): Promise<DriveConnection | null>;
  /** Conecta (ou reconecta): troca o token e zera as falhas; mantém a pasta "Trama" já criada. */
  connect(input: { email: string | null; refreshTokenEncrypted: string }): Promise<void>;
  setRootFolder(folderId: string): Promise<void>;
  /** Anota o resultado de uma cópia e devolve quantas falhas seguidas já são. */
  recordCopy(ok: boolean, error?: string): Promise<{ consecutiveFailures: number }>;
  disconnect(): Promise<void>;
}

/** Reserva do e-mail de boas-vindas: uma vez por pessoa. */
export interface WelcomeStore {
  /** true só na primeira vez de cada pessoa. */
  claim(): Promise<boolean>;
  /** Devolve a reserva quando o envio falhou. */
  release(): Promise<void>;
}
