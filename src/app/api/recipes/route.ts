import { NextRequest, NextResponse } from "next/server";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { createRecipe, getRecipes } from "@/lib/calories/service";
import { sanitizeNotes, sanitizeRecipeName, toSafePositiveInt } from "@/lib/calories/utils";

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

export async function GET(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const search = request.nextUrl.searchParams.get("search") ?? "";
    const recipes = await getRecipes(context.userId, search);
    return withUserCookie(NextResponse.json({ recipes }), context);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch recipes", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseRecipeBody(body);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid recipe payload" },
        { status: 400 },
      );
    }

    const recipe = await createRecipe(context.userId, parsed);
    return withUserCookie(NextResponse.json(recipe, { status: 201 }), context);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create recipe", details: (error as Error).message },
      { status: 500 },
    );
  }
}
