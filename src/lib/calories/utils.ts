import type { AIEstimateItem } from "@/lib/calories/types";

export const DEFAULT_DAILY_GOAL = 2200;
export const MAX_PROMPT_LENGTH = 300;
export const MAX_FOOD_NAME_LENGTH = 100;
export const MAX_RECIPE_NAME_LENGTH = 120;
export const MAX_RECIPE_NOTES_LENGTH = 2000;
export const DEFAULT_TIMEZONE = "UTC";

export function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100 || value.trim().length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function sanitizeTimeZone(value: unknown): string {
  return isValidTimeZone(value) ? value : DEFAULT_TIMEZONE;
}

export function dateKeyForTimeZone(timeZone: string, date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: sanitizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return todayDateKey();
  }

  return `${year}-${month}-${day}`;
}

export function toSafePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = Math.round(value);
    return parsed > 0 ? parsed : null;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export function sanitizeFoodName(value: unknown, fallback = "Food item"): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, MAX_FOOD_NAME_LENGTH);
  return cleaned || fallback;
}

export function sanitizePrompt(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > MAX_PROMPT_LENGTH) {
    return null;
  }

  return cleaned;
}

export function sanitizeRecipeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, MAX_RECIPE_NAME_LENGTH);
  return cleaned || null;
}

export function sanitizeNotes(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().slice(0, MAX_RECIPE_NOTES_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

export function sanitizeMonthKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(cleaned);
  if (!match) {
    return null;
  }

  const month = Number.parseInt(match[2], 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  return cleaned;
}

export function sanitizeDateKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleaned);
  if (!match) {
    return null;
  }

  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return cleaned;
}

export function monthStartEnd(month: string): { startDate: string; endDate: string } {
  const [yearStr, monthStr] = month.split("-");
  const year = Number.parseInt(yearStr, 10);
  const monthIndex = Number.parseInt(monthStr, 10) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function getCalendarStatus(consumed: number, goal: number, hasData: boolean): "under" | "near" | "over" | "none" {
  if (!hasData) {
    return "none";
  }

  if (consumed > goal) {
    return "over";
  }

  if (consumed >= goal - 100) {
    return "near";
  }

  return "under";
}

export function normalizeAIItems(value: unknown): AIEstimateItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    return null;
  }

  const normalized = value
    .map((raw) => {
      if (!raw || typeof raw !== "object") {
        return null;
      }

      const obj = raw as Record<string, unknown>;
      const foodName = sanitizeFoodName(obj.foodName ?? obj.name, "Estimated food");
      const calories = toSafePositiveInt(obj.calories);

      if (!calories) {
        return null;
      }

      return { foodName, calories };
    })
    .filter((item): item is AIEstimateItem => item !== null);

  return normalized.length > 0 ? normalized : null;
}
