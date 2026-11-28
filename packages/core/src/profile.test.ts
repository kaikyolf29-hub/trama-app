import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME_ZONE, isValidTimeZone, timeZoneSchema } from './calendar';
import {
  applyProfileUpdate,
  DEFAULT_EMAIL_PREFERENCES,
  emailPreferencesSchema,
  profileNameSchema,
  profileSchema,
  updateProfileRequestSchema,
} from './profile';

const profile = {
  name: 'Ana Souza',
  timezone: DEFAULT_TIME_ZONE,
  emailPreferences: DEFAULT_EMAIL_PREFERENCES,
};

describe('fuso horário', () => {
  it('aceita nomes IANA', () => {
    for (const zone of ['America/Sao_Paulo', 'America/Manaus', 'Europe/Lisbon', 'UTC']) {
      expect(isValidTimeZone(zone), zone).toBe(true);
      expect(timeZoneSchema.safeParse(zone).success).toBe(true);
    }
  });

  it('recusa o que não é um fuso', () => {
    for (const zone of [
      '',
      'Brasil',
      'America/Nao_Existe',
      '+03:00',
      'GMT+3 ',
      '../etc',
      'a'.repeat(80),
    ]) {
      expect(isValidTimeZone(zone), zone).toBe(false);
      expect(timeZoneSchema.safeParse(zone).success).toBe(false);
    }
  });
});

describe('nome', () => {
  it('corta os espaços das pontas e exige de 1 a 80 letras', () => {
    expect(profileNameSchema.parse('  Ana  ')).toBe('Ana');
    expect(profileNameSchema.safeParse('   ').success).toBe(false);
    expect(profileNameSchema.safeParse('a'.repeat(80)).success).toBe(true);
    expect(profileNameSchema.safeParse('a'.repeat(81)).success).toBe(false);
  });

  it('conta letras como o banco: um emoji vale 1', () => {
    expect(profileNameSchema.safeParse('😀'.repeat(80)).success).toBe(true);
    expect(profileNameSchema.safeParse('😀'.repeat(81)).success).toBe(false);
  });
});

describe('preferências de e-mail', () => {
  it('completa o que o banco não tem com o padrão', () => {
    expect(emailPreferencesSchema.parse({})).toEqual({
      weeklySummary: true,
      reviewReminders: false,
    });
    expect(emailPreferencesSchema.parse({ reviewReminders: true })).toEqual({
      weeklySummary: true,
      reviewReminders: true,
    });
  });
});

describe('perfil', () => {
  it('aceita nome vazio ao ler, mas não fuso inválido', () => {
    expect(profileSchema.safeParse({ ...profile, name: '' }).success).toBe(true);
    expect(profileSchema.safeParse({ ...profile, timezone: 'Marte/Olympus' }).success).toBe(false);
  });
});

describe('pedido de mudança do perfil', () => {
  it('exige ao menos um campo', () => {
    expect(updateProfileRequestSchema.safeParse({}).success).toBe(false);
    expect(updateProfileRequestSchema.safeParse({ emailPreferences: {} }).success).toBe(true);
    expect(updateProfileRequestSchema.safeParse({ name: 'Ana' }).success).toBe(true);
  });

  it('não completa preferências que não vieram (não vira "ligar" sem querer)', () => {
    const parsed = updateProfileRequestSchema.parse({ emailPreferences: { weeklySummary: false } });
    expect(parsed.emailPreferences).toEqual({ weeklySummary: false });
  });

  it('recusa nome vazio, fuso falso e preferência que não é sim ou não', () => {
    expect(updateProfileRequestSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(updateProfileRequestSchema.safeParse({ timezone: 'Atlantis' }).success).toBe(false);
    expect(
      updateProfileRequestSchema.safeParse({ emailPreferences: { weeklySummary: 'sim' } }).success,
    ).toBe(false);
  });

  it('applyProfileUpdate muda só o que veio', () => {
    expect(applyProfileUpdate(profile, { emailPreferences: { reviewReminders: true } })).toEqual({
      ...profile,
      emailPreferences: { weeklySummary: true, reviewReminders: true },
    });
    expect(applyProfileUpdate(profile, { name: 'Bia', timezone: 'America/Manaus' })).toEqual({
      ...profile,
      name: 'Bia',
      timezone: 'America/Manaus',
    });
  });
});
