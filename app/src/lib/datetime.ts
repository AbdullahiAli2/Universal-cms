/**
 * Times in the editor are shown and typed in the website's time zone, not the browser's.
 * The API reads a time sent without a zone ("2026-11-01T09:00") in the website's zone too.
 */

function parts(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

/** ISO timestamp -> value for <input type="datetime-local">, in the given zone. */
export function toZonedInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const p = parts(date, timeZone);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  } catch {
    return iso.slice(0, 16);
  }
}

/** Readable date and time in the website's zone, e.g. "3 Nov 2026, 09:00". */
export function formatInZone(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const locale = (typeof document !== "undefined" && document.documentElement.lang) || "en-GB";
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
