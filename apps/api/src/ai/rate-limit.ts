/**
 * Limite simples de pedidos por pessoa por minuto, para ninguém travar o Worker (nem gastar a
 * chave dos outros por engano). Fica na memória da instância do Worker: não é um limite exato
 * entre instâncias, só um freio contra repetição por engano ou abuso simples. O limite de verdade
 * de cada provedor continua valendo na conta da pessoa.
 */
export interface RateLimiter {
  /** Conta um pedido de `who`; devolve `null` se pode, ou quantos segundos esperar. */
  hit(who: string, now: number): number | null;
}

export function createRateLimiter(limit: number, windowMs = 60_000): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(who, now) {
      const recent = (hits.get(who) ?? []).filter((at) => now - at < windowMs);
      if (recent.length >= limit) {
        hits.set(who, recent);
        return Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000));
      }
      recent.push(now);
      hits.set(who, recent);
      // Quem some do mapa não fica para sempre: limpa as entradas vencidas de vez em quando.
      if (hits.size > 1000) {
        for (const [key, times] of hits) {
          if (times.every((at) => now - at >= windowMs)) hits.delete(key);
        }
      }
      return null;
    },
  };
}
