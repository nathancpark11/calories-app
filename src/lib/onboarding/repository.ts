import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { OnboardingProfile } from "@/lib/onboarding/types";

type UpsertProfileInput = {
  userId: string;
  age: number;
  sex: OnboardingProfile["sex"];
  heightInches: number;
  weightLbs: number;
  activityLevel: OnboardingProfile["activityLevel"];
  goalType: OnboardingProfile["goalType"];
  goalPace: OnboardingProfile["goalPace"];
  estimatedBmr: number;
  estimatedTdee: number;
  recommendedDailyCalories: number;
};

type OnboardingRepository = {
  getByUserId: (userId: string) => Promise<OnboardingProfile | null>;
  upsertProfile: (input: UpsertProfileInput) => Promise<OnboardingProfile>;
  deleteByUserId: (userId: string) => Promise<void>;
};

type MockState = {
  profilesByUserId: Map<string, OnboardingProfile>;
};

declare global {
  var __onboardingMockState: MockState | undefined;
  var __onboardingEnsureTables: Promise<void> | undefined;
}

type DbLikeError = {
  message?: string;
  cause?: { code?: string; message?: string };
};

function toOnboardingProfile(row: Record<string, unknown>): OnboardingProfile {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    age: Number(row.age),
    sex: row.sex === "male" ? "male" : "female",
    heightInches: Number(row.height_inches),
    weightLbs: Number(row.weight_lbs),
    activityLevel:
      row.activity_level === "light" || row.activity_level === "moderate" || row.activity_level === "very"
        ? row.activity_level
        : "sedentary",
    goalType: row.goal_type === "lose" || row.goal_type === "gain" ? row.goal_type : "maintain",
    goalPace:
      row.goal_pace === "slow" || row.goal_pace === "moderate" || row.goal_pace === "aggressive"
        ? row.goal_pace
        : "moderate",
    estimatedBmr: Number(row.estimated_bmr),
    estimatedTdee: Number(row.estimated_tdee),
    recommendedDailyCalories: Number(row.recommended_daily_calories),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function getMockState(): MockState {
  if (!globalThis.__onboardingMockState) {
    globalThis.__onboardingMockState = {
      profilesByUserId: new Map<string, OnboardingProfile>(),
    };
  }

  return globalThis.__onboardingMockState;
}

const mockRepository: OnboardingRepository = {
  async getByUserId(userId) {
    return getMockState().profilesByUserId.get(userId) ?? null;
  },

  async upsertProfile(input) {
    const state = getMockState();
    const now = new Date().toISOString();
    const existing = state.profilesByUserId.get(input.userId);
    const profile: OnboardingProfile = {
      id: existing?.id ?? randomUUID(),
      userId: input.userId,
      age: input.age,
      sex: input.sex,
      heightInches: input.heightInches,
      weightLbs: input.weightLbs,
      activityLevel: input.activityLevel,
      goalType: input.goalType,
      goalPace: input.goalPace,
      estimatedBmr: input.estimatedBmr,
      estimatedTdee: input.estimatedTdee,
      recommendedDailyCalories: input.recommendedDailyCalories,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    state.profilesByUserId.set(input.userId, profile);
    return profile;
  },

  async deleteByUserId(userId) {
    getMockState().profilesByUserId.delete(userId);
  },
};

function getSqlClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  return neon(databaseUrl);
}

function resetOnboardingSchemaCache() {
  globalThis.__onboardingEnsureTables = undefined;
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

async function withConnectionFallback<T>(operation: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isConnectionError(error)) {
      resetOnboardingSchemaCache();
      return fallback();
    }

    throw error;
  }
}

