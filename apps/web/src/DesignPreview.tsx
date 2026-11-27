import { Alert, Button, Logo, LogoMark, PasswordField, TextField } from '@trama/ui';
import type { noteColors } from '@trama/ui/tokens';

const SWATCHES = [
  ['bg-canvas', 'canvas'],
  ['bg-page', 'page'],
  ['bg-sidebar', 'sidebar'],
  ['bg-surface', 'surface'],
  ['bg-field', 'field'],
  ['bg-hover', 'hover'],
  ['bg-selection', 'selection'],
  ['bg-done', 'done'],
] as const;

const NOTE_CLASSES: Record<keyof typeof noteColors, string> = {
  yellow: 'bg-note-yellow-bg text-note-yellow-fg',
  blue: 'bg-note-blue-bg text-note-blue-fg',
  green: 'bg-note-green-bg text-note-green-fg',
  pink: 'bg-note-pink-bg text-note-pink-fg',
};

/** Vitrine dos tokens e dos componentes base (docs/DESIGN.md). */
export function DesignPreview() {
  return (
    <main className="min-h-dvh bg-page px-4 py-10 sm:px-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Logo size={36} />
          <p className="text-text-muted">Componentes base</p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-xl font-semibold text-text-strong">Cores</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SWATCHES.map(([cls, name]) => (
              <div
                key={name}
                className="flex items-center gap-2.5 rounded-control border border-border-subtle p-2"
              >
                <span className={`size-8 rounded-tag border border-border ${cls}`} />
                <span className="text-[13px] text-text">{name}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(NOTE_CLASSES).map(([name, cls]) => (
              <div key={name} className={`h-24 rounded-sticky p-3 text-[13px] shadow-block ${cls}`}>
                Nota {name}
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-xl font-semibold text-text-strong">Tipografia</h2>
          <p className="font-sans text-text">Inter, a fonte da interface.</p>
          <p className="font-serif text-lg text-text-strong">
            Lora, para títulos e a opção serifada.
          </p>
          <p className="font-mono text-text">JetBrains Mono, a opção mono.</p>
          <p className="font-hand text-2xl text-text">Caveat, a opção manuscrita.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-xl font-semibold text-text-strong">Botões</h2>
          <div className="flex flex-wrap gap-3">
            <Button>Apresentar</Button>
            <Button variant="secondary">Compartilhar</Button>
            <Button variant="ghost">Cancelar</Button>
            <Button loading>Salvando</Button>
            <Button size="lg">Criar conta</Button>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-block border border-border bg-surface p-6 shadow-block">
          <h2 className="font-serif text-xl font-semibold text-text-strong">Formulário</h2>
          <TextField label="Nome" placeholder="Como você quer ser chamado" autoComplete="name" />
          <TextField
            label="E-mail"
            type="email"
            error="Digite um e-mail válido."
            defaultValue="voce@"
          />
          <PasswordField
            label="Senha"
            hint="Pelo menos 8 caracteres."
            autoComplete="new-password"
          />
          <Alert tone="error">Senha incorreta. Tente de novo ou recupere a senha.</Alert>
          <Alert tone="success">Senha alterada. Você já pode entrar.</Alert>
          <Alert tone="info">Enviamos um link para o seu e-mail.</Alert>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-xl font-semibold text-text-strong">Logo</h2>
          <div className="flex flex-wrap items-center gap-6 rounded-block bg-canvas p-6">
            <LogoMark size={64} title="Trama" />
            <LogoMark size={32} />
            <Logo size={40} />
          </div>
        </section>
      </div>
    </main>
  );
}
