import { NextRequest, NextResponse } from "next/server";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { getTodayPayload } from "@/lib/calories/service";

export async function GET(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const payload = await getTodayPayload(context.userId, context.timeZone);
    return withUserCookie(NextResponse.json(payload), context);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch today's calories", details: (error as Error).message },
      { status: 500 },
    );
  }
}
