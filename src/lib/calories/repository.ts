import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getAuthRepository } from "@/lib/auth/repository";
import type {
  AIEstimateItem,
  CalorieEntry,
  CalendarMonthDay,
  DailySettings,
  EntrySource,
  ExerciseEntry,
  MealCategory,
  Recipe,
  RecipeCreateInput,
} from "@/lib/calories/types";
import { getCalendarStatus, monthStartEnd, todayDateKey } from "@/lib/calories/utils";

type CreateEntryInput = {
  userId: string;
  foodName: string;
  calories: number;
  source: EntrySource;
  entryDate?: string;
  category?: MealCategory;
};

type UpdateEntryInput = {
  foodName: string;
  calories: number;
  category: MealCategory | null;
};

type RecipeAddToTodayInput = {
  userId: string;
  recipeId: string;
  servings: number;
  entryDate?: string;
  category?: MealCategory;
};

type CalorieRepository = {
  getDailyGoal: (userId: string) => Promise<number>;
  upsertDailyGoal: (userId: string, dailyGoal: number) => Promise<DailySettings>;
  getEntriesByDate: (userId: string, entryDate: string) => Promise<CalorieEntry[]>;
  getEntriesByDateRange: (userId: string, startDate: string, endDate: string) => Promise<CalorieEntry[]>;
  createEntry: (input: CreateEntryInput) => Promise<CalorieEntry>;
  createEntriesFromAI: (userId: string, items: AIEstimateItem[], entryDate?: string, category?: MealCategory) => Promise<CalorieEntry[]>;
  updateEntry: (userId: string, id: string, input: UpdateEntryInput) => Promise<CalorieEntry | null>;
  deleteEntry: (userId: string, id: string) => Promise<boolean>;
  getExerciseEntriesByDate: (userId: string, entryDate: string) => Promise<ExerciseEntry[]>;
  createExerciseEntry: (userId: string, description: string, caloriesBurned: number, entryDate?: string) => Promise<ExerciseEntry>;
  deleteExerciseEntry: (userId: string, id: string) => Promise<boolean>;
  getRecipes: (userId: string, search?: string) => Promise<Recipe[]>;
  createRecipe: (userId: string, input: RecipeCreateInput) => Promise<Recipe>;
  updateRecipe: (userId: string, recipeId: string, input: RecipeCreateInput) => Promise<Recipe | null>;
  deleteRecipe: (userId: string, recipeId: string) => Promise<boolean>;
  addRecipeToToday: (input: RecipeAddToTodayInput) => Promise<CalorieEntry | null>;
  getCalendarMonthDays: (userId: string, month: string) => Promise<CalendarMonthDay[]>;
  deleteUserData: (userId: string) => Promise<void>;
};

type MockState = {
  entries: CalorieEntry[];
  exercises: ExerciseEntry[];
  recipes: Recipe[];
};

declare global {
  var __calorieMockState: MockState | undefined;
  var __calorieEnsureTables: Promise<void> | undefined;
}

type DbLikeError = {
  message?: string;
  cause?: { code?: string; message?: string };
};

