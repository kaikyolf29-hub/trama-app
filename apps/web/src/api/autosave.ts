import type { FlowContent, SaveProjectResponse } from '@trama/core';

/** Como está o salvamento, para o aviso da tela ("Salvo", "Salvando…"). */
export type SaveStatus =
  | { kind: 'saved'; at: string }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string; retryInMs: number };

type Save<Content> = (
  content: Content,
  baseRevision: number,
  options: { keepalive: boolean },
) => Promise<SaveProjectResponse>;

/** 2 s depois da última mudança (docs/PLAN.md, "Google Drive"). */
export const AUTOSAVE_DELAY = 2000;
const MAX_RETRY = 30_000;

/**
 * Salva sozinho: espera 2 s sem mudanças, manda só a versão mais nova, nunca dois pedidos ao
 * mesmo tempo, tenta de novo com espera crescente quando falha e guarda a revisão que a API
 * devolve para a próxima gravação.
 */
export class Autosaver<Content = FlowContent> {
  private latest: Content | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | null = null;
  private failures = 0;
  private revision: number;
  private disposed = false;

  constructor(
    private readonly save: Save<Content>,
    options: { revision: number; onStatus: (status: SaveStatus) => void },
    private readonly delay = AUTOSAVE_DELAY,
  ) {
    this.revision = options.revision;
    this.onStatus = options.onStatus;
  }

  private readonly onStatus: (status: SaveStatus) => void;

  /** Uma mudança nova: recomeça a espera de 2 s. */
  push(content: Content): void {
    if (this.disposed) return;
    this.latest = content;
    this.failures = 0;
    this.onStatus({ kind: 'pending' });
    this.schedule(this.delay);
  }

  /** Há mudança que ainda não chegou à API? */
  get dirty(): boolean {
    return this.latest !== null;
  }

  /** Salva já o que estiver pendente (ao sair da página, `keepalive` termina o pedido). */
  flush(options: { keepalive?: boolean } = {}): Promise<void> {
    clearTimeout(this.timer);
    return this.run(options.keepalive ?? false);
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(false), ms);
  }

  private async run(keepalive: boolean): Promise<void> {
    if (this.inFlight) {
      // Espera o pedido atual e manda o que tiver chegado nesse meio tempo.
      await this.inFlight;
      if (this.latest && !this.disposed) return this.run(keepalive);
      return;
    }
    const content = this.latest;
    if (!content) return;
    this.latest = null;
    this.onStatus({ kind: 'saving' });
    this.inFlight = this.save(content, this.revision, { keepalive })
      .then((saved) => {
        this.revision = saved.revision;
        this.failures = 0;
        if (!this.latest) this.onStatus({ kind: 'saved', at: saved.updatedAt });
      })
      .catch((error: unknown) => {
        // Volta para a fila, se nada mais novo chegou, e tenta de novo daqui a pouco.
        this.latest ??= content;
        this.failures += 1;
        const retryInMs = Math.min(this.delay * 2 ** (this.failures - 1), MAX_RETRY);
        const message = error instanceof Error ? error.message : 'Não deu para salvar.';
        this.onStatus({ kind: 'error', message, retryInMs });
        if (!this.disposed) this.schedule(retryInMs);
      })
      .finally(() => {
        this.inFlight = null;
      });
    await this.inFlight;
    if (this.latest && !this.disposed && this.failures === 0) this.schedule(this.delay);
  }
}
