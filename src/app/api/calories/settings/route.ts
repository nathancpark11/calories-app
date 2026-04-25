import { NextRequest, NextResponse } from "next/server";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { updateDailyGoalForUser } from "@/lib/auth/service";
import { toSafePositiveInt } from "@/lib/calories/utils";

export async function POST(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const body = (await request.json()) as { dailyCalorieGoal?: unknown };
    const dailyCalorieGoal = toSafePositiveInt(body.dailyCalorieGoal);

    if (!dailyCalorieGoal) {
      return NextResponse.json(
        { error: "dailyCalorieGoal must be a positive integer" },
        { status: 400 },
      );
    }

    const profile = await updateDailyGoalForUser(context.userId, dailyCalorieGoal);
    return withUserCookie(NextResponse.json({ profile }), context);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update daily settings", details: (error as Error).message },
      { status: 500 },
    );
  }
}
