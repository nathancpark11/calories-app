import OpenAI from "openai";
import { sanitizeFoodName, sanitizeRecipeName, toSafePositiveInt } from "@/lib/calories/utils";
import type { AIEstimateItem, RecipeAIEstimate, RecipeIngredient } from "@/lib/calories/types";

const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";

const MOCK_CALORIE_LOOKUP: Record<string, number> = {
  egg: 70,
  eggs: 70,
  toast: 100,
  bread: 80,
  avocado: 160,
  chicken: 240,
  rice: 205,
  oatmeal: 150,
  banana: 105,
  yogurt: 140,
  salad: 180,
  burger: 520,
  pizza: 285,
  pasta: 390,
  coffee: 5,
  latte: 180,
  protein: 120,
  bar: 210,
  smoothie: 260,
};

export type GoalSex = "female" | "male";
export type GoalActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type GoalPace = "lose" | "maintain" | "gain";

export type GoalEstimateInput = {
  sex: GoalSex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: GoalActivityLevel;
  goalPace: GoalPace;
};

export type GoalEstimateResult = {
  recommendedDailyGoal: number;
  maintenanceCalories: number;
  reasoning: string[];
  disclaimer: string;
};

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return new OpenAI({ apiKey });
}

function buildMockEstimate(prompt: string): AIEstimateItem[] {
  const normalized = prompt
    .toLowerCase()
    .replace(/[^a-z0-9,\sand]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rawParts = normalized
    .split(/,|\band\b/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6);

  const items = rawParts
    .map((part) => {
      const words = part.split(" ").filter(Boolean);
      if (words.length === 0) {
        return null;
      }

      const quantityWord = words[0];
      const quantity = Number.parseInt(quantityWord, 10);
      const inferredQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
      const nameWords = Number.isFinite(quantity) ? words.slice(1) : words;
      const fallbackName = nameWords.join(" ") || part;

      const matchedWord = nameWords.find((word) => MOCK_CALORIE_LOOKUP[word]) ?? words.find((word) => MOCK_CALORIE_LOOKUP[word]);
      const baseCalories = matchedWord ? MOCK_CALORIE_LOOKUP[matchedWord] : 180;

      return {
        foodName: sanitizeFoodName(part, fallbackName),
        calories: baseCalories * inferredQuantity,
      };
    })
    .filter((item): item is AIEstimateItem => item !== null);

  if (items.length > 0) {
    return items;
  }

  return [{ foodName: sanitizeFoodName(prompt, "Estimated food"), calories: 250 }];
}

function activityMultiplier(level: GoalActivityLevel): number {
  switch (level) {
    case "sedentary":
      return 1.2;
    case "light":
      return 1.375;
    case "moderate":
      return 1.55;
    case "active":
      return 1.725;
    case "very_active":
      return 1.9;
    default:
      return 1.2;
  }
}

function boundedInt(value: unknown, min: number, max: number): number | null {
  const parsed = toSafePositiveInt(value);
  if (!parsed) {
    return null;
  }

  return parsed >= min && parsed <= max ? parsed : null;
}

function buildMockGoalEstimate(input: GoalEstimateInput): GoalEstimateResult {
  const bmrBase = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  const bmr = input.sex === "male" ? bmrBase + 5 : bmrBase - 161;
  const maintenanceCalories = Math.max(1200, Math.round(bmr * activityMultiplier(input.activityLevel)));

  const adjustment = input.goalPace === "lose" ? -450 : input.goalPace === "gain" ? 300 : 0;
  const floor = input.sex === "female" ? 1200 : 1400;
  const recommendedDailyGoal = Math.max(floor, maintenanceCalories + adjustment);

  const goalLabel = input.goalPace === "lose" ? "fat loss" : input.goalPace === "gain" ? "muscle gain" : "weight maintenance";

  return {
    recommendedDailyGoal,
    maintenanceCalories,
    reasoning: [
      `Estimated maintenance is ${maintenanceCalories} cal/day based on your profile and activity level.`,
      `Applied a ${adjustment} calorie adjustment for ${goalLabel}.`,
      `Rounded to a practical target of ${recommendedDailyGoal} calories per day.`,
    ],
    disclaimer: "AI estimates are directional and not medical advice. Adjust based on progress and consult a professional if needed.",
  };
}

function parseGoalEstimateContent(content: string): GoalEstimateResult {
  const parsed = JSON.parse(content) as {
    recommendedDailyGoal?: unknown;
    maintenanceCalories?: unknown;
    reasoning?: unknown;
    disclaimer?: unknown;
  };

  const recommendedDailyGoal = boundedInt(parsed.recommendedDailyGoal, 1000, 6000);
  const maintenanceCalories = boundedInt(parsed.maintenanceCalories, 1000, 6000);

  if (!recommendedDailyGoal || !maintenanceCalories) {
    throw new Error("AI goal estimate missing required numeric fields");
  }

  const reasoning = Array.isArray(parsed.reasoning)
    ? parsed.reasoning.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 5)
    : [];

  const disclaimer = typeof parsed.disclaimer === "string" && parsed.disclaimer.trim().length > 0
    ? parsed.disclaimer.trim()
    : "AI estimates are directional and not medical advice.";

  return {
    recommendedDailyGoal,
    maintenanceCalories,
    reasoning: reasoning.length > 0 ? reasoning : ["Estimate generated from your profile and activity level."],
    disclaimer,
  };
}

