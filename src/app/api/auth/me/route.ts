import { NextRequest, NextResponse } from "next/server";
import { getProfileByUserId } from "@/lib/auth/service";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";

export async function GET(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const profile = await getProfileByUserId(context.userId);
    return withUserCookie(NextResponse.json({ profile }), context);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch current profile", details: (error as Error).message },
      { status: 500 },
    );
  }
}
