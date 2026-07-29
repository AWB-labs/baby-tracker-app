/**
 * How a caregiver is related to the baby.
 *
 * Descriptive only. Access is decided entirely by BabyMember.role, so a
 * grandmother has exactly the same rights as a father — this exists so a shared
 * account reads as people rather than as a list of email addresses.
 *
 * Shared with the mobile app, which renders the same list in the same order.
 */
export const RELATIONS = [
  { value: "mother", label: "Mother", emoji: "👩" },
  { value: "father", label: "Father", emoji: "👨" },
  { value: "sister", label: "Sister", emoji: "👧" },
  { value: "brother", label: "Brother", emoji: "👦" },
  { value: "grandmother", label: "Grandmother", emoji: "👵" },
  { value: "grandfather", label: "Grandfather", emoji: "👴" },
  { value: "aunt", label: "Aunt", emoji: "👩‍🦰" },
  { value: "uncle", label: "Uncle", emoji: "🧔" },
  // Carries a free-text note; everything above is self-explanatory.
  { value: "other", label: "Other", emoji: "🧑" },
] as const;

export type Relation = (typeof RELATIONS)[number]["value"];

const BY_VALUE = new Set<string>(RELATIONS.map((r) => r.value));

export function isRelation(value: string): value is Relation {
  return BY_VALUE.has(value);
}

/** "Grandmother" / "Other · Nanny" — one phrase for the UI and notifications. */
export function formatRelation(
  relation: string | null,
  relationNote: string | null
): string | null {
  if (!relation) return null;
  const meta = RELATIONS.find((r) => r.value === relation);
  if (!meta) return null;
  if (relation === "other" && relationNote) return `${meta.label} · ${relationNote}`;
  return meta.label;
}
