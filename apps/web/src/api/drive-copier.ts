/** Como está a cópia para o Drive, para o aviso "Salvo no Drive" do quadro. */
export type DriveCopyStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'copying' }
  | { kind: 'copied'; at: string }
  | { kind: 'error'; message: string };

/** A cópia no Drive sai a cada 30 s com mudanças e ao fechar a aba (docs/PLAN.md). */
export const DRIVE_COPY_INTERVAL = 30_000;

type Copy = (options: { keepalive: boolean }) => Promise<{ copiedAt: string }>;

/**
 * Copia o projeto para o Drive sem React, no mesmo espírito do `Autosaver`: a primeira mudança
 * marca a cópia para daqui a 30 s (as seguintes não adiam), nunca há dois pedidos ao mesmo
 * tempo, e uma cópia que falha continua na fila para a próxima rodada. `copy` cuida de salvar
 * o projeto no Trama antes, para o Drive nunca receber uma versão mais velha.
 */
export class DriveCopier {
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | null = null;
  private disposed = false;
  private readonly onStatus: (status: DriveCopyStatus) => void;

  constructor(
    private readonly copy: Copy,
    options: { onStatus: (status: DriveCopyStatus) => void; copied?: string },
    private readonly interval = DRIVE_COPY_INTERVAL,
  ) {
    this.onStatus = options.onStatus;
    // `copied`: o projeto já tem cópia no Drive e nada mudou desde que a tela abriu.
    if (options.copied) this.onStatus({ kind: 'copied', at: options.copied });
  }

  /** Há mudança que ainda não foi para o Drive? */
  get pending(): boolean {
    return this.dirty;
  }

  /** O projeto mudou: copia daqui a 30 s (ou na próxima rodada, se uma já está marcada). */
  markDirty(options: { soon?: boolean } = {}): void {
    if (this.disposed) return;
    this.dirty = true;
    this.onStatus({ kind: 'pending' });
    if (options.soon) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.run(false), 0);
    } else if (this.timer === undefined) {
      this.timer = setTimeout(() => void this.run(false), this.interval);
    }
  }

  /** Copia já o que estiver pendente (ao sair da página, `keepalive` termina o pedido). */
  flush(options: { keepalive?: boolean } = {}): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    return this.run(options.keepalive ?? false);
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async run(keepalive: boolean): Promise<void> {
    this.timer = undefined;
    if (this.inFlight) {
      await this.inFlight;
      if (this.dirty && !this.disposed) return this.run(keepalive);
      return;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.onStatus({ kind: 'copying' });
    this.inFlight = this.copy({ keepalive })
      .then((copied) => {
        if (!this.dirty) this.onStatus({ kind: 'copied', at: copied.copiedAt });
      })
      .catch((error: unknown) => {
        // Volta para a fila e tenta de novo na próxima rodada.
        this.dirty = true;
        this.onStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Não deu para copiar para o Drive.',
        });
        if (!this.disposed && this.timer === undefined) {
          this.timer = setTimeout(() => void this.run(false), this.interval);
        }
      })
      .finally(() => {
        this.inFlight = null;
      });
    await this.inFlight;
    // Mudou durante a cópia: a rodada seguinte já foi marcada por `markDirty`.
  }
}
