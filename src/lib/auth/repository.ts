import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { PublicUserProfile, UserProfile } from "@/lib/auth/types";
import { DEFAULT_DAILY_GOAL } from "@/lib/calories/utils";

type AuthRepository = {
  getById: (id: string) => Promise<UserProfile | null>;
  getByEmail: (email: string) => Promise<UserProfile | null>;
  create: (email: string, displayName: string, passwordHash: string) => Promise<UserProfile>;
  updateDailyGoal: (id: string, dailyCalorieGoal: number) => Promise<UserProfile | null>;
  getDailyGoal: (id: string) => Promise<number>;
  deleteById: (id: string) => Promise<boolean>;
};

type MockState = {
  usersById: Map<string, UserProfile>;
  userIdByEmail: Map<string, string>;
};

declare global {
  var __authMockState: MockState | undefined;
  var __authEnsureTables: Promise<void> | undefined;
  var __authSchemaVersion: number | undefined;
}

const AUTH_SCHEMA_VERSION = 2;

type DbLikeError = {
  code?: string;
  message?: string;
  cause?: { code?: string; message?: string };
};

function toUserProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    dailyCalorieGoal: Number(row.daily_calorie_goal) || DEFAULT_DAILY_GOAL,
    passwordHash: String(row.password_hash),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function getMockState(): MockState {
  if (!globalThis.__authMockState) {
    globalThis.__authMockState = {
      usersById: new Map<string, UserProfile>(),
      userIdByEmail: new Map<string, string>(),
    };
  }

  return globalThis.__authMockState;
}

const mockRepository: AuthRepository = {
  async getById(id) {
    const state = getMockState();
    return state.usersById.get(id) ?? null;
  },

  async getByEmail(email) {
    const state = getMockState();
    const id = state.userIdByEmail.get(email);
    if (!id) {
      return null;
    }

    return state.usersById.get(id) ?? null;
  },

  async create(email, displayName, passwordHash) {
    const state = getMockState();
    const now = new Date().toISOString();
    const id = randomUUID();
    const user: UserProfile = {
      id,
      email,
      displayName,
      dailyCalorieGoal: DEFAULT_DAILY_GOAL,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    state.usersById.set(id, user);
    state.userIdByEmail.set(email, id);
    return user;
  },

  async updateDailyGoal(id, dailyCalorieGoal) {
    const state = getMockState();
    const existing = state.usersById.get(id);
    if (!existing) {
      return null;
    }

    const updated: UserProfile = {
      ...existing,
      dailyCalorieGoal,
      updatedAt: new Date().toISOString(),
    };
    state.usersById.set(id, updated);
    return updated;
  },

  async getDailyGoal(id) {
    const state = getMockState();
    return state.usersById.get(id)?.dailyCalorieGoal ?? DEFAULT_DAILY_GOAL;
  },

  async deleteById(id) {
    const state = getMockState();
    const existing = state.usersById.get(id);
    if (!existing) {
      return false;
    }

    state.usersById.delete(id);
    state.userIdByEmail.delete(existing.email);
    return true;
  },
};

function getSqlClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  return neon(databaseUrl);
}

function resetAuthSchemaCache() {
  globalThis.__authEnsureTables = undefined;
  globalThis.__authSchemaVersion = undefined;
}

function isMissingDailyGoalColumnError(error: unknown): boolean {
  const dbError = error as DbLikeError;
  const message = (dbError.message ?? "").toLowerCase();
  return dbError.code === "42703" || message.includes("daily_calorie_goal") || message.includes("column") && message.includes("does not exist");
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

async function withAuthRecovery<T>(
  operation: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isMissingDailyGoalColumnError(error)) {
      try {
        resetAuthSchemaCache();
        await ensureAuthTables();
        return await operation();
      } catch (retryError) {
        if (isConnectionError(retryError)) {
          return fallback();
        }

        throw retryError;
      }
    }

    if (isConnectionError(error)) {
      return fallback();
    }

    throw error;
  }
}

