/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment -- imita a API assíncrona do KV; o JSON guardado não tem tipo */
interface Entry {
  value: string;
  expiresAt: number | null;
  metadata: unknown;
}

/**
 * Um KV em memória, com o que a biblioteca de OAuth e o conector usam: get (texto e JSON), put
 * (com validade e metadados), delete e list (prefixo, limite e cursor). A validade segue
 * `clock`, para os testes avançarem o tempo.
 */
export function createMemoryKV(clock: () => number = () => Date.now()) {
  const store = new Map<string, Entry>();
  const live = (key: string): Entry | undefined => {
    const entry = store.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= clock()) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };

  const kv = {
    async get(key: string, options?: string | { type?: string }) {
      const entry = live(key);
      if (!entry) return null;
      const type = typeof options === 'string' ? options : options?.type;
      return type === 'json' ? JSON.parse(entry.value) : entry.value;
    },
    async getWithMetadata(key: string, options?: string | { type?: string }) {
      const entry = live(key);
      if (!entry) return { value: null, metadata: null };
      const type = typeof options === 'string' ? options : options?.type;
      return {
        value: type === 'json' ? JSON.parse(entry.value) : entry.value,
        metadata: entry.metadata ?? null,
      };
    },
    async put(
      key: string,
      value: string,
      options?: { expiration?: number; expirationTtl?: number; metadata?: unknown },
    ) {
      let expiresAt: number | null = null;
      if (options?.expirationTtl !== undefined) expiresAt = clock() + options.expirationTtl * 1000;
      if (options?.expiration !== undefined) expiresAt = options.expiration * 1000;
      store.set(key, { value, expiresAt, metadata: options?.metadata });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(options?: { prefix?: string; limit?: number; cursor?: string }) {
      const prefix = options?.prefix ?? '';
      const limit = options?.limit ?? 1000;
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix) && live(key)).sort();
      const start = options?.cursor ? keys.findIndex((key) => key > options.cursor!) : 0;
      const slice = start === -1 ? [] : keys.slice(start, start + limit);
      const complete = start === -1 || start + limit >= keys.length;
      return {
        keys: slice.map((name) => {
          const entry = store.get(name)!;
          return {
            name,
            ...(entry.expiresAt === null ? {} : { expiration: Math.floor(entry.expiresAt / 1000) }),
            ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
          };
        }),
        list_complete: complete,
        ...(complete ? {} : { cursor: slice[slice.length - 1] }),
        cacheStatus: null,
      };
    },
  };
  return Object.assign(kv, {
    /** Quantas chaves existem (para conferir que algo foi, ou não foi, gravado). */
    size: () => [...store.keys()].filter((key) => live(key)).length,
    keys: () => [...store.keys()].filter((key) => live(key)),
    /** Tudo o que está guardado, em texto, para conferir que nenhum segredo aparece em claro. */
    dump: () => JSON.stringify([...store.entries()]),
  }) as unknown as KVNamespace & {
    size(): number;
    keys(): string[];
    dump(): string;
  };
}
