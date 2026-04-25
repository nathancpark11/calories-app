import { NextRequest, NextResponse } from "next/server";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { getCalendarDayPayload } from "@/lib/calories/service";
import { sanitizeDateKey } from "@/lib/calories/utils";

export async function GET(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const dateRaw = request.nextUrl.searchParams.get("date");
    const date = sanitizeDateKey(dateRaw);
    if (!date) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    const payload = await getCalendarDayPayload(context.userId, date);
    return withUserCookie(NextResponse.json(payload), context);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch calendar day", details: (error as Error).message },
      { status: 500 },
    );
  }
}
