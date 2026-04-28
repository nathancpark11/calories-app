import { NextRequest, NextResponse } from "next/server";
import { USER_ID_COOKIE } from "@/lib/calories/request-context";
import { getOnboardingRepository } from "@/lib/onboarding/repository";

const repository = getOnboardingRepository();

export async function GET(request: NextRequest) {
  try {
    const userId = request.cookies.get(USER_ID_COOKIE)?.value?.trim();
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const profile = await repository.getByUserId(userId);
    if (!profile) {
      return NextResponse.json(
        { error: "No profile found. Complete onboarding first." },
        { status: 404 },
      );
    }

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch profile", details: (error as Error).message },
      { status: 500 },
    );
  }
}
