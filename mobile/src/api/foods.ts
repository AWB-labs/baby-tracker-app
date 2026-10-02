import apiClient from "./client";

/** Mirrors api/src/routes/foods.ts. */
export type FoodReaction =
  | "none"
  | "gas"
  | "rash"
  | "hives"
  | "vomiting"
  | "diarrhea"
  | "swelling"
  | "other";

export type FoodCategory =
  | "veg"
  | "fruit"
  | "grain"
  | "protein"
  | "dairy"
  | "allergen"
  | "other";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface FoodItem {
  id: number;
  babyId: number;
  name: string;
  emoji: string | null;
  category: FoodCategory | null;
  allergen: boolean;
  createdAt: string;
  // Derived by the server from the serving history.
  timesTried: number;
  firstEatenAt: string | null;
  lastEatenAt: string | null;
  avgRating: number | null;
  lastReaction: FoodReaction | null;
  reactionCount: number;
}

export interface FoodLog {
  id: number;
  babyId: number;
  foodItemId: number;
  /** Servings eaten together share one key — that's a meal. */
  mealKey: string;
  /** Chosen when logging; null on meals logged before that existed. */
  mealType?: MealType | null;
  /** A family's own name for the meal, shown instead of its type. */
  mealName?: string | null;
  eatenAt: string;
  rating: number | null;
  reaction: FoodReaction | null;
  reactionNote: string | null;
  notes: string | null;
  enteredByName: string;
  createdAt: string;
  foodItem: { id: number; name: string; emoji: string | null; allergen: boolean };
}

export async function getFoods(babyId: number): Promise<FoodItem[]> {
  const res = await apiClient.get<FoodItem[]>("/foods", { params: { babyId } });
  return res.data;
}

export async function getFoodLogs(
  babyId: number,
  range?: { from?: Date; to?: Date }
): Promise<FoodLog[]> {
  const res = await apiClient.get<FoodLog[]>("/foods/logs", {
    params: {
      babyId,
      ...(range?.from ? { from: range.from.toISOString() } : {}),
      ...(range?.to ? { to: range.to.toISOString() } : {}),
    },
  });
  return res.data;
}

export interface MealItemInput {
  foodItemId?: number;
  name?: string;
  emoji?: string | null;
  category?: FoodCategory | null;
  rating?: number | null;
  reaction?: FoodReaction | null;
  reactionNote?: string | null;
}

export async function createMeal(data: {
  babyId: number;
  eatenAt: Date;
  mealType?: MealType | null;
  mealName?: string | null;
  notes?: string | null;
  enteredByName: string;
  items: MealItemInput[];
}): Promise<FoodLog[]> {
  const res = await apiClient.post<FoodLog[]>("/foods/logs", {
    ...data,
    eatenAt: data.eatenAt.toISOString(),
  });
  return res.data;
}

/** Rewrite a logged meal — its name, time, foods and how each went. */
export async function replaceMeal(
  mealKey: string,
  data: Parameters<typeof createMeal>[0]
): Promise<FoodLog[]> {
  const res = await apiClient.put<FoodLog[]>(`/foods/logs/meal/${mealKey}`, {
    ...data,
    eatenAt: data.eatenAt.toISOString(),
  });
  return res.data;
}

export async function updateFoodLog(
  id: number,
  data: {
    eatenAt?: Date;
    rating?: number | null;
    reaction?: FoodReaction | null;
    reactionNote?: string | null;
    notes?: string | null;
  }
): Promise<FoodLog> {
  const res = await apiClient.patch<FoodLog>(`/foods/logs/${id}`, {
    ...data,
    ...(data.eatenAt ? { eatenAt: data.eatenAt.toISOString() } : {}),
  });
  return res.data;
}

export async function deleteFoodLog(id: number): Promise<void> {
  await apiClient.delete(`/foods/logs/${id}`);
}

export async function createFood(data: {
  babyId: number;
  name: string;
  emoji?: string | null;
  category?: FoodCategory | null;
}): Promise<FoodItem> {
  const res = await apiClient.post<FoodItem>("/foods", data);
  return res.data;
}

export async function updateFood(
  id: number,
  data: {
    name?: string;
    emoji?: string | null;
    category?: FoodCategory | null;
    allergen?: boolean;
  }
): Promise<FoodItem> {
  const res = await apiClient.patch<FoodItem>(`/foods/${id}`, data);
  return res.data;
}

export async function deleteFood(id: number): Promise<void> {
  await apiClient.delete(`/foods/${id}`);
}

/* ------------------------------------------- saved and want-to-try meals */

export interface SavedMealFood {
  name: string;
  emoji: string | null;
}

export interface SavedMeal {
  id: number;
  babyId: number;
  name: string;
  mealType: MealType | null;
  foods: SavedMealFood[];
  /** Planned but not tried yet. Rating it marks it tried. */
  wantToTry: boolean;
  rating: number | null;
  createdAt: string;
}

export async function getSavedMeals(babyId: number): Promise<SavedMeal[]> {
  const res = await apiClient.get<SavedMeal[]>("/foods/meals", { params: { babyId } });
  return res.data;
}

export async function createSavedMeal(data: {
  babyId: number;
  name: string;
  mealType?: MealType | null;
  foods: SavedMealFood[];
  wantToTry?: boolean;
  rating?: number | null;
}): Promise<SavedMeal> {
  const res = await apiClient.post<SavedMeal>("/foods/meals", data);
  return res.data;
}

export async function updateSavedMeal(
  id: number,
  data: {
    name?: string;
    mealType?: MealType | null;
    foods?: SavedMealFood[];
    wantToTry?: boolean;
    rating?: number | null;
  }
): Promise<SavedMeal> {
  const res = await apiClient.patch<SavedMeal>(`/foods/meals/${id}`, data);
  return res.data;
}

export async function deleteSavedMeal(id: number): Promise<void> {
  await apiClient.delete(`/foods/meals/${id}`);
}
