import { getCalorieRepository } from "@/lib/calories/repository";
import type {
  AIEstimateItem,
  CalorieEntry,
  CalendarDayPayload,
  CalendarMonthPayload,
  MealCategory,
  Recipe,
  RecipeCreateInput,
  TodayPayload,
} from "@/lib/calories/types";
import {
  dateKeyForTimeZone,
  getCalendarStatus,
  monthStartEnd,
  sanitizeTimeZone,
  todayDateKey,
} from "@/lib/calories/utils";

const repository = getCalorieRepository();

export async function getTodayPayload(userId: string, timeZone?: string): Promise<TodayPayload> {
  const entryDate = timeZone ? dateKeyForTimeZone(sanitizeTimeZone(timeZone)) : todayDateKey();
  const [dailyGoal, entries] = await Promise.all([
    repository.getDailyGoal(userId),
    repository.getEntriesByDate(userId, entryDate),
  ]);

  const consumed = entries.reduce((sum, entry) => sum + entry.calories, 0);

  return {
    dailyGoal,
    consumed,
    remaining: dailyGoal - consumed,
    entries,
  };
}

export async function updateDailyGoal(userId: string, dailyGoal: number) {
  return repository.upsertDailyGoal(userId, dailyGoal);
}

export async function addManualEntry(
  userId: string,
  foodName: string,
  calories: number,
  timeZone?: string,
  category?: MealCategory,
): Promise<CalorieEntry> {
  const entryDate = timeZone ? dateKeyForTimeZone(sanitizeTimeZone(timeZone)) : undefined;
  return repository.createEntry({ userId, foodName, calories, source: "manual", entryDate, category });
}

export async function confirmAIEntries(userId: string, items: AIEstimateItem[], timeZone?: string, category?: MealCategory) {
  const entryDate = timeZone ? dateKeyForTimeZone(sanitizeTimeZone(timeZone)) : undefined;
  return repository.createEntriesFromAI(userId, items, entryDate, category);
}

export async function removeEntry(userId: string, entryId: string) {
  return repository.deleteEntry(userId, entryId);
}

export async function getRecipes(userId: string, search?: string): Promise<Recipe[]> {
  return repository.getRecipes(userId, search);
}

export async function createRecipe(userId: string, input: RecipeCreateInput): Promise<Recipe> {
  return repository.createRecipe(userId, input);
}

export async function editRecipe(userId: string, recipeId: string, input: RecipeCreateInput): Promise<Recipe | null> {
  return repository.updateRecipe(userId, recipeId, input);
}

export async function removeRecipe(userId: string, recipeId: string): Promise<boolean> {
  return repository.deleteRecipe(userId, recipeId);
}

export async function addRecipeEntry(
  userId: string,
  recipeId: string,
  servings: number,
  timeZone?: string,
): Promise<CalorieEntry | null> {
  const entryDate = timeZone ? dateKeyForTimeZone(sanitizeTimeZone(timeZone)) : undefined;
  return repository.addRecipeToToday({ userId, recipeId, servings, entryDate });
}

export async function getCalendarMonthPayload(userId: string, month: string): Promise<CalendarMonthPayload> {
  const days = await repository.getCalendarMonthDays(userId, month);
  return {
    month,
    days,
  };
}

export async function getCalendarDayPayload(userId: string, date: string): Promise<CalendarDayPayload> {
  const [dailyGoal, entries] = await Promise.all([
    repository.getDailyGoal(userId),
    repository.getEntriesByDate(userId, date),
  ]);

  const consumed = entries.reduce((sum, entry) => sum + entry.calories, 0);
  return {
    date,
    dailyGoal,
    consumed,
    remaining: dailyGoal - consumed,
    status: getCalendarStatus(consumed, dailyGoal, entries.length > 0),
    entries,
  };
}

export async function getMonthForTimeZone(timeZone?: string): Promise<string> {
  const date = timeZone ? new Date(dateKeyForTimeZone(sanitizeTimeZone(timeZone))) : new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getMonthDateRange(month: string) {
  return monthStartEnd(month);
}

export async function deleteUserCalorieData(userId: string) {
  return repository.deleteUserData(userId);
}
