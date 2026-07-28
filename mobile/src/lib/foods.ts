import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Solids / first-foods tracker, per baby, on the device.
 *
 * Introducing solids is a checklist parents share: which foods a baby has
 * tried, whether an allergen has been offered yet, and — most importantly —
 * whether anything disagreed with them and why (gas, a rash, vomiting…). None
 * of this maps onto the activity log the server keeps, and the guidance is that
 * it's most useful when every carer can see the same list, so it lives in
 * AsyncStorage per baby exactly like the habit configuration does. No server
 * type, no schema change.
 *
 * Defaults follow current starting-solids guidance: lead with iron-rich foods,
 * then vegetables, fruit and grains, and introduce the "Big 9" allergens early
 * and one at a time while watching for a reaction.
 */

export type FoodCategory = "first" | "veg" | "fruit" | "grain" | "allergen";

export type FoodOpinion = "liked" | "neutral" | "disliked";

export type FoodReaction =
  | "gas"
  | "rash"
  | "hives"
  | "eczema"
  | "vomiting"
  | "diarrhea"
  | "constipation"
  | "congestion"
  | "swelling"
  | "other";

export interface FoodDef {
  id: string;
  name: string;
  emoji: string;
  category: FoodCategory;
  /** One of the Big 9 — offered early and watched closely. */
  allergen?: boolean;
  /** Added by the family rather than shipped in the catalogue. */
  custom?: boolean;
}

export interface FoodStatus {
  tried: boolean;
  /** ISO timestamp of the first time it was offered. */
  triedDate?: string | null;
  opinion?: FoodOpinion | null;
  /** Adverse signs observed — the "something's wrong, and why". */
  reactions: FoodReaction[];
  notes?: string;
}

export interface FoodsState {
  statuses: Record<string, FoodStatus>;
  custom: FoodDef[];
  /** Catalogue ids the family has removed from their list. */
  removed: string[];
}

export const CATEGORY_LABEL: Record<FoodCategory, string> = {
  first: "Iron-rich first foods",
  veg: "Vegetables",
  fruit: "Fruit",
  grain: "Grains",
  allergen: "Common allergens",
};

export const CATEGORY_ORDER: FoodCategory[] = [
  "first",
  "veg",
  "fruit",
  "grain",
  "allergen",
];

export const OPINION_META: Record<FoodOpinion, { label: string; emoji: string }> = {
  liked: { label: "Liked it", emoji: "😋" },
  neutral: { label: "Meh", emoji: "😐" },
  disliked: { label: "Refused", emoji: "😖" },
};

export const REACTION_ORDER: FoodReaction[] = [
  "gas",
  "rash",
  "hives",
  "eczema",
  "vomiting",
  "diarrhea",
  "constipation",
  "congestion",
  "swelling",
  "other",
];

export const REACTION_META: Record<
  FoodReaction,
  { label: string; emoji: string }
> = {
  gas: { label: "Gas / fussy", emoji: "💨" },
  rash: { label: "Rash", emoji: "🔴" },
  hives: { label: "Hives", emoji: "🟥" },
  eczema: { label: "Eczema flare", emoji: "🩹" },
  vomiting: { label: "Vomiting", emoji: "🤮" },
  diarrhea: { label: "Diarrhea", emoji: "💩" },
  constipation: { label: "Constipation", emoji: "🚼" },
  congestion: { label: "Congestion", emoji: "🤧" },
  swelling: { label: "Swelling", emoji: "⚠️" },
  other: { label: "Other", emoji: "❓" },
};

