import apiClient from "./client";

/**
 * The immunisation schedule, mirrored from api/src/lib/vaccines.ts.
 *
 * One visit per month of age for the first year. Even months are mandatory and
 * odd months optional — a deliberate simplification rather than a medical
 * fact, so a family should still follow whatever card their clinic gives them.
 */
export const FIRST_MONTH = 1;
export const LAST_MONTH = 12;

export const VACCINE_MONTHS: number[] = Array.from(
  { length: LAST_MONTH - FIRST_MONTH + 1 },
  (_, i) => FIRST_MONTH + i
);

export function isMandatoryMonth(month: number): boolean {
  return month % 2 === 0;
}

export interface VaccineRecord {
  id: number;
  babyId: number;
  monthNumber: number;
  /** ISO date the dose was given. Null means not taken yet. */
  givenAt: string | null;
  notes: string | null;
  updatedAt: string;
}

/**
 * One row of the schedule as the screen draws it: every month 1–12, whether or
 * not the family has recorded anything against it.
 */
export interface VaccineMonth {
  month: number;
  mandatory: boolean;
  given: boolean;
  givenAt: string | null;
  notes: string | null;
  /**
   * True when the baby is already older than this month and the dose still
   * isn't recorded. Needs a date of birth, so it stays false without one rather
   * than guessing.
   */
  overdue: boolean;
  /**
   * True while this visit is still out of reach — nothing to record, so the
   * tile is dimmed and disabled rather than inviting a dose to be logged
   * before it's due. Never true once something's actually recorded against
   * it, and — like `overdue` — stays false without a known DOB rather than
   * blocking a family who hasn't set one.
   *
   * Required and optional visits open at different moments: see
   * `unlocksAtMonth`.
   */
  locked: boolean;
}

/** Whole months elapsed since birth, or null when the DOB isn't known. */
export function ageInMonths(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (isNaN(born.getTime())) return null;
  const now = new Date();
  let months =
    (now.getFullYear() - born.getFullYear()) * 12 +
    (now.getMonth() - born.getMonth());
  // Not a full month until the day-of-month comes round.
  if (now.getDate() < born.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * The age, in whole months, at which a visit stops being locked.
 *
 * A required visit opens when the baby reaches that month, as it always has:
 * month 4 is for a four-month-old, and offering it earlier would invite a
 * dose to be recorded against the wrong visit.
 *
 * An optional one opens a month sooner — the moment the baby enters that
 * month of life rather than completes it. These are the catch-up visits, and
 * clinics give them across the month rather than on its last day, so a family
 * offered the three-month jab the week their baby turned two months had
 * nowhere to put it until now. Being early is the normal case for these, so
 * the tile shouldn't treat it as a mistake.
 *
 * `overdue` is deliberately not moved with it: opening a visit sooner says
 * nothing about when it becomes late.
 */
function unlocksAtMonth(month: number): number {
  return isMandatoryMonth(month) ? month : month - 1;
}

/**
 * Merge the fixed 1–12 schedule with whatever the family has recorded, so the
 * screen renders one uniform list instead of reconciling two shapes inline.
 */
export function buildSchedule(
  records: VaccineRecord[],
  dob: string | null | undefined
): VaccineMonth[] {
  const byMonth = new Map(records.map((r) => [r.monthNumber, r]));
  const age = ageInMonths(dob);

  return VACCINE_MONTHS.map((month) => {
    const record = byMonth.get(month) ?? null;
    const given = !!record?.givenAt;
    return {
      month,
      mandatory: isMandatoryMonth(month),
      given,
      givenAt: record?.givenAt ?? null,
      notes: record?.notes ?? null,
      overdue: !given && age !== null && age > month,
      locked: !given && age !== null && age < unlocksAtMonth(month),
    };
  });
}

export async function getVaccines(babyId: number): Promise<VaccineRecord[]> {
  const res = await apiClient.get<VaccineRecord[]>("/vaccines", {
    params: { babyId },
  });
  return res.data;
}

export async function saveVaccine(data: {
  babyId: number;
  monthNumber: number;
  givenAt: string | null;
  notes?: string | null;
}): Promise<VaccineRecord> {
  const res = await apiClient.put<VaccineRecord>("/vaccines", data);
  return res.data;
}
