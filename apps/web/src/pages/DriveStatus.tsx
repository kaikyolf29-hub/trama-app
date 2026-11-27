/**
 * Faixa do Google Drive no pé do Início (tela 4). Por enquanto só avisa que a ligação com o
 * Drive chega numa próxima etapa; quem a implementar troca este componente (conectado, pasta
 * "Trama", botão "Abrir pasta no Drive") sem mexer na tela.
 */
export function DriveStatus() {
  return (
    <section
      aria-labelledby="drive-status"
      className="flex items-center gap-4 rounded-block border border-border-subtle bg-surface px-5 py-4"
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-text-muted" />
      <div className="min-w-0">
        <h2 id="drive-status" className="text-[15px] font-semibold text-text-strong">
          Google Drive · conectar em breve
        </h2>
        <p className="text-sm text-text-muted">
          Por enquanto seus projetos ficam só no Trama. A cópia na pasta “Trama” do seu Drive chega
          numa próxima etapa.
        </p>
      </div>
    </section>
  );
}