/** The seed checklist. Order is the introduction order guidance recommends. */
export const FOOD_CATALOG: FoodDef[] = [
  // Iron-rich first foods
  { id: "iron-cereal", name: "Iron cereal", emoji: "🥣", category: "first" },
  { id: "chicken", name: "Chicken", emoji: "🍗", category: "first" },
  { id: "beef", name: "Beef", emoji: "🥩", category: "first" },
  { id: "lentils", name: "Lentils", emoji: "🫘", category: "first" },
  { id: "beans", name: "Beans", emoji: "🌱", category: "first" },
  // Vegetables
  { id: "sweet-potato", name: "Sweet potato", emoji: "🍠", category: "veg" },
  { id: "carrot", name: "Carrot", emoji: "🥕", category: "veg" },
  { id: "peas", name: "Peas", emoji: "🫛", category: "veg" },
  { id: "squash", name: "Squash", emoji: "🎃", category: "veg" },
  { id: "avocado", name: "Avocado", emoji: "🥑", category: "veg" },
  { id: "broccoli", name: "Broccoli", emoji: "🥦", category: "veg" },
  { id: "spinach", name: "Spinach", emoji: "🥬", category: "veg" },
  { id: "green-beans", name: "Green beans", emoji: "🫛", category: "veg" },
  { id: "potato", name: "Potato", emoji: "🥔", category: "veg" },
  // Fruit
  { id: "banana", name: "Banana", emoji: "🍌", category: "fruit" },
  { id: "apple", name: "Apple", emoji: "🍎", category: "fruit" },
  { id: "pear", name: "Pear", emoji: "🍐", category: "fruit" },
  { id: "prune", name: "Prune", emoji: "🍇", category: "fruit" },
  { id: "peach", name: "Peach", emoji: "🍑", category: "fruit" },
  { id: "mango", name: "Mango", emoji: "🥭", category: "fruit" },
  { id: "blueberry", name: "Blueberry", emoji: "🫐", category: "fruit" },
  // Grains
  { id: "oats", name: "Oats", emoji: "🌾", category: "grain" },
  { id: "rice", name: "Rice", emoji: "🍚", category: "grain" },
  // Common allergens — the "Big 9"
  { id: "milk", name: "Milk / yogurt", emoji: "🥛", category: "allergen", allergen: true },
  { id: "egg", name: "Egg", emoji: "🥚", category: "allergen", allergen: true },
  { id: "peanut", name: "Peanut", emoji: "🥜", category: "allergen", allergen: true },
  { id: "tree-nuts", name: "Tree nuts", emoji: "🌰", category: "allergen", allergen: true },
  { id: "soy", name: "Soy", emoji: "🫘", category: "allergen", allergen: true },
  { id: "wheat", name: "Wheat", emoji: "🌾", category: "allergen", allergen: true },
  { id: "fish", name: "Fish", emoji: "🐟", category: "allergen", allergen: true },
  { id: "shellfish", name: "Shellfish", emoji: "🦐", category: "allergen", allergen: true },
  { id: "sesame", name: "Sesame", emoji: "🧆", category: "allergen", allergen: true },
];

const EMPTY: FoodsState = { statuses: {}, custom: [], removed: [] };

function storageKey(babyId: number): string {
  return `babytracker_foods_${babyId}`;
}

export async function loadFoods(babyId: number): Promise<FoodsState> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(babyId));
    if (!raw) return { statuses: {}, custom: [], removed: [] };
    const s = JSON.parse(raw);
    return {
      statuses: s.statuses && typeof s.statuses === "object" ? s.statuses : {},
      custom: Array.isArray(s.custom) ? s.custom : [],
      removed: Array.isArray(s.removed) ? s.removed : [],
    };
  } catch {
    return { statuses: {}, custom: [], removed: [] };
  }
}

export async function saveFoods(
  babyId: number,
  state: FoodsState
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(babyId), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Catalogue minus what the family removed, plus their own additions. */
export function effectiveFoods(state: FoodsState): FoodDef[] {
  const removed = new Set(state.removed);
  return [...FOOD_CATALOG.filter((f) => !removed.has(f.id)), ...state.custom];
}

export function emptyStatus(): FoodStatus {
  return { tried: false, triedDate: null, opinion: null, reactions: [] };
}

export { EMPTY as EMPTY_FOODS_STATE };
