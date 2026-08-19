/**
 * One calendar system for every date the app shows or asks for.
 *
 * Reported from Egypt and Saudi Arabia: on a phone whose region uses the
 * Hijri calendar, the app *displayed* Hijri dates (`toLocaleDateString` follows
 * the device calendar) while the native date picker handed back a date the rest
 * of the app then read as Gregorian — a 1447 that isn't 2026 at all. Anything
 * that far outside the picker's supported range collapses to the epoch, which
 * is why the field showed 1 Jan 1970 and snapped straight back to it on every
 * attempt to correct it: the bad value was being fed to the picker as its own
 * starting point, over and over.
 *
 * Pinning both halves to the Gregorian calendar closes that loop: the wheel is
 * asked for the same calendar the labels are written in, and the guard below
 * refuses a nonsense date instead of storing it. Offering Hijri as a genuine
 * choice — picker and labels together, per account — is a real feature and a
 * separate piece of work; this is the correctness fix underneath it.
 */

/** The device's locale with its calendar forced to Gregorian. */
export const DATE_LOCALE = ((): string => {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
    // "ar-SA-u-ca-islamic-umalqura-nu-arab" → "ar-SA". The Unicode extension
    // carries the calendar we're overriding, so it goes before ours is added.
    const base = resolved.split("-u-")[0] || "en";
    return `${base}-u-ca-gregory`;
  } catch {
    // Older JS engines without full Intl data. A plain tag still formats.
    return "en-GB";
  }
})();

/**
 * Nothing this app records predates the twentieth century, and a picker that
 * lands below its own supported range is exactly the 1970 failure above.
 */
export const MIN_PICKABLE_DATE = new Date(1900, 0, 1);

/** Far enough ahead for a due date or a scheduled reminder, not for a typo. */
const MAX_PICKABLE = new Date(2100, 0, 1);

/**
 * The date a picker just reported, or the previous value if it's unusable.
 *
 * Callers pass what they already had as `fallback`, so a rejected value leaves
 * the field exactly where the user left it rather than jumping somewhere they
 * have to notice and undo.
 */
export function safePickedDate(
  picked: Date | undefined | null,
  fallback: Date
): Date {
  if (!picked) return fallback;
  const ms = picked.getTime();
  if (Number.isNaN(ms)) return fallback;
  if (ms < MIN_PICKABLE_DATE.getTime() || ms > MAX_PICKABLE.getTime()) {
    return fallback;
  }
  return picked;
}

/** "19 Aug 2026" — always Gregorian, whatever the phone's region is set to. */
export function formatCalendarDate(
  d: Date,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }
): string {
  return d.toLocaleDateString(DATE_LOCALE, options);
}
