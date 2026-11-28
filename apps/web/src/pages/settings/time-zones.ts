/** Fusos do Brasil, na ordem de uso, com o nome que a pessoa reconhece. */
const BRAZIL_ZONES: [id: string, label: string][] = [
  ['America/Sao_Paulo', 'Brasília (São Paulo)'],
  ['America/Manaus', 'Manaus'],
  ['America/Cuiaba', 'Cuiabá'],
  ['America/Campo_Grande', 'Campo Grande'],
  ['America/Bahia', 'Salvador (Bahia)'],
  ['America/Fortaleza', 'Fortaleza'],
  ['America/Recife', 'Recife'],
  ['America/Belem', 'Belém'],
  ['America/Maceio', 'Maceió'],
  ['America/Araguaina', 'Araguaína'],
  ['America/Santarem', 'Santarém'],
  ['America/Porto_Velho', 'Porto Velho'],
  ['America/Boa_Vista', 'Boa Vista'],
  ['America/Rio_Branco', 'Rio Branco'],
  ['America/Eirunepe', 'Eirunepé'],
  ['America/Noronha', 'Fernando de Noronha'],
];

export interface TimeZoneOption {
  id: string;
  label: string;
}

export interface TimeZoneGroups {
  brazil: TimeZoneOption[];
  others: TimeZoneOption[];
}

/** O nome de um fuso fora do Brasil: "America/Argentina/Buenos_Aires" vira "America · Argentina · Buenos Aires". */
function plainLabel(id: string): string {
  return id.replace(/_/g, ' ').split('/').join(' · ');
}

/** Os fusos do navegador (`Intl.supportedValuesOf`), com os do Brasil em cima. */
export function groupTimeZones(supported: readonly string[], current?: string): TimeZoneGroups {
  const known = new Set(supported);
  // O fuso atual entra mesmo que o navegador não o liste (ex.: "UTC"), para o campo não mentir.
  if (current) known.add(current);
  const brazil = BRAZIL_ZONES.filter(([id]) => known.has(id)).map(([id, label]) => ({ id, label }));
  const brazilIds = new Set(brazil.map((zone) => zone.id));
  const others = [...known]
    .filter((id) => !brazilIds.has(id))
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({ id, label: plainLabel(id) }));
  return { brazil, others };
}

/** Fusos que o navegador conhece; navegador antigo, sem a função, só mostra os do Brasil. */
export function browserTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  try {
    return intl.supportedValuesOf?.('timeZone') ?? BRAZIL_ZONES.map(([id]) => id);
  } catch {
    return BRAZIL_ZONES.map(([id]) => id);
  }
}
