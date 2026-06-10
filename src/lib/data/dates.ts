/* Small UTC date helpers; avoids a date library dependency. */

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function dayOfWeek(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Inclusive list of ISO dates, oldest first. */
export function dateRange(endDate: string, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(addDays(endDate, -i));
  }
  return out;
}

export function diffDays(a: string, b: string): number {
  const ms =
    new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86400000);
}
