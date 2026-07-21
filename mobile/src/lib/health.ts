export const HEALTH_CONDITIONS = [
  { value: "fever", label: "Fever", icon: "🌡️" },
  { value: "cold", label: "Cold", icon: "🤧" },
  { value: "stomach", label: "Stomach", icon: "🤢" },
  { value: "other", label: "Other", icon: "❓" },
] as const;

export type HealthCondition = (typeof HEALTH_CONDITIONS)[number]["value"];

export const HEALTH_CONDITION_META: Record<
  HealthCondition,
  { label: string; icon: string }
> = Object.fromEntries(
  HEALTH_CONDITIONS.map((c) => [c.value, { label: c.label, icon: c.icon }])
) as Record<HealthCondition, { label: string; icon: string }>;

export function isHealthCondition(value: string): value is HealthCondition {
  return value in HEALTH_CONDITION_META;
}
