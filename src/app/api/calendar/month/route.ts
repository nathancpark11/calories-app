import { NextRequest, NextResponse } from "next/server";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { getCalendarMonthPayload } from "@/lib/calories/service";
import { sanitizeMonthKey } from "@/lib/calories/utils";

export async function GET(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const monthRaw = request.nextUrl.searchParams.get("month");
    const month = sanitizeMonthKey(monthRaw);
    if (!month) {
      return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
    }

    const payload = await getCalendarMonthPayload(context.userId, month);
    return withUserCookie(NextResponse.json(payload), context);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch calendar month", details: (error as Error).message },
      { status: 500 },
    );
  }
}
