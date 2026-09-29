import type { FoodCategory, FoodLog, FoodReaction } from "../api/foods";

/**
 * The starting-solids vocabulary the meal picker suggests before a family
 * has a catalogue of its own. Nothing here is stored until it's actually
 * logged — the server list is only what the baby has really been offered.
 *
 * Order follows introduction guidance: iron-rich foods first, then vegetables,
 * fruit and grains, with the "Big 9" allergens flagged so they're offered one
 * at a time and watched. The flag is a nudge, not a verdict — an allergen
 * entry only becomes *this baby's* allergen once a reaction is logged.
 */
export interface FoodSuggestion {
  name: string;
  emoji: string;
  category: FoodCategory;
  /** One of the common allergens — offer it alone, earlier in the day. */
  allergen?: boolean;
}

export const FOOD_SUGGESTIONS: FoodSuggestion[] = [
  // Iron-rich first foods
  { name: "Iron cereal", emoji: "🥣", category: "grain" },
  { name: "Chicken", emoji: "🍗", category: "protein" },
  { name: "Beef", emoji: "🥩", category: "protein" },
  { name: "Lentils", emoji: "🫘", category: "protein" },
  { name: "Beans", emoji: "🌱", category: "protein" },
  // Vegetables
  { name: "Sweet potato", emoji: "🍠", category: "veg" },
  { name: "Carrot", emoji: "🥕", category: "veg" },
  { name: "Potato", emoji: "🥔", category: "veg" },
  { name: "Peas", emoji: "🫛", category: "veg" },
  { name: "Squash", emoji: "🎃", category: "veg" },
  { name: "Zucchini", emoji: "🥒", category: "veg" },
  { name: "Avocado", emoji: "🥑", category: "veg" },
  { name: "Broccoli", emoji: "🥦", category: "veg" },
  { name: "Spinach", emoji: "🥬", category: "veg" },
  { name: "Green beans", emoji: "🫛", category: "veg" },
  // Fruit
  { name: "Banana", emoji: "🍌", category: "fruit" },
  { name: "Apple", emoji: "🍎", category: "fruit" },
  { name: "Pear", emoji: "🍐", category: "fruit" },
  { name: "Peach", emoji: "🍑", category: "fruit" },
  { name: "Mango", emoji: "🥭", category: "fruit" },
  { name: "Blueberry", emoji: "🫐", category: "fruit" },
  { name: "Strawberry", emoji: "🍓", category: "fruit" },
  { name: "Watermelon", emoji: "🍉", category: "fruit" },
  { name: "Prune", emoji: "🍇", category: "fruit" },
  // Grains
  { name: "Oats", emoji: "🌾", category: "grain" },
  { name: "Rice", emoji: "🍚", category: "grain" },
  { name: "Pasta", emoji: "🍝", category: "grain" },
  // Common allergens — the "Big 9"
  { name: "Egg", emoji: "🥚", category: "allergen", allergen: true },
  { name: "Yogurt", emoji: "🥛", category: "dairy", allergen: true },
  { name: "Cheese", emoji: "🧀", category: "dairy", allergen: true },
  { name: "Peanut", emoji: "🥜", category: "allergen", allergen: true },
  { name: "Tree nuts", emoji: "🌰", category: "allergen", allergen: true },
  { name: "Wheat", emoji: "🍞", category: "allergen", allergen: true },
  { name: "Soy", emoji: "🫘", category: "allergen", allergen: true },
  { name: "Fish", emoji: "🐟", category: "allergen", allergen: true },
  { name: "Shellfish", emoji: "🦐", category: "allergen", allergen: true },
  { name: "Sesame", emoji: "🧆", category: "allergen", allergen: true },
];

export const CATEGORY_LABEL: Record<FoodCategory, string> = {
  veg: "Vegetables",
  fruit: "Fruit",
  grain: "Grains",
  protein: "Protein",
  dairy: "Dairy",
  allergen: "Common allergens",
  other: "Other",
};

export const REACTION_ORDER: FoodReaction[] = [
  "none",
  "gas",
  "rash",
  "hives",
  "vomiting",
  "diarrhea",
  "swelling",
  "other",
];

export const REACTION_META: Record<FoodReaction, { label: string; emoji: string }> = {
  none: { label: "Fine", emoji: "✅" },
  gas: { label: "Gas / fussy", emoji: "💨" },
  rash: { label: "Rash", emoji: "🔴" },
  hives: { label: "Hives", emoji: "🟥" },
  vomiting: { label: "Vomiting", emoji: "🤮" },
  diarrhea: { label: "Diarrhea", emoji: "💩" },
  swelling: { label: "Swelling", emoji: "⚠️" },
  other: { label: "Other", emoji: "❓" },
};

/** Mirrors the server's ALLERGY_REACTIONS — the ones that mark the food. */
export const ALLERGY_REACTIONS: ReadonlySet<FoodReaction> = new Set([
  "rash",
  "hives",
  "vomiting",
  "swelling",
]);

export function isReaction(r: FoodReaction | null | undefined): boolean {
  return !!r && r !== "none";
}

/** "★★★★☆" for 4 — a glanceable rating for list rows. */
export function starString(rating: number | null | undefined): string {
  if (rating == null) return "";
  const n = Math.round(rating);
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
}

/** The emoji the picker/list shows for a food, falling back by name. */
export function foodEmoji(name: string, emoji?: string | null): string {
  if (emoji) return emoji;
  const hit = FOOD_SUGGESTIONS.find(
    (s) => s.name.toLowerCase() === name.trim().toLowerCase()
  );
  return hit?.emoji ?? "🍽️";
}

export interface Meal {
  mealKey: string;
  eatenAt: string;
  logs: FoodLog[];
  /** True if any serving in the meal recorded a reaction. */
  reacted: boolean;
}

/** Reassemble servings into meals, newest first, keeping each meal's order. */
export function groupMeals(logs: FoodLog[]): Meal[] {
  const map = new Map<string, Meal>();
  for (const log of logs) {
    const meal = map.get(log.mealKey) ?? {
      mealKey: log.mealKey,
      eatenAt: log.eatenAt,
      logs: [],
      reacted: false,
    };
    meal.logs.push(log);
    if (isReaction(log.reaction)) meal.reacted = true;
    // Earliest serving stamps the meal, in case edits nudged one row.
    if (new Date(log.eatenAt) < new Date(meal.eatenAt)) meal.eatenAt = log.eatenAt;
    map.set(log.mealKey, meal);
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime()
  );
}

/** "Carrot + Potato" */
export function mealTitle(meal: Meal): string {
  return meal.logs.map((l) => l.foodItem.name).join(" + ");
}

/** Local midnight today and tomorrow — the window "today" means on a phone. */
export function todayRange(): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}
