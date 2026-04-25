export type EntrySource = "manual" | "ai";

export type CalorieEntry = {
  id: string;
  userId: string;
  foodName: string;
  calories: number;
  source: EntrySource;
  entryDate: string;
  createdAt: string;
};

export type DailySettings = {
  id: string;
  userId: string;
  dailyCalorieGoal: number;
  createdAt: string;
  updatedAt: string;
};

export type TodayPayload = {
  dailyGoal: number;
  consumed: number;
  remaining: number;
  entries: CalorieEntry[];
};

export type AIEstimateItem = {
  foodName: string;
  calories: number;
};

export type Recipe = {
  id: string;
  userId: string;
  name: string;
  totalCalories: number;
  servings: number | null;
  caloriesPerServing: number;
  ingredientsJson: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecipeIngredient = {
  name: string;
  calories: number;
};

export type RecipeAIEstimate = {
  recipeName: string;
  ingredients: RecipeIngredient[];
  totalCalories: number;
  servings: number;
  caloriesPerServing: number;
};

export type RecipeCreateInput = {
  name: string;
  totalCalories: number;
  servings: number | null;
  caloriesPerServing: number;
  ingredientsJson: string | null;
  notes: string | null;
};

export type CalendarStatus = "under" | "near" | "over" | "none";

export type CalendarMonthDay = {
  date: string;
  consumed: number;
  goal: number;
  status: CalendarStatus;
  hasData: boolean;
};

export type CalendarMonthPayload = {
  month: string;
  days: CalendarMonthDay[];
};

export type CalendarDayPayload = {
  date: string;
  dailyGoal: number;
  consumed: number;
  remaining: number;
  status: CalendarStatus;
  entries: CalorieEntry[];
};
