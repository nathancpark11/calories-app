export type OnboardingSex = "female" | "male";

export type OnboardingActivityLevel = "sedentary" | "light" | "moderate" | "very";

export type OnboardingGoalType = "lose" | "maintain" | "gain";

export type OnboardingGoalPace = "slow" | "moderate" | "aggressive";

export type OnboardingCalculationInput = {
  age: number;
  sex: OnboardingSex;
  heightInches: number;
  weightLbs: number;
  activityLevel: OnboardingActivityLevel;
  goalType: OnboardingGoalType;
  goalPace: OnboardingGoalPace;
};

export type OnboardingCalculationResult = {
  estimatedBmr: number;
  estimatedTdee: number;
  maintenanceCalories: number;
  recommendedDailyCalories: number;
  goalType: OnboardingGoalType;
  goalPace: OnboardingGoalPace;
  disclaimer: string;
};

export type OnboardingProfile = {
  id: string;
  userId: string;
  age: number;
  sex: OnboardingSex;
  heightInches: number;
  weightLbs: number;
  activityLevel: OnboardingActivityLevel;
  goalType: OnboardingGoalType;
  goalPace: OnboardingGoalPace;
  estimatedBmr: number;
  estimatedTdee: number;
  recommendedDailyCalories: number;
  createdAt: string;
  updatedAt: string;
};

export type SaveOnboardingProfileInput = OnboardingCalculationInput & {
  userId: string;
  dailyCalorieGoalOverride?: number | null;
};
