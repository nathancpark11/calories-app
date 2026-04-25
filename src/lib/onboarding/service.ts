import type {
  OnboardingActivityLevel,
  OnboardingCalculationInput,
  OnboardingCalculationResult,
  OnboardingGoalPace,
  OnboardingGoalType,
  OnboardingSex,
} from "@/lib/onboarding/types";

const ESTIMATE_DISCLAIMER =
  "This is an estimate, not medical advice. Adjust based on progress and consult a professional if needed.";

function poundsToKilograms(weightLbs: number): number {
  return weightLbs * 0.45359237;
}

function inchesToCentimeters(heightInches: number): number {
  return heightInches * 2.54;
}

function activityMultiplier(activityLevel: OnboardingActivityLevel): number {
  switch (activityLevel) {
    case "sedentary":
      return 1.2;
    case "light":
      return 1.375;
    case "moderate":
      return 1.55;
    case "very":
      return 1.725;
    default:
      return 1.2;
  }
}

function goalAdjustment(goalType: OnboardingGoalType, goalPace: OnboardingGoalPace): number {
  if (goalType === "maintain") {
    return 0;
  }

  const base = goalPace === "slow" ? 250 : goalPace === "moderate" ? 500 : 750;
  return goalType === "lose" ? -base : base;
}

function safeDailyFloor(sex: OnboardingSex): number {
  return sex === "female" ? 1200 : 1400;
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

export function calculateOnboardingGoal(input: OnboardingCalculationInput): OnboardingCalculationResult {
  const weightKg = poundsToKilograms(input.weightLbs);
  const heightCm = inchesToCentimeters(input.heightInches);

  const base = 10 * weightKg + 6.25 * heightCm - 5 * input.age;
  const estimatedBmr = Math.round(input.sex === "male" ? base + 5 : base - 161);
  const estimatedTdee = Math.round(estimatedBmr * activityMultiplier(input.activityLevel));
  const recommendedDailyCalories = Math.max(
    safeDailyFloor(input.sex),
    estimatedTdee + goalAdjustment(input.goalType, input.goalPace),
  );

  return {
    estimatedBmr,
    estimatedTdee,
    maintenanceCalories: estimatedTdee,
    recommendedDailyCalories,
    goalType: input.goalType,
    goalPace: input.goalPace,
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}