function parseEstimateContent(content: string): AIEstimateItem[] {
  const parsed = JSON.parse(content) as {
    items?: Array<{ foodName?: unknown; name?: unknown; calories?: unknown }>;
  };

  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error("AI estimate did not include items");
  }

  const items = parsed.items
    .map((item) => {
      const foodName = sanitizeFoodName(item.foodName ?? item.name, "Estimated food");
      const calories = toSafePositiveInt(item.calories);
      if (!calories) {
        return null;
      }

      return { foodName, calories };
    })
    .filter((item): item is AIEstimateItem => item !== null);

  if (items.length === 0) {
    throw new Error("AI estimate could not be normalized");
  }

  return items;
}

function normalizeRecipeIngredients(value: unknown): RecipeIngredient[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const obj = item as Record<string, unknown>;
      const name = sanitizeFoodName(obj.name, "Ingredient");
      const calories = toSafePositiveInt(obj.calories);
      if (!calories) {
        return null;
      }

      return { name, calories };
    })
    .filter((ingredient): ingredient is RecipeIngredient => ingredient !== null);
}

function parseRecipeEstimateContent(content: string): RecipeAIEstimate {
  const parsed = JSON.parse(content) as {
    recipeName?: unknown;
    ingredients?: unknown;
    totalCalories?: unknown;
    servings?: unknown;
    caloriesPerServing?: unknown;
  };

  const recipeName = sanitizeRecipeName(parsed.recipeName) ?? "Estimated Recipe";
  const ingredients = normalizeRecipeIngredients(parsed.ingredients);
  const totalCalories = toSafePositiveInt(parsed.totalCalories);
  const servings = toSafePositiveInt(parsed.servings);
  const caloriesPerServing = toSafePositiveInt(parsed.caloriesPerServing);

  if (!totalCalories || !servings || !caloriesPerServing) {
    throw new Error("AI recipe estimate missing required numeric fields");
  }

  return {
    recipeName,
    ingredients,
    totalCalories,
    servings,
    caloriesPerServing,
  };
}

export async function estimateCaloriesFromPrompt(prompt: string): Promise<AIEstimateItem[]> {
  if (!process.env.OPENAI_API_KEY) {
    return buildMockEstimate(prompt);
  }

  const client = getClient();

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You estimate calories for food intake. Return JSON only with an 'items' array. Each item must include 'foodName' and integer 'calories'. No extra keys.",
      },
      {
        role: "user",
        content: `Estimate calories for: ${prompt}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI response was empty");
  }

  return parseEstimateContent(content);
}

export async function estimateRecipeFromPrompt(prompt: string): Promise<RecipeAIEstimate> {
  if (!process.env.OPENAI_API_KEY) {
    const ingredients = buildMockEstimate(prompt).map((item) => ({ name: item.foodName, calories: item.calories }));
    const totalCalories = ingredients.reduce((sum, item) => sum + item.calories, 0);
    const servings = Math.max(1, Math.min(4, ingredients.length));

    return {
      recipeName: sanitizeRecipeName(prompt) ?? "Estimated Recipe",
      ingredients,
      totalCalories,
      servings,
      caloriesPerServing: Math.max(1, Math.round(totalCalories / servings)),
    };
  }

  const client = getClient();

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You estimate recipe nutrition. Return JSON only with keys: recipeName (string), ingredients (array of {name, calories}), totalCalories (integer), servings (integer), caloriesPerServing (integer). No extra keys.",
      },
      {
        role: "user",
        content: `Estimate calories for this recipe: ${prompt}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI recipe response was empty");
  }

  return parseRecipeEstimateContent(content);
}

export async function estimateDailyGoalFromProfile(input: GoalEstimateInput): Promise<GoalEstimateResult> {
  if (!process.env.OPENAI_API_KEY) {
    return buildMockGoalEstimate(input);
  }

  const client = getClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You estimate daily calorie goals from profile metrics. Return JSON only with keys: recommendedDailyGoal (integer), maintenanceCalories (integer), reasoning (array of 2-5 short strings), disclaimer (string). Do not include markdown.",
      },
      {
        role: "user",
        content: `Profile: ${JSON.stringify(input)}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI goal estimate response was empty");
  }

  try {
    return parseGoalEstimateContent(content);
  } catch {
    return buildMockGoalEstimate(input);
  }
}
