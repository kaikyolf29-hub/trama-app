/** Imitação mínima de `cloudflare:workers` para os testes em Node (só o que a biblioteca importa). */
export class WorkerEntrypoint<Env = unknown, Props = unknown> {
  constructor(
    public ctx: { props: Props; waitUntil(promise: Promise<unknown>): void },
    public env: Env,
  ) {}
}

export class DurableObject {}
export class RpcTarget {}
