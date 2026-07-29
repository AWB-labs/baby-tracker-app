/**
 * The immunisation schedule the app tracks: one visit per month of age, for the
 * baby's first year.
 *
 * Odd months are mandatory and even months optional. That is a deliberate
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

/** Odd months are the required visits; even months are catch-up / optional. */
export function isMandatoryMonth(month: number): boolean {
  return month % 2 === 1;
}