async function ensureAuthTables() {
  const sql = getSqlClient();
  if (!sql) {
    return;
  }

  if (!globalThis.__authEnsureTables || globalThis.__authSchemaVersion !== AUTH_SCHEMA_VERSION) {
    globalThis.__authEnsureTables = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS user_profiles (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          daily_calorie_goal INTEGER NOT NULL DEFAULT 2000,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS daily_calorie_goal INTEGER NOT NULL DEFAULT 2000
      `;

      globalThis.__authSchemaVersion = AUTH_SCHEMA_VERSION;
    })();
  }

  await globalThis.__authEnsureTables;
}

const neonRepository: AuthRepository = {
  async getById(id) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.getById(id);
    }

    return withAuthRecovery(async () => {
      await ensureAuthTables();
      const rows = await sql`
        SELECT id, email, display_name, daily_calorie_goal, password_hash, created_at, updated_at
        FROM user_profiles
        WHERE id = ${id}
        LIMIT 1
      `;

      if (rows.length === 0) {
        return null;
      }

      return toUserProfile(rows[0] as Record<string, unknown>);
    }, () => mockRepository.getById(id));
  },

  async getByEmail(email) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.getByEmail(email);
    }

    return withAuthRecovery(async () => {
      await ensureAuthTables();
      const rows = await sql`
        SELECT id, email, display_name, daily_calorie_goal, password_hash, created_at, updated_at
        FROM user_profiles
        WHERE email = ${email}
        LIMIT 1
      `;

      if (rows.length === 0) {
        return null;
      }

      return toUserProfile(rows[0] as Record<string, unknown>);
    }, () => mockRepository.getByEmail(email));
  },

  async create(email, displayName, passwordHash) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.create(email, displayName, passwordHash);
    }

    return withAuthRecovery(async () => {
      await ensureAuthTables();
      const id = randomUUID();
      const now = new Date().toISOString();
      const rows = await sql`
        INSERT INTO user_profiles (id, email, display_name, daily_calorie_goal, password_hash, created_at, updated_at)
        VALUES (${id}, ${email}, ${displayName}, ${DEFAULT_DAILY_GOAL}, ${passwordHash}, ${now}, ${now})
        RETURNING id, email, display_name, daily_calorie_goal, password_hash, created_at, updated_at
      `;

      return toUserProfile(rows[0] as Record<string, unknown>);
    }, () => mockRepository.create(email, displayName, passwordHash));
  },

  async updateDailyGoal(id, dailyCalorieGoal) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.updateDailyGoal(id, dailyCalorieGoal);
    }

    return withAuthRecovery(async () => {
      await ensureAuthTables();
      const now = new Date().toISOString();
      const rows = await sql`
        UPDATE user_profiles
        SET daily_calorie_goal = ${dailyCalorieGoal}, updated_at = ${now}
        WHERE id = ${id}
        RETURNING id, email, display_name, daily_calorie_goal, password_hash, created_at, updated_at
      `;

      if (rows.length === 0) {
        return null;
      }

      return toUserProfile(rows[0] as Record<string, unknown>);
    }, () => mockRepository.updateDailyGoal(id, dailyCalorieGoal));
  },

  async getDailyGoal(id) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.getDailyGoal(id);
    }

    return withAuthRecovery(async () => {
      await ensureAuthTables();
      const rows = await sql`
        SELECT daily_calorie_goal
        FROM user_profiles
        WHERE id = ${id}
        LIMIT 1
      `;

      if (rows.length === 0) {
        return DEFAULT_DAILY_GOAL;
      }

      return Number(rows[0].daily_calorie_goal) || DEFAULT_DAILY_GOAL;
    }, () => mockRepository.getDailyGoal(id));
  },

  async deleteById(id) {
    const sql = getSqlClient();
    if (!sql) {
      return mockRepository.deleteById(id);
    }

    return withAuthRecovery(async () => {
      await ensureAuthTables();
      const rows = await sql`
        DELETE FROM user_profiles
        WHERE id = ${id}
        RETURNING id
      `;

      return rows.length > 0;
    }, () => mockRepository.deleteById(id));
  },
};

export function getAuthRepository(): AuthRepository {
  return process.env.DATABASE_URL ? neonRepository : mockRepository;
}

export function toPublicUserProfile(user: UserProfile): PublicUserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    dailyCalorieGoal: user.dailyCalorieGoal,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
