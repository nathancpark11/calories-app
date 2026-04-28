import { NextRequest, NextResponse } from "next/server";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { editEntry, removeEntry } from "@/lib/calories/service";
import { sanitizeFoodName, sanitizeMealCategory, toSafePositiveInt } from "@/lib/calories/utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const requestContext = getRequestContext(request);
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Entry id is required" }, { status: 400 });
    }

    const body = (await request.json()) as {
      foodName?: unknown;
      calories?: unknown;
      category?: unknown;
    };

    const foodName = sanitizeFoodName(body.foodName, "Food item");
    const calories = toSafePositiveInt(body.calories);
    const category = sanitizeMealCategory(body.category);

    if (!calories) {
      return NextResponse.json({ error: "calories must be a positive integer" }, { status: 400 });
    }

    const updated = await editEntry(requestContext.userId, id, foodName, calories, category);
    if (!updated) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return withUserCookie(NextResponse.json(updated), requestContext);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update entry", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const requestContext = getRequestContext(request);
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Entry id is required" }, { status: 400 });
    }

    const wasDeleted = await removeEntry(requestContext.userId, id);
    if (!wasDeleted) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return withUserCookie(NextResponse.json({ success: true }), requestContext);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete entry", details: (error as Error).message },
      { status: 500 },
    );
  }
}
