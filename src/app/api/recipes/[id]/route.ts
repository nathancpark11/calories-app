import { NextRequest, NextResponse } from "next/server";
import { editRecipe, removeRecipe } from "@/lib/calories/service";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { sanitizeNotes, sanitizeRecipeName, toSafePositiveInt } from "@/lib/calories/utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseRecipeBody(body: Record<string, unknown>) {
  const name = sanitizeRecipeName(body.name);
  const totalCalories = toSafePositiveInt(body.totalCalories);
  const servingsRaw = body.servings;
  const servings = servingsRaw === null || servingsRaw === undefined || servingsRaw === ""
    ? null
    : toSafePositiveInt(servingsRaw);
  const caloriesPerServing = toSafePositiveInt(body.caloriesPerServing);
  const notes = sanitizeNotes(body.notes);
  const ingredientsJson = typeof body.ingredientsJson === "string" && body.ingredientsJson.trim().length > 0
    ? body.ingredientsJson.trim()
    : null;

  if (!name || !totalCalories || !caloriesPerServing) {
    return null;
  }

  if (servingsRaw !== null && servingsRaw !== undefined && servingsRaw !== "" && !servings) {
    return null;
  }

  return {
    name,
    totalCalories,
    servings,
    caloriesPerServing,
    notes,
    ingredientsJson,
  };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const requestContext = getRequestContext(request);
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Recipe id is required" }, { status: 400 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseRecipeBody(body);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid recipe payload" }, { status: 400 });
    }

    const recipe = await editRecipe(requestContext.userId, id, parsed);
    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    return withUserCookie(NextResponse.json(recipe), requestContext);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update recipe", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const requestContext = getRequestContext(request);
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Recipe id is required" }, { status: 400 });
    }

    const deleted = await removeRecipe(requestContext.userId, id);
    if (!deleted) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    return withUserCookie(NextResponse.json({ success: true }), requestContext);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete recipe", details: (error as Error).message },
      { status: 500 },
    );
  }
}
