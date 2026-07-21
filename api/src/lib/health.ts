export const HEALTH_CONDITIONS = [
  { value: "fever", label: "Fever", icon: "🌡️" },
  { value: "cold", label: "Cold", icon: "🤧" },
  { value: "stomach", label: "Stomach", icon: "🤢" },
  { value: "other", label: "Other", icon: "❓" },
] as const;

export type HealthCondition = (typeof HEALTH_CONDITIONS)[number]["value"];

const VALUES: ReadonlySet<string> = new Set(HEALTH_CONDITIONS.map((c) => c.value));

export function isHealthCondition(value: string): value is HealthCondition {
  return VALUES.has(value);
}
