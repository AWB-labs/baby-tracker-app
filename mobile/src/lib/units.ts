import type { UnitSystem } from "../api/settings";

/**
 * Everything is stored metric — kg, cm, ml, °C — and converted only for
 * display and input. Keeping one canonical unit in the database means changing
 * this preference never rewrites or reinterprets a single existing entry.
 */

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;
const ML_PER_FL_OZ = 29.5735295625;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const cmToInch = (cm: number) => cm / CM_PER_INCH;
export const inchToCm = (inch: number) => inch * CM_PER_INCH;
export const mlToFlOz = (ml: number) => ml / ML_PER_FL_OZ;
export const flOzToMl = (oz: number) => oz * ML_PER_FL_OZ;
export const celsiusToF = (c: number) => c * (9 / 5) + 32;
export const fToCelsius = (f: number) => (f - 32) * (5 / 9);

/** Trim trailing zeros: 4.50 -> "4.5", 4.00 -> "4" */
function trim(value: number, decimals: number): string {
  return String(parseFloat(value.toFixed(decimals)));
}

export interface UnitLabels {
  weight: string;
  height: string;
  volume: string;
  temperature: string;
}

export function unitLabels(system: UnitSystem): UnitLabels {
  return system === "imperial"
    ? { weight: "lb", height: "in", volume: "fl oz", temperature: "°F" }
    : { weight: "kg", height: "cm", volume: "ml", temperature: "°C" };
}

export interface UnitFormatters extends UnitLabels {
  system: UnitSystem;
  /** kg (stored) -> "4.5 kg" / "9.9 lb" */
  formatWeight: (kg: number) => string;
  /** cm (stored) -> "52 cm" / "20.5 in" */
  formatHeight: (cm: number) => string;
  /** ml (stored) -> "120 ml" / "4.1 fl oz" */
  formatVolume: (ml: number) => string;
  /** °C (stored) -> "38.2 °C" / "100.8 °F" */
  formatTemperature: (celsius: number) => string;
  /** Stored value -> the number to show in an input box. */
  toDisplayWeight: (kg: number) => string;
  toDisplayHeight: (cm: number) => string;
  toDisplayVolume: (ml: number) => string;
  toDisplayTemperature: (celsius: number) => string;
  /** What the user typed -> the metric value to store. */
  parseWeight: (input: string) => number;
  parseHeight: (input: string) => number;
  parseVolume: (input: string) => number;
  parseTemperature: (input: string) => number;
}

export function createUnitFormatters(system: UnitSystem): UnitFormatters {
  const labels = unitLabels(system);
  const imperial = system === "imperial";

  const displayWeight = (kg: number) => trim(imperial ? kgToLb(kg) : kg, 2);
  const displayHeight = (cm: number) => trim(imperial ? cmToInch(cm) : cm, 1);
  const displayVolume = (ml: number) => trim(imperial ? mlToFlOz(ml) : ml, 1);
  const displayTemp = (c: number) => trim(imperial ? celsiusToF(c) : c, 1);

  return {
    ...labels,
    system,
    formatWeight: (kg) => `${displayWeight(kg)} ${labels.weight}`,
    formatHeight: (cm) => `${displayHeight(cm)} ${labels.height}`,
    formatVolume: (ml) => `${displayVolume(ml)} ${labels.volume}`,
    formatTemperature: (c) => `${displayTemp(c)} ${labels.temperature}`,
    toDisplayWeight: displayWeight,
    toDisplayHeight: displayHeight,
    toDisplayVolume: displayVolume,
    toDisplayTemperature: displayTemp,
    parseWeight: (input) => {
      const n = parseFloat(input);
      return imperial ? lbToKg(n) : n;
    },
    parseHeight: (input) => {
      const n = parseFloat(input);
      return imperial ? inchToCm(n) : n;
    },
    parseVolume: (input) => {
      const n = parseFloat(input);
      return imperial ? flOzToMl(n) : n;
    },
    parseTemperature: (input) => {
      const n = parseFloat(input);
      return imperial ? fToCelsius(n) : n;
    },
  };
}
