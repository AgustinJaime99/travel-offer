const counts = new Intl.NumberFormat('es-AR');
const day = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const month = new Intl.DateTimeFormat('es-AR', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export const formatCount = (value: number) => counts.format(value);

/** Share as a whole percentage ("50 %"), or "—" when there is nothing to divide. */
export function formatShare(part: number, total: number): string {
  return total === 0 ? '—' : `${Math.round((part / total) * 100)} %`;
}

/** Label of a bucket that starts on a local date (YYYY-MM-DD). */
export function formatBucket(bucket: string, granularity: 'day' | 'week' | 'month'): string {
  const date = new Date(`${bucket}T00:00:00Z`);
  const clean = (text: string) => text.replace(/\./g, '');
  if (granularity === 'month') return clean(month.format(date));
  return granularity === 'week' ? `sem. ${clean(day.format(date))}` : clean(day.format(date));
}

/** Change against the previous period: "+3", "−2" or "0". */
export function formatDelta(current: number, previous: number): string {
  const delta = current - previous;
  return delta > 0 ? `+${formatCount(delta)}` : delta < 0 ? `−${formatCount(-delta)}` : '0';
}

/** Short peso amount for headline figures: "$ 1,5 M", "$ 850 mil". Exact values go in tables. */
export function formatArsShort(minor: string): string {
  const pesos = Number(BigInt(minor) / 100n);
  if (pesos >= 1_000_000)
    return `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(pesos / 1_000_000)} M`;
  if (pesos >= 1_000)
    return `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(pesos / 1_000)} mil`;
  return `$ ${counts.format(pesos)}`;
}
