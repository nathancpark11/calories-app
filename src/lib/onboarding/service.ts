import type {
  OnboardingActivityLevel,
  OnboardingCalculationInput,
  OnboardingCalculationResult,
  OnboardingGoalPace,
  OnboardingGoalType,
  OnboardingSex,
} from "@/lib/onboarding/types";

const ESTIMATE_DISCLAIMER =
  "This is an estimate of base metabolic calories (BMR), not medical advice. Strategy adds a planned deficit or surplus; adjust with progress.";

function poundsToKilograms(weightLbs: number): number {
  return weightLbs * 0.45359237;
}

function inchesToCentimeters(heightInches: number): number {
  return heightInches * 2.54;
}

export function parseOnboardingSex(value: unknown): OnboardingSex | null {
  return value === "female" || value === "male" ? value : null;
}

export function parseOnboardingActivityLevel(value: unknown): OnboardingActivityLevel | null {
  return value === "sedentary" || value === "light" || value === "moderate" || value === "very" ? value : null;
}

export function parseOnboardingGoalType(value: unknown): OnboardingGoalType | null {
  return value === "lose" || value === "maintain" || value === "gain" ? value : null;
}

export function parseOnboardingGoalPace(value: unknown): OnboardingGoalPace | null {
  return value === "slow" || value === "moderate" || value === "aggressive" ? value : null;
}

export function toBoundedWholeNumber(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === "number" ? Math.round(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

function getStrategyMagnitude(goalPace: OnboardingGoalPace): number {
  if (goalPace === "slow") {
    return 200;
  }

  if (goalPace === "moderate") {
    return 350;
  }

  return 500;
}

function goalAdjustment(goalType: OnboardingGoalType, goalPace: OnboardingGoalPace): number {
  if (goalType === "maintain") {
    return 0;
  }

  const magnitude = getStrategyMagnitude(goalPace);
  return goalType === "lose" ? -magnitude : magnitude;
}

function getActivityMultiplier(activityLevel: OnboardingActivityLevel): number {
  // Activity multipliers based on exercise frequency
  // These convert BMR to TDEE (Total Daily Energy Expenditure)
  if (activityLevel === "sedentary") {
    return 1.2; // Little/no exercise
  }

  if (activityLevel === "light") {
    return 1.375; // 1-3 days/week
  }

  if (activityLevel === "moderate") {
    return 1.55; // 3-5 days/week
  }

  return 1.725; // 6-7 days/week (very active)
}

export function calculateOnboardingGoal(input: OnboardingCalculationInput): OnboardingCalculationResult {
  const weightKg = poundsToKilograms(input.weightLbs);
  const heightCm = inchesToCentimeters(input.heightInches);

  const base = 10 * weightKg + 6.25 * heightCm - 5 * input.age;
  const estimatedBmr = Math.round(input.sex === "male" ? base + 5 : base - 161);
  
  // Apply activity multiplier to get TDEE (maintenance calories with activity)
  const activityMultiplier = getActivityMultiplier(input.activityLevel);
  const estimatedTdee = Math.round(estimatedBmr * activityMultiplier);
  
  const calorieAdjustment = goalAdjustment(input.goalType, input.goalPace);
  const recommendedDailyCalories = Math.max(1000, estimatedTdee + calorieAdjustment);

  return {
    estimatedBmr,
    estimatedTdee,
    maintenanceCalories: estimatedTdee,
    recommendedDailyCalories,
    calorieAdjustment,
    goalType: input.goalType,
    goalPace: input.goalPace,
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}
