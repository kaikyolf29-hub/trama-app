const MINUTE = 60_000;

/** Meia-noite (hora local) do dia da data, para contar dias de calendário. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * A coluna "Editado" da tela 4: "agora", "há 2 min", "há 3 h", "ontem", o dia da semana
 * ("segunda") até seis dias atrás e, depois, a data ("12 nov", com o ano se for outro).
 */
export function editedLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const elapsed = now.getTime() - date.getTime();
  if (Number.isNaN(elapsed) || elapsed < MINUTE) return 'agora';

  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) {
    const minutes = Math.floor(elapsed / MINUTE);
    return minutes < 60 ? `há ${minutes} min` : `há ${Math.floor(minutes / 60)} h`;
  }
  if (days === 1) return 'ontem';
  if (days < 7) {
    return date.toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '');
  }
  const label = date
    .toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    })
    .replace(/\./g, '')
    .replace(/ de /g, ' ');
  return label;
}
