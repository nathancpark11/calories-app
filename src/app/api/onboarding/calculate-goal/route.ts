import { NextRequest, NextResponse } from "next/server";
import {
  calculateOnboardingGoal,
  parseOnboardingActivityLevel,
  parseOnboardingGoalPace,
  parseOnboardingGoalType,
  parseOnboardingSex,
  toBoundedWholeNumber,
} from "@/lib/onboarding/service";
import type { OnboardingCalculationInput } from "@/lib/onboarding/types";

type CalculatePayload = {
  age?: unknown;
  sex?: unknown;
  heightInches?: unknown;
  weightLbs?: unknown;
  activityLevel?: unknown;
  goalType?: unknown;
  goalPace?: unknown;
};

function parseInput(body: CalculatePayload): OnboardingCalculationInput | null {
  const age = toBoundedWholeNumber(body.age, 13, 100);
  const sex = parseOnboardingSex(body.sex);
  const heightInches = toBoundedWholeNumber(body.heightInches, 48, 90);
  const weightLbs = toBoundedWholeNumber(body.weightLbs, 70, 700);
  const activityLevel = parseOnboardingActivityLevel(body.activityLevel) ?? "sedentary";
  const goalType = parseOnboardingGoalType(body.goalType) ?? "maintain";
  const goalPace = parseOnboardingGoalPace(body.goalPace) ?? "moderate";

  if (!age || !sex || !heightInches || !weightLbs) {
    return null;
  }

  return {
    age,
    sex,
    heightInches,
    weightLbs,
    activityLevel,
    goalType,
    goalPace,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CalculatePayload;
    const input = parseInput(body);
    if (!input) {
      return NextResponse.json(
        {
          error:
            "Invalid payload. Provide age, sex, heightInches, and weightLbs.",
        },
        { status: 400 },
      );
    }

    const result = calculateOnboardingGoal(input);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to calculate onboarding goal", details: (error as Error).message },
      { status: 500 },
    );
  }
}
