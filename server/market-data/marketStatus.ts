import type { ExchangeSessionPhase } from './types.ts';

// Configurable YYYY-MM-DD Indian exchange holiday calendar (Asia/Kolkata).
// Static list holds official national fixed-date exchange holidays plus any runtime overrides.
const FIXED_ANNUAL_HOLIDAY_MMDD = new Set([
  '01-26', // Republic Day
  '05-01', // Maharashtra Day
  '08-15', // Independence Day
  '10-02', // Mahatma Gandhi Jayanti
  '12-25', // Christmas
]);

export interface IstClockComponents {
  dateKey: string; // YYYY-MM-DD in Asia/Kolkata
  mmdd: string; // MM-DD in Asia/Kolkata
  weekday: string;
  hour: number;
  minute: number;
  totalMinutes: number;
}

export function getIstClockComponents(now: Date): IstClockComponents {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );

  const year = parts.year ?? '1970';
  const month = parts.month ?? '01';
  const day = parts.day ?? '01';
  const hour = Number(parts.hour ?? 0) % 24;
  const minute = Number(parts.minute ?? 0);

  return {
    dateKey: `${year}-${month}-${day}`,
    mmdd: `${month}-${day}`,
    weekday: parts.weekday ?? '',
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
  };
}

export function resolveExchangeSessionPhase(
  now: Date,
  options?: {
    customHolidays?: Iterable<string>;
    providerStatus?: ExchangeSessionPhase;
    providerConfigured?: boolean;
    hasProviderOutage?: boolean;
  },
): ExchangeSessionPhase {
  if (options?.hasProviderOutage) {
    return 'outage';
  }

  const clock = getIstClockComponents(now);
  if (clock.weekday === 'Sat' || clock.weekday === 'Sun') {
    return 'weekend';
  }

  const extraHolidays = new Set(options?.customHolidays ?? []);
  if (extraHolidays.has(clock.dateKey) || FIXED_ANNUAL_HOLIDAY_MMDD.has(clock.mmdd)) {
    return 'holiday';
  }

  // Only report pre_open when the provider explicitly supports/confirms it, or strictly
  // distinguish pre-open (09:00-09:15 IST) from normal equity market session (09:15-15:30 IST).
  if (options?.providerStatus) {
    return options.providerStatus;
  }

  if (clock.totalMinutes >= 540 && clock.totalMinutes < 555) {
    return options?.providerConfigured ? 'pre_open' : 'closed';
  }

  if (clock.totalMinutes >= 555 && clock.totalMinutes < 930) {
    return 'open';
  }

  return 'closed';
}

export function formatIstDisplayTimestamp(isoOrDate: string | Date | null): string | null {
  if (!isoOrDate) return null;
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return null;

  return (
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date) + ' IST'
  );
}
