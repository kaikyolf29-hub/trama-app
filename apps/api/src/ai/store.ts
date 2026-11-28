import type { AiKeySummary, AiProvider, AiSettings } from '@trama/core';

/** Uma chave guardada, como o banco a tem: só existe cifrada. */
export interface StoredAiKey {
  provider: AiProvider;
  keyEncrypted: string;
  last4: string;
}

/**
 * Onde as chaves de IA e as preferências moram, do ponto de vista das rotas. A versão de verdade
 * usa o Supabase com o token da pessoa (a RLS só deixa ver as próprias linhas); os testes usam
 * uma em memória. Cada instância já é "da pessoa que fez o pedido".
 */
export interface AiStore {
  getSettings(): Promise<AiSettings | null>;
  saveSettings(settings: AiSettings): Promise<AiSettings>;
  /** O resumo das chaves (sem o texto cifrado): é tudo o que a lista de chaves precisa. */
  listKeys(): Promise<AiKeySummary[]>;
  /** A chave cifrada de um provedor, para a API decifrar na hora de usar. */
  getKey(provider: AiProvider): Promise<StoredAiKey | null>;
  /** Guarda ou troca a chave (já cifrada) do provedor. */
  saveKey(key: StoredAiKey): Promise<AiKeySummary>;
  deleteKey(provider: AiProvider): Promise<void>;
}