async function ensureOnboardingTables() {
  const sql = getSqlClient();
  if (!sql) {
    return;
  }

  if (!globalThis.__onboardingEnsureTables) {
    globalThis.__onboardingEnsureTables = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS user_profile (
          id TEXT PRIMARY KEY,
          user_id TEXT UNIQUE NOT NULL,
          age INTEGER NOT NULL,
          sex TEXT NOT NULL CHECK (sex IN ('female', 'male')),
          height_inches INTEGER NOT NULL,
          weight_lbs INTEGER NOT NULL,
          activity_level TEXT NOT NULL CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'very')),
          goal_type TEXT NOT NULL CHECK (goal_type IN ('lose', 'maintain', 'gain')),
          goal_pace TEXT NOT NULL CHECK (goal_pace IN ('slow', 'moderate', 'aggressive')),
          estimated_bmr INTEGER NOT NULL,
          estimated_tdee INTEGER NOT NULL,
          recommended_daily_calories INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS idx_user_profile_user_id ON user_profile (user_id)`;
    })();
  }

  await globalThis.__onboardingEnsureTables;
}

const neonRepository: OnboardingRepository = {
  async getByUserId(userId) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.getByUserId(userId);
    }

    return withConnectionFallback(async () => {
      await ensureOnboardingTables();
      const rows = await sql`
        SELECT
          id,
          user_id,
          age,
          sex,
          height_inches,
          weight_lbs,
          activity_level,
          goal_type,
          goal_pace,
          estimated_bmr,
          estimated_tdee,
          recommended_daily_calories,
          created_at,
          updated_at
        FROM user_profile
        WHERE user_id = ${userId}
        LIMIT 1
      `;

      if (rows.length === 0) {
        return null;
      }

      return toOnboardingProfile(rows[0] as Record<string, unknown>);
    }, () => mockRepository.getByUserId(userId));
  },

  async upsertProfile(input) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.upsertProfile(input);
    }

    return withConnectionFallback(async () => {
      await ensureOnboardingTables();
      const id = randomUUID();
      const now = new Date().toISOString();
      const rows = await sql`
        INSERT INTO user_profile (
          id,
          user_id,
          age,
          sex,
          height_inches,
          weight_lbs,
          activity_level,
          goal_type,
          goal_pace,
          estimated_bmr,
          estimated_tdee,
          recommended_daily_calories,
          created_at,
          updated_at
        )
        VALUES (
          ${id},
          ${input.userId},
          ${input.age},
          ${input.sex},
          ${input.heightInches},
          ${input.weightLbs},
          ${input.activityLevel},
          ${input.goalType},
          ${input.goalPace},
          ${input.estimatedBmr},
          ${input.estimatedTdee},
          ${input.recommendedDailyCalories},
          ${now},
          ${now}
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          age = EXCLUDED.age,
          sex = EXCLUDED.sex,
          height_inches = EXCLUDED.height_inches,
          weight_lbs = EXCLUDED.weight_lbs,
          activity_level = EXCLUDED.activity_level,
          goal_type = EXCLUDED.goal_type,
          goal_pace = EXCLUDED.goal_pace,
          estimated_bmr = EXCLUDED.estimated_bmr,
          estimated_tdee = EXCLUDED.estimated_tdee,
          recommended_daily_calories = EXCLUDED.recommended_daily_calories,
          updated_at = EXCLUDED.updated_at
        RETURNING
          id,
          user_id,
          age,
          sex,
          height_inches,
          weight_lbs,
          activity_level,
          goal_type,
          goal_pace,
          estimated_bmr,
          estimated_tdee,
          recommended_daily_calories,
          created_at,
          updated_at
      `;

      return toOnboardingProfile(rows[0] as Record<string, unknown>);
    }, () => mockRepository.upsertProfile(input));
  },

  async deleteByUserId(userId) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.deleteByUserId(userId);
    }

    return withConnectionFallback(async () => {
      await ensureOnboardingTables();
      await sql`
        DELETE FROM user_profile
        WHERE user_id = ${userId}
      `;
    }, () => mockRepository.deleteByUserId(userId));
  },
};

export function getOnboardingRepository(): OnboardingRepository {
  return process.env.DATABASE_URL ? neonRepository : mockRepository;
}
