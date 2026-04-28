import { NextRequest, NextResponse } from "next/server";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { addExerciseEntry } from "@/lib/calories/service";
import { toSafePositiveInt } from "@/lib/calories/utils";

export async function POST(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const body = (await request.json()) as {
      description?: unknown;
      caloriesBurned?: unknown;
    };

    const description = String(body.description ?? "").trim();
    const caloriesBurned = toSafePositiveInt(body.caloriesBurned);

    if (!description) {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }

    if (!caloriesBurned) {
      return NextResponse.json({ error: "caloriesBurned must be a positive integer" }, { status: 400 });
    }

    const entry = await addExerciseEntry(context.userId, description, caloriesBurned, context.timeZone);
    return withUserCookie(NextResponse.json(entry, { status: 201 }), context);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add exercise entry", details: (error as Error).message },
      { status: 500 },
    );
  }
}
