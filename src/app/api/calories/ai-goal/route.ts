import { NextRequest, NextResponse } from "next/server";
import { checkAIRateLimit } from "@/lib/calories/rate-limit";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import {
  estimateDailyGoalFromProfile,
  type GoalActivityLevel,
  type GoalEstimateInput,
  type GoalPace,
  type GoalSex,
} from "@/lib/calories/ai";
import { toSafePositiveInt } from "@/lib/calories/utils";

type GoalPayload = {
  sex?: unknown;
  age?: unknown;
  heightCm?: unknown;
  weightKg?: unknown;
  activityLevel?: unknown;
  goalPace?: unknown;
};

function parseGoalPayload(body: GoalPayload): GoalEstimateInput | null {
  const sex = body.sex === "female" || body.sex === "male" ? (body.sex as GoalSex) : null;
  const age = toSafePositiveInt(body.age);
  const heightCm = toSafePositiveInt(body.heightCm);
  const weightKg = toSafePositiveInt(body.weightKg);
  const activityLevel =
    body.activityLevel === "sedentary" ||
    body.activityLevel === "light" ||
    body.activityLevel === "moderate" ||
    body.activityLevel === "active" ||
    body.activityLevel === "very_active"
      ? (body.activityLevel as GoalActivityLevel)
      : null;
  const goalPace =
    body.goalPace === "lose" || body.goalPace === "maintain" || body.goalPace === "gain"
      ? (body.goalPace as GoalPace)
      : null;

  if (!sex || !age || !heightCm || !weightKg || !activityLevel || !goalPace) {
    return null;
  }

  if (age < 13 || age > 100 || heightCm < 120 || heightCm > 230 || weightKg < 30 || weightKg > 300) {
    return null;
  }

  return { sex, age, heightCm, weightKg, activityLevel, goalPace };
}

export async function POST(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const rate = checkAIRateLimit(`goal:${context.userId}`);
    if (!rate.allowed) {
      return withUserCookie(
        NextResponse.json(
          {
            error: "Too many AI goal estimate requests. Try again shortly.",
            retryAfterMs: Math.max(0, rate.resetAt - Date.now()),
          },
          { status: 429 },
        ),
        context,
      );
    }

    const body = (await request.json()) as GoalPayload;
    const input = parseGoalPayload(body);

    if (!input) {
      return NextResponse.json(
        { error: "Invalid payload. Provide sex, age, heightCm, weightKg, activityLevel, and goalPace." },
        { status: 400 },
      );
    }

    const estimate = await estimateDailyGoalFromProfile(input);

    return withUserCookie(
      NextResponse.json({
        estimate,
        rateLimit: {
          remaining: rate.remaining,
          resetAt: rate.resetAt,
        },
      }),
      context,
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to estimate daily calorie goal", details: (error as Error).message },
      { status: 500 },
    );
  }
}
