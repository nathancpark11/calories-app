import { NextRequest, NextResponse } from "next/server";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { addRecipeEntry } from "@/lib/calories/service";
import { sanitizeMealCategory, toSafePositiveInt } from "@/lib/calories/utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const requestContext = getRequestContext(request);
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Recipe id is required" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { servings?: unknown; category?: unknown };
    const servings = toSafePositiveInt(body.servings) ?? 1;
    const category = sanitizeMealCategory(body.category) ?? undefined;

    const entry = await addRecipeEntry(requestContext.userId, id, servings, requestContext.timeZone, category);
    if (!entry) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    return withUserCookie(NextResponse.json(entry, { status: 201 }), requestContext);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add recipe to today", details: (error as Error).message },
      { status: 500 },
    );
  }
}
