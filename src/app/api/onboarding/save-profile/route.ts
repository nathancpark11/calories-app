import { NextRequest, NextResponse } from "next/server";
import { getProfileByUserId, updateDailyGoalForUser } from "@/lib/auth/service";
import { USER_ID_COOKIE } from "@/lib/calories/request-context";
import { getOnboardingRepository } from "@/lib/onboarding/repository";
import {
  calculateOnboardingGoal,
  parseOnboardingActivityLevel,
  parseOnboardingGoalPace,
  parseOnboardingGoalType,
  parseOnboardingSex,
  toBoundedWholeNumber,
} from "@/lib/onboarding/service";
import type { OnboardingCalculationInput } from "@/lib/onboarding/types";

type SavePayload = {
  age?: unknown;
  sex?: unknown;
  heightInches?: unknown;
  weightLbs?: unknown;
  activityLevel?: unknown;
  goalType?: unknown;
  goalPace?: unknown;
  dailyCalorieGoalOverride?: unknown;
};

const repository = getOnboardingRepository();

function parseInput(body: SavePayload): OnboardingCalculationInput | null {
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
    const userId = request.cookies.get(USER_ID_COOKIE)?.value?.trim();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const user = await getProfileByUserId(userId);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await request.json()) as SavePayload;
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
    const override = toBoundedWholeNumber(body.dailyCalorieGoalOverride, 1000, 7000);
    const selectedDailyGoal = override ?? result.recommendedDailyCalories;

    const profile = await repository.upsertProfile({
      userId,
      age: input.age,
      sex: input.sex,
      heightInches: input.heightInches,
      weightLbs: input.weightLbs,
      activityLevel: input.activityLevel,
      goalType: input.goalType,
      goalPace: input.goalPace,
      estimatedBmr: result.estimatedBmr,
      estimatedTdee: result.estimatedTdee,
      recommendedDailyCalories: result.recommendedDailyCalories,
    });

    const settings = await updateDailyGoalForUser(userId, selectedDailyGoal);

    return NextResponse.json({
      profile,
      result,
      selectedDailyGoal,
      usedManualOverride: override !== null,
      settings,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save onboarding profile", details: (error as Error).message },
      { status: 500 },
    );
  }
}