function toCalorieEntry(row: Record<string, unknown>): CalorieEntry {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    foodName: String(row.food_name),
    calories: Number(row.calories),
    source: row.source === "ai" ? "ai" : "manual",
    category: row.category && typeof row.category === "string" ? (row.category as MealCategory) : null,
    entryDate: String(row.entry_date),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function toRecipe(row: Record<string, unknown>): Recipe {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    totalCalories: Number(row.total_calories),
    servings: row.servings === null || row.servings === undefined ? null : Number(row.servings),
    caloriesPerServing: Number(row.calories_per_serving),
    ingredientsJson: row.ingredients_json === null || row.ingredients_json === undefined ? null : String(row.ingredients_json),
    notes: row.notes === null || row.notes === undefined ? null : String(row.notes),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function toExerciseEntry(row: Record<string, unknown>): ExerciseEntry {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    description: String(row.description),
    caloriesBurned: Number(row.calories_burned),
    entryDate: String(row.entry_date),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function getMockState(): MockState {
  if (!globalThis.__calorieMockState) {
    globalThis.__calorieMockState = {
      entries: [],
      exercises: [],
      recipes: [],
    };
  }

  return globalThis.__calorieMockState;
}

const authRepository = getAuthRepository();

function monthDateRange(month: string): string[] {
  const { startDate, endDate } = monthStartEnd(month);
  const dates: string[] = [];
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }

  return dates;
}

const mockRepository: CalorieRepository = {
  async getDailyGoal(userId) {
    return authRepository.getDailyGoal(userId);
  },

  async upsertDailyGoal(userId, dailyGoal) {
    const updated = await authRepository.updateDailyGoal(userId, dailyGoal);
    return {
      id: updated?.id ?? randomUUID(),
      userId,
      dailyCalorieGoal: updated?.dailyCalorieGoal ?? dailyGoal,
      createdAt: updated?.createdAt ?? new Date().toISOString(),
      updatedAt: updated?.updatedAt ?? new Date().toISOString(),
    };
  },

  async getEntriesByDate(userId, entryDate) {
    const state = getMockState();
    return state.entries
      .filter((entry) => entry.userId === userId && entry.entryDate === entryDate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getEntriesByDateRange(userId, startDate, endDate) {
    const state = getMockState();
    return state.entries
      .filter((entry) => entry.userId === userId && entry.entryDate >= startDate && entry.entryDate <= endDate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createEntry(input) {
    const state = getMockState();
    const created: CalorieEntry = {
      id: randomUUID(),
      userId: input.userId,
      foodName: input.foodName,
      calories: input.calories,
      source: input.source,
      category: input.category ?? null,
      entryDate: input.entryDate ?? todayDateKey(),
      createdAt: new Date().toISOString(),
    };

    state.entries.push(created);
    return created;
  },

  async createEntriesFromAI(userId, items, entryDate = todayDateKey(), category?: MealCategory) {
    const created: CalorieEntry[] = [];
    for (const item of items) {
      const entry = await this.createEntry({
        userId,
        foodName: item.foodName,
        calories: item.calories,
        source: "ai",
        entryDate,
        category,
      });
      created.push(entry);
    }

    return created;
  },

  async updateEntry(userId, id, input) {
    const state = getMockState();
    const idx = state.entries.findIndex((entry) => entry.userId === userId && entry.id === id);
    if (idx < 0) {
      return null;
    }

    const next: CalorieEntry = {
      ...state.entries[idx],
      foodName: input.foodName,
      calories: input.calories,
      category: input.category,
    };

    state.entries[idx] = next;
    return next;
  },

  async deleteEntry(userId, id) {
    const state = getMockState();
    const before = state.entries.length;
    state.entries = state.entries.filter((entry) => !(entry.userId === userId && entry.id === id));
    return state.entries.length < before;
  },

  async getExerciseEntriesByDate(userId, entryDate) {
    const state = getMockState();
    return state.exercises
      .filter((entry) => entry.userId === userId && entry.entryDate === entryDate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createExerciseEntry(userId, description, caloriesBurned, entryDate = todayDateKey()) {
    const state = getMockState();
    const created: ExerciseEntry = {
      id: randomUUID(),
      userId,
      description,
      caloriesBurned,
      entryDate,
      createdAt: new Date().toISOString(),
    };

    state.exercises.push(created);
    return created;
  },

  async deleteExerciseEntry(userId, id) {
    const state = getMockState();
    const before = state.exercises.length;
    state.exercises = state.exercises.filter((entry) => !(entry.userId === userId && entry.id === id));
    return state.exercises.length < before;
  },

  async getRecipes(userId, search) {
    const state = getMockState();
    const needle = search?.trim().toLowerCase() ?? "";
    const base = state.recipes.filter((recipe) => recipe.userId === userId);
    const filtered = needle.length > 0 ? base.filter((recipe) => recipe.name.toLowerCase().includes(needle)) : base;
    return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async createRecipe(userId, input) {
    const state = getMockState();
    const now = new Date().toISOString();
    const recipe: Recipe = {
      id: randomUUID(),
      userId,
      name: input.name,
      totalCalories: input.totalCalories,
      servings: input.servings,
      caloriesPerServing: input.caloriesPerServing,
      ingredientsJson: input.ingredientsJson,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };

    state.recipes.push(recipe);
    return recipe;
  },

  async updateRecipe(userId, recipeId, input) {
    const state = getMockState();
    const idx = state.recipes.findIndex((recipe) => recipe.userId === userId && recipe.id === recipeId);
    if (idx < 0) {
      return null;
    }

    const prev = state.recipes[idx];
    const next: Recipe = {
      ...prev,
      name: input.name,
      totalCalories: input.totalCalories,
      servings: input.servings,
      caloriesPerServing: input.caloriesPerServing,
      ingredientsJson: input.ingredientsJson,
      notes: input.notes,
      updatedAt: new Date().toISOString(),
    };

    state.recipes[idx] = next;
    return next;
  },

  async deleteRecipe(userId, recipeId) {
    const state = getMockState();
    const before = state.recipes.length;
    state.recipes = state.recipes.filter((recipe) => !(recipe.userId === userId && recipe.id === recipeId));
    return state.recipes.length < before;
  },

  async addRecipeToToday(input) {
    const state = getMockState();
    const recipe = state.recipes.find((item) => item.userId === input.userId && item.id === input.recipeId);
    if (!recipe) {
      return null;
    }

    const servings = Math.max(1, input.servings);
    return this.createEntry({
      userId: input.userId,
      foodName: recipe.name,
      calories: recipe.caloriesPerServing * servings,
      source: "manual",
      entryDate: input.entryDate,
      category: input.category,
    });
  },

  async getCalendarMonthDays(userId, month) {
    const goal = await this.getDailyGoal(userId);
    const dates = monthDateRange(month);
    const entries = await this.getEntriesByDateRange(userId, dates[0], dates[dates.length - 1]);
    const consumedByDate = new Map<string, number>();

    for (const entry of entries) {
      consumedByDate.set(entry.entryDate, (consumedByDate.get(entry.entryDate) ?? 0) + entry.calories);
    }

    return dates.map((date) => {
      const consumed = consumedByDate.get(date) ?? 0;
      const hasData = consumedByDate.has(date);
      return {
        date,
        consumed,
        goal,
        hasData,
        status: getCalendarStatus(consumed, goal, hasData),
      };
    });
  },

  async deleteUserData(userId) {
    const state = getMockState();
    state.entries = state.entries.filter((entry) => entry.userId !== userId);
    state.exercises = state.exercises.filter((entry) => entry.userId !== userId);
    state.recipes = state.recipes.filter((recipe) => recipe.userId !== userId);
  },
};

function getSqlClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  return neon(databaseUrl);
}

function resetCalorieSchemaCache() {
  globalThis.__calorieEnsureTables = undefined;
}

function isConnectionError(error: unknown): boolean {
  const dbError = error as DbLikeError;
  const message = (dbError.message ?? "").toLowerCase();
  const causeCode = dbError.cause?.code;
  const causeMessage = (dbError.cause?.message ?? "").toLowerCase();

  return (
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    message.includes("fetch failed") ||
    message.includes("connect timeout") ||
    causeMessage.includes("connect timeout")
  );
}

function isMissingCategoryColumnError(error: unknown): boolean {
  const dbError = error as DbLikeError;
  const message = (dbError.message ?? "").toLowerCase();
  const causeMessage = (dbError.cause?.message ?? "").toLowerCase();

  return (
    message.includes("column \"category\" does not exist") ||
    message.includes("column category does not exist") ||
    causeMessage.includes("column \"category\" does not exist") ||
    causeMessage.includes("column category does not exist")
  );
}

function isMissingTableError(error: unknown): boolean {
  const dbError = error as DbLikeError;
  const message = (dbError.message ?? "").toLowerCase();
  const causeMessage = (dbError.cause?.message ?? "").toLowerCase();

  return (
    message.includes("relation") && message.includes("does not exist") ||
    causeMessage.includes("relation") && causeMessage.includes("does not exist")
  );
}

async function withConnectionFallback<T>(operation: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isConnectionError(error)) {
      resetCalorieSchemaCache();
      return fallback();
    }

    if (isMissingCategoryColumnError(error) || isMissingTableError(error)) {
      resetCalorieSchemaCache();
      await ensureNeonTables();
      return operation();
    }

    throw error;
  }
}

async function ensureNeonTables() {
  const sql = getSqlClient();
  if (!sql) {
    return;
  }

  if (!globalThis.__calorieEnsureTables) {
    globalThis.__calorieEnsureTables = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS user_calorie_settings (
          id TEXT PRIMARY KEY,
          user_id TEXT UNIQUE NOT NULL,
          daily_calorie_goal INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS calorie_entries (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          food_name TEXT NOT NULL,
          calories INTEGER NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('manual', 'ai')),
          entry_date DATE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS recipes (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          total_calories INTEGER NOT NULL,
          servings INTEGER NULL,
          calories_per_serving INTEGER NOT NULL,
          ingredients_json TEXT NULL,
          notes TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS exercise_entries (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          description TEXT NOT NULL,
          calories_burned INTEGER NOT NULL,
          entry_date DATE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS idx_calorie_entries_user_date ON calorie_entries (user_id, entry_date)`;
      await sql`ALTER TABLE calorie_entries ADD COLUMN IF NOT EXISTS category TEXT NULL`;
      await sql`CREATE INDEX IF NOT EXISTS idx_recipes_user_updated ON recipes (user_id, updated_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_exercise_entries_user_date ON exercise_entries (user_id, entry_date)`;
    })();
  }

  await globalThis.__calorieEnsureTables;
}

const neonRepository: CalorieRepository = {
  async getDailyGoal(userId) {
    return authRepository.getDailyGoal(userId);
  },

  async upsertDailyGoal(userId, dailyGoal) {
    const updated = await authRepository.updateDailyGoal(userId, dailyGoal);
    return {
      id: updated?.id ?? randomUUID(),
      userId,
      dailyCalorieGoal: updated?.dailyCalorieGoal ?? dailyGoal,
      createdAt: updated?.createdAt ?? new Date().toISOString(),
      updatedAt: updated?.updatedAt ?? new Date().toISOString(),
    };
  },

  async getEntriesByDate(userId, entryDate) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.getEntriesByDate(userId, entryDate);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const rows = await sql`
        SELECT id, user_id, food_name, calories, source, entry_date, category, created_at
        FROM calorie_entries
        WHERE user_id = ${userId} AND entry_date = ${entryDate}
        ORDER BY created_at DESC
      `;

      return rows.map((row) => toCalorieEntry(row as Record<string, unknown>));
    }, () => mockRepository.getEntriesByDate(userId, entryDate));
  },

  async getEntriesByDateRange(userId, startDate, endDate) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.getEntriesByDateRange(userId, startDate, endDate);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const rows = await sql`
        SELECT id, user_id, food_name, calories, source, entry_date, category, created_at
        FROM calorie_entries
        WHERE user_id = ${userId} AND entry_date >= ${startDate} AND entry_date <= ${endDate}
        ORDER BY created_at DESC
      `;

      return rows.map((row) => toCalorieEntry(row as Record<string, unknown>));
    }, () => mockRepository.getEntriesByDateRange(userId, startDate, endDate));
  },

  async createEntry(input) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.createEntry(input);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const id = randomUUID();
      const entryDate = input.entryDate ?? todayDateKey();
      const category = input.category ?? null;
      const rows = await sql`
        INSERT INTO calorie_entries (id, user_id, food_name, calories, source, entry_date, category)
        VALUES (${id}, ${input.userId}, ${input.foodName}, ${input.calories}, ${input.source}, ${entryDate}, ${category})
        RETURNING id, user_id, food_name, calories, source, entry_date, category, created_at
      `;

      return toCalorieEntry(rows[0] as Record<string, unknown>);
    }, () => mockRepository.createEntry(input));
  },

  async createEntriesFromAI(userId, items, entryDate = todayDateKey(), category?: MealCategory) {
    return withConnectionFallback(async () => {
      const created: CalorieEntry[] = [];

      for (const item of items) {
        const entry = await this.createEntry({
          userId,
          foodName: item.foodName,
          calories: item.calories,
          source: "ai",
          entryDate,
          category,
        });
        created.push(entry);
      }

      return created;
    }, () => mockRepository.createEntriesFromAI(userId, items, entryDate, category));
  },

  async updateEntry(userId, id, input) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.updateEntry(userId, id, input);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const rows = await sql`
        UPDATE calorie_entries
        SET
          food_name = ${input.foodName},
          calories = ${input.calories},
          category = ${input.category}
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, user_id, food_name, calories, source, entry_date, category, created_at
      `;

      if (rows.length === 0) {
        return null;
      }

      return toCalorieEntry(rows[0] as Record<string, unknown>);
    }, () => mockRepository.updateEntry(userId, id, input));
  },

  async deleteEntry(userId, id) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.deleteEntry(userId, id);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const rows = await sql`
        DELETE FROM calorie_entries
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id
      `;

      return rows.length > 0;
    }, () => mockRepository.deleteEntry(userId, id));
  },

  async getExerciseEntriesByDate(userId, entryDate) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.getExerciseEntriesByDate(userId, entryDate);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const rows = await sql`
        SELECT id, user_id, description, calories_burned, entry_date, created_at
        FROM exercise_entries
        WHERE user_id = ${userId} AND entry_date = ${entryDate}
        ORDER BY created_at DESC
      `;

      return rows.map((row) => toExerciseEntry(row as Record<string, unknown>));
    }, () => mockRepository.getExerciseEntriesByDate(userId, entryDate));
  },

  async createExerciseEntry(userId, description, caloriesBurned, entryDate = todayDateKey()) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.createExerciseEntry(userId, description, caloriesBurned, entryDate);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const id = randomUUID();
      const rows = await sql`
        INSERT INTO exercise_entries (id, user_id, description, calories_burned, entry_date, created_at)
        VALUES (${id}, ${userId}, ${description}, ${caloriesBurned}, ${entryDate}, NOW())
        RETURNING id, user_id, description, calories_burned, entry_date, created_at
      `;

      if (rows.length === 0) {
        throw new Error("Failed to create exercise entry");
      }

      return toExerciseEntry(rows[0] as Record<string, unknown>);
    }, () => mockRepository.createExerciseEntry(userId, description, caloriesBurned, entryDate));
  },

  async deleteExerciseEntry(userId, id) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.deleteExerciseEntry(userId, id);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const rows = await sql`
        DELETE FROM exercise_entries
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id
      `;

      return rows.length > 0;
    }, () => mockRepository.deleteExerciseEntry(userId, id));
  },

  async getRecipes(userId, search) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.getRecipes(userId, search);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const needle = `%${(search ?? "").trim()}%`;
      const rows = await sql`
        SELECT id, user_id, name, total_calories, servings, calories_per_serving, ingredients_json, notes, created_at, updated_at
        FROM recipes
        WHERE user_id = ${userId} AND (${(search ?? "").trim()} = '' OR name ILIKE ${needle})
        ORDER BY updated_at DESC
      `;

      return rows.map((row) => toRecipe(row as Record<string, unknown>));
    }, () => mockRepository.getRecipes(userId, search));
  },

  async createRecipe(userId, input) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.createRecipe(userId, input);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const id = randomUUID();
      const now = new Date().toISOString();
      const rows = await sql`
        INSERT INTO recipes (
          id,
          user_id,
          name,
          total_calories,
          servings,
          calories_per_serving,
          ingredients_json,
          notes,
          created_at,
          updated_at
        )
        VALUES (
          ${id},
          ${userId},
          ${input.name},
          ${input.totalCalories},
          ${input.servings},
          ${input.caloriesPerServing},
          ${input.ingredientsJson},
          ${input.notes},
          ${now},
          ${now}
        )
        RETURNING id, user_id, name, total_calories, servings, calories_per_serving, ingredients_json, notes, created_at, updated_at
      `;

      return toRecipe(rows[0] as Record<string, unknown>);
    }, () => mockRepository.createRecipe(userId, input));
  },

  async updateRecipe(userId, recipeId, input) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.updateRecipe(userId, recipeId, input);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const now = new Date().toISOString();
      const rows = await sql`
        UPDATE recipes
        SET
          name = ${input.name},
          total_calories = ${input.totalCalories},
          servings = ${input.servings},
          calories_per_serving = ${input.caloriesPerServing},
          ingredients_json = ${input.ingredientsJson},
          notes = ${input.notes},
          updated_at = ${now}
        WHERE id = ${recipeId} AND user_id = ${userId}
        RETURNING id, user_id, name, total_calories, servings, calories_per_serving, ingredients_json, notes, created_at, updated_at
      `;

      if (rows.length === 0) {
        return null;
      }

      return toRecipe(rows[0] as Record<string, unknown>);
    }, () => mockRepository.updateRecipe(userId, recipeId, input));
  },

  async deleteRecipe(userId, recipeId) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.deleteRecipe(userId, recipeId);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const rows = await sql`
        DELETE FROM recipes
        WHERE id = ${recipeId} AND user_id = ${userId}
        RETURNING id
      `;

      return rows.length > 0;
    }, () => mockRepository.deleteRecipe(userId, recipeId));
  },

  async addRecipeToToday(input) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.addRecipeToToday(input);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      const rows = await sql`
        SELECT id, name, calories_per_serving
        FROM recipes
        WHERE id = ${input.recipeId} AND user_id = ${input.userId}
        LIMIT 1
      `;

      if (rows.length === 0) {
        return null;
      }

      const recipe = rows[0] as Record<string, unknown>;
      const servings = Math.max(1, input.servings);
      const calories = Number(recipe.calories_per_serving) * servings;
      return this.createEntry({
        userId: input.userId,
        foodName: String(recipe.name),
        calories,
        source: "manual",
        entryDate: input.entryDate,
        category: input.category,
      });
    }, () => mockRepository.addRecipeToToday(input));
  },

  async getCalendarMonthDays(userId, month) {
    const goal = await this.getDailyGoal(userId);
    const dates = monthDateRange(month);
    const entries = await this.getEntriesByDateRange(userId, dates[0], dates[dates.length - 1]);
    const consumedByDate = new Map<string, number>();

    for (const entry of entries) {
      consumedByDate.set(entry.entryDate, (consumedByDate.get(entry.entryDate) ?? 0) + entry.calories);
    }

    return dates.map((date) => {
      const consumed = consumedByDate.get(date) ?? 0;
      const hasData = consumedByDate.has(date);
      return {
        date,
        consumed,
        goal,
        hasData,
        status: getCalendarStatus(consumed, goal, hasData),
      };
    });
  },

  async deleteUserData(userId) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.deleteUserData(userId);
    }

    return withConnectionFallback(async () => {
      await ensureNeonTables();
      await sql`
        DELETE FROM calorie_entries
        WHERE user_id = ${userId}
      `;
      await sql`
        DELETE FROM exercise_entries
        WHERE user_id = ${userId}
      `;
      await sql`
        DELETE FROM recipes
        WHERE user_id = ${userId}
      `;
      await sql`
        DELETE FROM user_calorie_settings
        WHERE user_id = ${userId}
      `;
    }, () => mockRepository.deleteUserData(userId));
  },
};

export function getCalorieRepository(): CalorieRepository {
  return process.env.DATABASE_URL ? neonRepository : mockRepository;
}
