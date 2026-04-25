import { NextRequest, NextResponse } from "next/server";
import { estimateCaloriesFromPrompt } from "@/lib/calories/ai";
import { checkAIRateLimit } from "@/lib/calories/rate-limit";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { sanitizePrompt } from "@/lib/calories/utils";

export async function POST(request: NextRequest) {
  try {
    const context = getRequestContext(request);
    const rate = checkAIRateLimit(context.userId);
    if (!rate.allowed) {
      return withUserCookie(
        NextResponse.json(
          {
            error: "Too many AI estimate requests. Try again shortly.",
            retryAfterMs: Math.max(0, rate.resetAt - Date.now()),
          },
          { status: 429 },
        ),
        context,
      );
    }

    const body = (await request.json()) as { prompt?: unknown };
    const prompt = sanitizePrompt(body.prompt);

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required and must be <= 300 characters" },
        { status: 400 },
      );
    }

    const items = await estimateCaloriesFromPrompt(prompt);
    const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);

    return withUserCookie(
      NextResponse.json({
        prompt,
        items,
        totalCalories,
        requiresConfirmation: true,
        rateLimit: {
          remaining: rate.remaining,
          resetAt: rate.resetAt,
        },
      }),
      context,
    );
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: "Failed to estimate calories", details: message }, { status: 500 });
  }
}
