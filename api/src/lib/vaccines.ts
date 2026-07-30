/**
 * The immunisation schedule the app tracks: one visit per month of age, for the
 * baby's first year.
 *
 * Even months are mandatory and odd months optional. That is a deliberate
 * simplification of a real schedule rather than a medical fact — national
 * programmes differ, and a family should follow whatever their clinic gives
 * them. It exists so the app can show at a glance which visits must not be
 * missed, and it is defined in one place so changing the rule is one edit.
 */
export const FIRST_MONTH = 1;
export const LAST_MONTH = 12;

export const VACCINE_MONTHS: number[] = Array.from(
  { length: LAST_MONTH - FIRST_MONTH + 1 },
  (_, i) => FIRST_MONTH + i
);

export function isVaccineMonth(month: number): boolean {
  return (
    Number.isInteger(month) && month >= FIRST_MONTH && month <= LAST_MONTH
  );
}

/** Even months are the required visits; odd months are catch-up / optional. */
export function isMandatoryMonth(month: number): boolean {
  return month % 2 === 0;
}

/**
 * Whole months a baby has lived, on the caregiver's clock.
 *
 * Counts completed months rather than started ones: a baby born on the 20th is
 * three months old on the 20th, not on the 1st. Returns null without a date of
 * birth, because a reminder that says "your baby is 0 months old" is worse than
 * no reminder.
 */
export function ageInMonths(
  dob: Date | null,
  now: Date,
  tzOffsetMinutes: number | null = 0
): number | null {
  if (!dob) return null;
  const shift = (tzOffsetMinutes ?? 0) * 60_000;
  const born = new Date(dob.getTime() + shift);
  const local = new Date(now.getTime() + shift);

  let months =
    (local.getUTCFullYear() - born.getUTCFullYear()) * 12 +
    (local.getUTCMonth() - born.getUTCMonth());
  // Not a full month until the day-of-month comes round again.
  if (local.getUTCDate() < born.getUTCDate()) months -= 1;
  return months;
}
