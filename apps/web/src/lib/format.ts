const TIME_ZONE = 'America/Argentina/Buenos_Aires';
// Argentina has no daylight saving time: dates entered as calendar days are anchored to UTC−3.
const AR_OFFSET = '-03:00';

const dateTime = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: TIME_ZONE,
});
const dateOnly = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: TIME_ZONE });
const isoDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateOnly.format(new Date(iso));
}

/** ISO instant → "YYYY-MM-DD" calendar day in Argentina (value of an <input type="date">). */
export function isoToArDay(iso: string): string {
  return isoDay.format(new Date(iso));
}

/** Last instant of an Argentine calendar day: a proposal valid "until 2027-03-31" is valid that whole day. */
export function arDayToEndIso(day: string): string {
  return new Date(`${day}T23:59:59.999${AR_OFFSET}`).toISOString();
}

/** First instant of an Argentine calendar day. */
export function arDayToStartIso(day: string): string {
  return new Date(`${day}T00:00:00.000${AR_OFFSET}`).toISOString();
}
