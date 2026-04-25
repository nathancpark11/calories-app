CREATE TABLE IF NOT EXISTS user_calorie_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  daily_calorie_goal INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calorie_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  food_name TEXT NOT NULL,
  calories INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'ai')),
  entry_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calorie_entries_user_date
  ON calorie_entries (user_id, entry_date);

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
);

CREATE INDEX IF NOT EXISTS idx_recipes_user_updated
  ON recipes (user_id, updated_at DESC);

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
);

CREATE INDEX IF NOT EXISTS idx_user_profile_user_id
  ON user_profile (user_id);
