import { NextRequest, NextResponse } from "next/server";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { confirmAIEntries } from "@/lib/calories/service";
import { normalizeAIItems, sanitizeMealCategory } from "@/lib/calories/utils";

export async function POST(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const body = (await request.json()) as { items?: unknown; category?: unknown };
    const items = normalizeAIItems(body.items);
    const category = sanitizeMealCategory(body.category) ?? undefined;

    if (!items) {
      return NextResponse.json({ error: "Invalid AI items payload" }, { status: 400 });
    }

    const createdEntries = await confirmAIEntries(context.userId, items, context.timeZone, category);
    const totalCalories = createdEntries.reduce((sum, item) => sum + item.calories, 0);

    return withUserCookie(NextResponse.json({ createdEntries, totalCalories }, { status: 201 }), context);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to confirm AI entries", details: (error as Error).message },
      { status: 500 },
    );
  }
}
