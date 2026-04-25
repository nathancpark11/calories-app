import { NextRequest, NextResponse } from "next/server";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { addManualEntry } from "@/lib/calories/service";
import { sanitizeFoodName, toSafePositiveInt } from "@/lib/calories/utils";

export async function POST(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const body = (await request.json()) as {
      foodName?: unknown;
      calories?: unknown;
    };

    const foodName = sanitizeFoodName(body.foodName, "Food item");
    const calories = toSafePositiveInt(body.calories);

    if (!calories) {
      return NextResponse.json({ error: "calories must be a positive integer" }, { status: 400 });
    }

    const entry = await addManualEntry(context.userId, foodName, calories, context.timeZone);
    return withUserCookie(NextResponse.json(entry, { status: 201 }), context);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add manual entry", details: (error as Error).message },
      { status: 500 },
    );
  }
}
