import { NextRequest, NextResponse } from "next/server";
import { deleteAccount, updateDailyGoalForUser } from "@/lib/auth/service";
import { USER_ID_COOKIE } from "@/lib/calories/request-context";
import { toSafePositiveInt } from "@/lib/calories/utils";

export async function POST(request: NextRequest) {
  const userId = request.cookies.get(USER_ID_COOKIE)?.value?.trim();

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { dailyCalorieGoal?: unknown };
    const dailyCalorieGoal = toSafePositiveInt(body.dailyCalorieGoal);

    if (!dailyCalorieGoal) {
      return NextResponse.json({ error: "dailyCalorieGoal must be a positive integer" }, { status: 400 });
    }

    const profile = await updateDailyGoalForUser(userId, dailyCalorieGoal);
    if (!profile) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update settings", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const userId = request.cookies.get(USER_ID_COOKIE)?.value?.trim();

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    await deleteAccount(userId);

    const response = NextResponse.json({ success: true });
    response.cookies.set(USER_ID_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete account", details: (error as Error).message },
      { status: 500 },
    );
  }
}