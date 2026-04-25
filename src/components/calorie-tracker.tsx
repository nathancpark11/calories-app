"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AIEstimateItem,
  CalorieEntry,
  CalendarDayPayload,
  CalendarMonthDay,
  CalendarMonthPayload,
  Recipe,
  RecipeAIEstimate,
  TodayPayload,
} from "@/lib/calories/types";
import type { PublicUserProfile } from "@/lib/auth/types";

type TodayEntryTab = "manual" | "ai";
type AppTab = "today" | "recipes" | "calendar";
type GoalSex = "female" | "male";
type GoalActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
type GoalPace = "lose" | "maintain" | "gain";

type Props = {
  initialToday: TodayPayload;
  initialProfile: PublicUserProfile;
  showOnboarding?: boolean;
};

type OnboardingGoalForm = {
  sex: GoalSex;
  age: string;
  heightCm: string;
  weightKg: string;
  activityLevel: GoalActivityLevel;
  goalPace: GoalPace;
};

type OnboardingGoalEstimate = {
  recommendedDailyGoal: number;
  maintenanceCalories: number;
  reasoning: string[];
  disclaimer: string;
};

type RecipeFormState = {
  id?: string;
  name: string;
  totalCalories: string;
  servings: string;
  caloriesPerServing: string;
  notes: string;
  ingredientsJson: string;
};

const emptyRecipeForm: RecipeFormState = {
  name: "",
  totalCalories: "",
  servings: "",
  caloriesPerServing: "",
  notes: "",
  ingredientsJson: "",
};

const defaultOnboardingGoalForm: OnboardingGoalForm = {
  sex: "female",
  age: "30",
  heightCm: "165",
  weightKg: "68",
  activityLevel: "moderate",
  goalPace: "maintain",
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-time-zone": clientTimeZone,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; details?: string };
    throw new Error(payload.details || payload.error || "Request failed");
  }

  return (await response.json()) as T;
}

function getStatusTone(consumed: number, goal: number): "good" | "warn" | "over" {
  if (goal <= 0) {
    return "good";
  }

  const ratio = consumed / goal;
  if (ratio > 1) {
    return "over";
  }

  if (ratio >= 0.85) {
    return "warn";
  }

  return "good";
}

function getCalendarStatusForDay(consumed: number, goal: number, hasData: boolean): "under" | "near" | "over" | "none" {
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

function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthTitle(monthKey: string): string {
  const [year, month] = monthKey.split("-").map((value) => Number.parseInt(value, 10));
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function buildCalendarGrid(monthKey: string, monthDays: CalendarMonthDay[]) {
  const [year, month] = monthKey.split("-").map((value) => Number.parseInt(value, 10));
  const first = new Date(year, month - 1, 1);
  const firstWeekday = first.getDay();

  const blanks = Array.from({ length: firstWeekday }, (_, index) => ({ id: `blank-${index}`, blank: true as const }));
  const days = monthDays.map((day) => ({ id: day.date, blank: false as const, day }));
  return [...blanks, ...days];
}

export default function CalorieTracker({ initialToday, initialProfile, showOnboarding = false }: Props) {
  const router = useRouter();
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [currentTab, setCurrentTab] = useState<AppTab>("today");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isAccountDeleting, setIsAccountDeleting] = useState(false);

  const [todayEntryTab, setTodayEntryTab] = useState<TodayEntryTab>("manual");
  const [todayLoading, setTodayLoading] = useState(false);
  const [showOnboardingCard, setShowOnboardingCard] = useState(showOnboarding);
  const [onboardingGoalForm, setOnboardingGoalForm] = useState<OnboardingGoalForm>(defaultOnboardingGoalForm);
  const [onboardingGoalLoading, setOnboardingGoalLoading] = useState(false);
  const [onboardingGoalError, setOnboardingGoalError] = useState<string | null>(null);
  const [onboardingGoalEstimate, setOnboardingGoalEstimate] = useState<OnboardingGoalEstimate | null>(null);
  const [today, setToday] = useState<TodayPayload>(initialToday);
  const [foodName, setFoodName] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReviewItems, setAiReviewItems] = useState<AIEstimateItem[] | null>(null);
  const [aiReviewTotal, setAiReviewTotal] = useState(0);
  const [todayError, setTodayError] = useState<string | null>(null);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesError, setRecipesError] = useState<string | null>(null);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [recipeForm, setRecipeForm] = useState<RecipeFormState>(emptyRecipeForm);
  const [recipeAiPrompt, setRecipeAiPrompt] = useState("");
  const [recipeAiDraft, setRecipeAiDraft] = useState<RecipeAIEstimate | null>(null);

  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(getMonthKey(new Date()));
  const [calendarMonth, setCalendarMonth] = useState<CalendarMonthPayload | null>(null);
  const [selectedDay, setSelectedDay] = useState<CalendarDayPayload | null>(null);

  const tone = useMemo(
    () => getStatusTone(today.consumed, today.dailyGoal),
    [today.consumed, today.dailyGoal],
  );

  const progressPercent = useMemo(() => {
    if (today.dailyGoal <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((today.consumed / today.dailyGoal) * 100));
  }, [today.consumed, today.dailyGoal]);

  const toneClasses: Record<typeof tone, string> = {
    good: "from-sky-500 to-emerald-500",
    warn: "from-amber-400 to-amber-500",
    over: "from-rose-500 to-red-500",
  };

  const calendarGrid = useMemo(
    () => (calendarMonth ? buildCalendarGrid(calendarMonth.month, calendarMonth.days) : []),
    [calendarMonth],
  );

  const localTodayDate = getLocalDateKey();
  const todayHasData = today.entries.length > 0;
  const todayCalendarStatus = getCalendarStatusForDay(today.consumed, today.dailyGoal, todayHasData);

  const selectedDayView =
    selectedDay?.date === localTodayDate
      ? {
          ...selectedDay,
          dailyGoal: today.dailyGoal,
          consumed: today.consumed,
          remaining: today.remaining,
          status: todayCalendarStatus,
          entries: today.entries,
        }
      : selectedDay;

  async function refreshToday() {
    setTodayLoading(true);
    setTodayError(null);
    try {
      const payload = await fetchJson<TodayPayload>("/api/calories/today");
      setToday(payload);
    } catch (requestError) {
      setTodayError((requestError as Error).message);
    } finally {
      setTodayLoading(false);
    }
  }

  async function refreshRecipes(search = recipeSearch) {
    setRecipesLoading(true);
    setRecipesError(null);
    try {
      const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const payload = await fetchJson<{ recipes: Recipe[] }>(`/api/recipes${query}`);
      setRecipes(payload.recipes);
    } catch (requestError) {
      setRecipesError((requestError as Error).message);
    } finally {
      setRecipesLoading(false);
    }
  }

  async function refreshCalendarMonth(month = currentMonth) {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const payload = await fetchJson<CalendarMonthPayload>(`/api/calendar/month?month=${month}`);
      setCalendarMonth(payload);
    } catch (requestError) {
      setCalendarError((requestError as Error).message);
    } finally {
      setCalendarLoading(false);
    }
  }

  async function loadCalendarDay(date: string) {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const payload = await fetchJson<CalendarDayPayload>(`/api/calendar/day?date=${date}`);
      setSelectedDay(payload);
    } catch (requestError) {
      setCalendarError((requestError as Error).message);
    } finally {
      setCalendarLoading(false);
    }
  }

  async function refreshCalendarSelection(date: string) {
    const month = date.slice(0, 7);
    setCurrentMonth(month);
    await Promise.all([refreshCalendarMonth(month), loadCalendarDay(date)]);
  }

  function dismissOnboardingCard() {
    setShowOnboardingCard(false);
    setOnboardingGoalError(null);
    if (showOnboarding) {
      router.replace("/");
      router.refresh();
    }
  }

  async function estimateOnboardingGoal() {
    const age = Number.parseInt(onboardingGoalForm.age, 10);
    const heightCm = Number.parseInt(onboardingGoalForm.heightCm, 10);
    const weightKg = Number.parseInt(onboardingGoalForm.weightKg, 10);

    if (!Number.isFinite(age) || !Number.isFinite(heightCm) || !Number.isFinite(weightKg)) {
      setOnboardingGoalError("Enter valid numbers for age, height, and weight.");
      return;
    }

    setOnboardingGoalLoading(true);
    setOnboardingGoalError(null);
    try {
      const payload = await fetchJson<{ estimate: OnboardingGoalEstimate }>("/api/calories/ai-goal", {
        method: "POST",
        body: JSON.stringify({
          sex: onboardingGoalForm.sex,
          age,
          heightCm,
          weightKg,
          activityLevel: onboardingGoalForm.activityLevel,
          goalPace: onboardingGoalForm.goalPace,
        }),
      });

      setOnboardingGoalEstimate(payload.estimate);
    } catch (requestError) {
      setOnboardingGoalError((requestError as Error).message);
    } finally {
      setOnboardingGoalLoading(false);
    }
  }

  async function applyOnboardingGoal() {
    if (!onboardingGoalEstimate) {
      return;
    }

    setOnboardingGoalLoading(true);
    setOnboardingGoalError(null);
    try {
      await fetchJson("/api/auth/settings", {
        method: "POST",
        body: JSON.stringify({ dailyCalorieGoal: onboardingGoalEstimate.recommendedDailyGoal }),
      });
      await refreshToday();
      dismissOnboardingCard();
    } catch (requestError) {
      setOnboardingGoalError((requestError as Error).message);
    } finally {
      setOnboardingGoalLoading(false);
    }
  }

  async function addManual() {
    const parsed = Number.parseInt(manualCalories, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setTodayError("Calories must be a positive number.");
      return;
    }

    setTodayLoading(true);
    setTodayError(null);
    try {
      await fetchJson("/api/calories/manual-add", {
        method: "POST",
        body: JSON.stringify({
          foodName: foodName.trim(),
          calories: parsed,
        }),
      });
      setFoodName("");
      setManualCalories("");
      await refreshToday();
      if (currentTab === "calendar") {
        const date = selectedDay?.date ?? getLocalDateKey();
        await refreshCalendarSelection(date);
      }
    } catch (requestError) {
      setTodayError((requestError as Error).message);
      setTodayLoading(false);
    }
  }

  async function estimateWithAI() {
    if (!aiPrompt.trim()) {
      setTodayError("Please enter what you ate.");
      return;
    }

    setTodayLoading(true);
    setTodayError(null);
    try {
      const result = await fetchJson<{
        items: AIEstimateItem[];
        totalCalories: number;
      }>("/api/calories/ai-estimate", {
        method: "POST",
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      setAiReviewItems(result.items);
      setAiReviewTotal(result.totalCalories);
    } catch (requestError) {
      setTodayError((requestError as Error).message);
    } finally {
      setTodayLoading(false);
    }
  }

  async function acceptAI() {
    if (!aiReviewItems || aiReviewItems.length === 0) {
      return;
    }

    setTodayLoading(true);
    setTodayError(null);
    try {
      await fetchJson("/api/calories/confirm-ai-entry", {
        method: "POST",
        body: JSON.stringify({ items: aiReviewItems }),
      });
      setAiReviewItems(null);
      setAiReviewTotal(0);
      setAiPrompt("");
      await refreshToday();
      if (currentTab === "calendar") {
        const date = selectedDay?.date ?? getLocalDateKey();
        await refreshCalendarSelection(date);
      }
    } catch (requestError) {
      setTodayError((requestError as Error).message);
      setTodayLoading(false);
    }
  }

  function cancelAI() {
    setAiReviewItems(null);
    setAiReviewTotal(0);
  }

  async function deleteEntry(entryId: string) {
    setTodayLoading(true);
    setTodayError(null);
    try {
      await fetchJson(`/api/calories/entry/${entryId}`, { method: "DELETE" });
      await refreshToday();
      if (currentTab === "calendar") {
        const date = selectedDay?.date ?? getLocalDateKey();
        await refreshCalendarSelection(date);
      }
    } catch (requestError) {
      setTodayError((requestError as Error).message);
      setTodayLoading(false);
    }
  }

  function openNewRecipeForm() {
    setShowRecipeForm(true);
    setRecipeAiDraft(null);
    setRecipeForm(emptyRecipeForm);
  }

  function openEditRecipeForm(recipe: Recipe) {
    setShowRecipeForm(true);
    setRecipeAiDraft(null);
    setRecipeForm({
      id: recipe.id,
      name: recipe.name,
      totalCalories: String(recipe.totalCalories),
      servings: recipe.servings ? String(recipe.servings) : "",
      caloriesPerServing: String(recipe.caloriesPerServing),
      notes: recipe.notes ?? "",
      ingredientsJson: recipe.ingredientsJson ?? "",
    });
  }

  async function saveRecipe() {
    const totalCalories = Number.parseInt(recipeForm.totalCalories, 10);
    const caloriesPerServing = Number.parseInt(recipeForm.caloriesPerServing, 10);
    const servings = recipeForm.servings.trim().length > 0 ? Number.parseInt(recipeForm.servings, 10) : null;

    if (!recipeForm.name.trim()) {
      setRecipesError("Recipe name is required.");
      return;
    }

    if (!Number.isFinite(totalCalories) || totalCalories <= 0) {
      setRecipesError("Total calories must be a positive number.");
      return;
    }

    if (!Number.isFinite(caloriesPerServing) || caloriesPerServing <= 0) {
      setRecipesError("Calories per serving must be a positive number.");
      return;
    }

    if (servings !== null && (!Number.isFinite(servings) || servings <= 0)) {
      setRecipesError("Servings must be a positive number.");
      return;
    }

    setRecipesLoading(true);
    setRecipesError(null);
    try {
      const payload = {
        name: recipeForm.name,
        totalCalories,
        servings,
        caloriesPerServing,
        notes: recipeForm.notes,
        ingredientsJson: recipeForm.ingredientsJson,
      };

      if (recipeForm.id) {
        await fetchJson(`/api/recipes/${recipeForm.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await fetchJson("/api/recipes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setShowRecipeForm(false);
      setRecipeAiDraft(null);
      setRecipeForm(emptyRecipeForm);
      await refreshRecipes();
    } catch (requestError) {
      setRecipesError((requestError as Error).message);
    } finally {
      setRecipesLoading(false);
    }
  }

  async function deleteRecipe(recipeId: string) {
    setRecipesLoading(true);
    setRecipesError(null);
    try {
      await fetchJson(`/api/recipes/${recipeId}`, { method: "DELETE" });
      await refreshRecipes();
    } catch (requestError) {
      setRecipesError((requestError as Error).message);
    } finally {
      setRecipesLoading(false);
    }
  }

  async function addRecipeToToday(recipeId: string) {
    setRecipesLoading(true);
    setRecipesError(null);
    try {
      await fetchJson(`/api/recipes/${recipeId}/add-to-today`, {
        method: "POST",
        body: JSON.stringify({ servings: 1 }),
      });
      await refreshToday();
      if (currentTab === "calendar") {
        const date = selectedDay?.date ?? getLocalDateKey();
        await refreshCalendarSelection(date);
      }
    } catch (requestError) {
      setRecipesError((requestError as Error).message);
    } finally {
      setRecipesLoading(false);
    }
  }

  async function estimateRecipeWithAI() {
    if (!recipeAiPrompt.trim()) {
      setRecipesError("Please describe the recipe.");
      return;
    }

    setRecipesLoading(true);
    setRecipesError(null);
    try {
      const result = await fetchJson<{ estimate: RecipeAIEstimate }>("/api/recipes/ai-estimate", {
        method: "POST",
        body: JSON.stringify({ prompt: recipeAiPrompt }),
      });
      setRecipeAiDraft(result.estimate);
    } catch (requestError) {
      setRecipesError((requestError as Error).message);
    } finally {
      setRecipesLoading(false);
    }
  }

  function confirmRecipeAIToForm() {
    if (!recipeAiDraft) {
      return;
    }

    setShowRecipeForm(true);
    setRecipeForm({
      name: recipeAiDraft.recipeName,
      totalCalories: String(recipeAiDraft.totalCalories),
      servings: String(recipeAiDraft.servings),
      caloriesPerServing: String(recipeAiDraft.caloriesPerServing),
      notes: "",
      ingredientsJson: JSON.stringify(recipeAiDraft.ingredients, null, 2),
    });
    setRecipeAiDraft(null);
    setRecipeAiPrompt("");
  }

  function shiftMonth(delta: number) {
    const [year, month] = currentMonth.split("-").map((value) => Number.parseInt(value, 10));
    const date = new Date(year, month - 1 + delta, 1);
    const nextMonth = getMonthKey(date);
    setCurrentMonth(nextMonth);
    setSelectedDay(null);
    void refreshCalendarMonth(nextMonth);
  }

  const statusStyles: Record<string, string> = {
    none: "bg-zinc-100 text-zinc-400",
    under: "bg-emerald-100 text-emerald-700",
    near: "bg-amber-100 text-amber-700",
    over: "bg-rose-100 text-rose-700",
  };

  useEffect(() => {
    if (!isUserMenuOpen) {
      return;
    }

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!target || !userMenuRef.current) {
        return;
      }

      if (!userMenuRef.current.contains(target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (currentTab !== "calendar") {
      return;
    }

    const todayDate = getLocalDateKey();
    if (selectedDay?.date !== todayDate) {
      return;
    }

    const hasData = today.entries.length > 0;
    const status = getCalendarStatusForDay(today.consumed, today.dailyGoal, hasData);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDay({
      date: todayDate,
      dailyGoal: today.dailyGoal,
      consumed: today.consumed,
      remaining: today.remaining,
      status,
      entries: today.entries,
    });

    setCalendarMonth((prev) => {
      if (!prev || !todayDate.startsWith(prev.month)) {
        return prev;
      }

      return {
        ...prev,
        days: prev.days.map((day) =>
          day.date === todayDate
            ? {
                ...day,
                consumed: today.consumed,
                goal: today.dailyGoal,
                hasData,
                status,
              }
            : day,
        ),
      };
    });
  }, [today, currentTab, selectedDay?.date]);

  async function logout() {
    setTodayError(null);
    setTodayLoading(true);
    setIsUserMenuOpen(false);
    try {
      await fetchJson<{ success: boolean }>("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch (requestError) {
      setTodayError((requestError as Error).message);
      setTodayLoading(false);
    }
  }

  function openSettings() {
    setIsUserMenuOpen(false);
    setSettingsError(null);
    setIsDeleteConfirming(false);
    setIsSettingsOpen(true);
  }

  function closeSettings() {
    if (isAccountDeleting) {
      return;
    }

    setIsSettingsOpen(false);
    setIsDeleteConfirming(false);
    setSettingsError(null);
  }

  async function deleteAccount() {
    setSettingsError(null);
    setIsAccountDeleting(true);

    try {
      await fetchJson<{ success: boolean }>("/api/auth/settings", { method: "DELETE" });
      router.replace("/login");
      router.refresh();
    } catch (requestError) {
      setSettingsError((requestError as Error).message);
      setIsAccountDeleting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden text-zinc-900">

      <main className="relative mx-auto flex min-h-screen w-full max-w-107.5 flex-col gap-4 px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-5">
        {currentTab === "today" && (
          <>
            {showOnboardingCard && (
              <section className="rounded-2xl border border-sky-100 bg-white/95 p-5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.4)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">Welcome</p>
                    <h2 className="mt-1 text-lg font-semibold text-zinc-900">Set your daily target with AI</h2>
                    <p className="mt-1 text-sm text-zinc-600">
                      Share your profile and goal pace to estimate a daily calorie max before you start logging.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={dismissOnboardingCard}
                    className="h-10 rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100"
                  >
                    Skip
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Sex
                    <select
                      value={onboardingGoalForm.sex}
                      onChange={(event) =>
                        setOnboardingGoalForm((prev) => ({ ...prev, sex: event.target.value as GoalSex }))
                      }
                      className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 outline-none ring-sky-200 transition focus:ring"
                    >
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                    </select>
                  </label>

                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Age
                    <input
                      inputMode="numeric"
                      value={onboardingGoalForm.age}
                      onChange={(event) => setOnboardingGoalForm((prev) => ({ ...prev, age: event.target.value }))}
                      className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 outline-none ring-sky-200 transition focus:ring"
                    />
                  </label>

                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Height (cm)
                    <input
                      inputMode="numeric"
                      value={onboardingGoalForm.heightCm}
                      onChange={(event) => setOnboardingGoalForm((prev) => ({ ...prev, heightCm: event.target.value }))}
                      className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 outline-none ring-sky-200 transition focus:ring"
                    />
                  </label>

                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Weight (kg)
                    <input
                      inputMode="numeric"
                      value={onboardingGoalForm.weightKg}
                      onChange={(event) => setOnboardingGoalForm((prev) => ({ ...prev, weightKg: event.target.value }))}
                      className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 outline-none ring-sky-200 transition focus:ring"
                    />
                  </label>

                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Activity
                    <select
                      value={onboardingGoalForm.activityLevel}
                      onChange={(event) =>
                        setOnboardingGoalForm((prev) => ({
                          ...prev,
                          activityLevel: event.target.value as GoalActivityLevel,
                        }))
                      }
                      className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 outline-none ring-sky-200 transition focus:ring"
                    >
                      <option value="sedentary">Sedentary</option>
                      <option value="light">Light activity</option>
                      <option value="moderate">Moderate activity</option>
                      <option value="active">Active</option>
                      <option value="very_active">Very active</option>
                    </select>
                  </label>

                  <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Goal
                    <select
                      value={onboardingGoalForm.goalPace}
                      onChange={(event) =>
                        setOnboardingGoalForm((prev) => ({ ...prev, goalPace: event.target.value as GoalPace }))
                      }
                      className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 outline-none ring-sky-200 transition focus:ring"
                    >
                      <option value="lose">Lose weight</option>
                      <option value="maintain">Maintain weight</option>
                      <option value="gain">Gain weight</option>
                    </select>
                  </label>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={estimateOnboardingGoal}
                    disabled={onboardingGoalLoading}
                    className="h-11 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
                  >
                    {onboardingGoalLoading ? "Estimating..." : "Estimate with AI"}
                  </button>
                  <button
                    type="button"
                    onClick={dismissOnboardingCard}
                    disabled={onboardingGoalLoading}
                    className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50"
                  >
                    I&apos;ll do this later
                  </button>
                </div>

                {onboardingGoalEstimate && (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-sm font-semibold text-zinc-900">
                      Recommended daily target: {onboardingGoalEstimate.recommendedDailyGoal.toLocaleString()} cal
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      Estimated maintenance: {onboardingGoalEstimate.maintenanceCalories.toLocaleString()} cal
                    </p>
                    <ul className="mt-3 space-y-1 text-sm text-zinc-700">
                      {onboardingGoalEstimate.reasoning.map((reason, index) => (
                        <li key={`${reason}-${index}`}>• {reason}</li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-zinc-500">{onboardingGoalEstimate.disclaimer}</p>
                    <button
                      type="button"
                      onClick={applyOnboardingGoal}
                      disabled={onboardingGoalLoading}
                      className="mt-3 h-11 w-full rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Use this as my daily goal
                    </button>
                  </div>
                )}

                {onboardingGoalError && (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                    {onboardingGoalError}
                  </div>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-white/90 bg-white/95 p-5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.4)]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-baseline gap-2 border-b border-zinc-200/80 pb-1">
                  <h1 className="text-lg font-semibold tracking-tight">Today</h1>
                  <span className="text-sm text-zinc-500">{new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span>
                </div>

                <div className="relative shrink-0" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsUserMenuOpen((prev) => !prev)}
                    className="flex min-h-11 items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-left transition hover:bg-zinc-100"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-700">
                      {initialProfile.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block max-w-32 truncate text-sm font-semibold text-zinc-900">{initialProfile.displayName}</span>
                      <span className="block text-xs text-zinc-500">Account</span>
                    </span>
                  </button>
                  {isUserMenuOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
                      <p className="truncate px-2 py-1 text-sm font-semibold text-zinc-900">{initialProfile.displayName}</p>
                      <p className="truncate px-2 pb-2 text-xs text-zinc-500">{initialProfile.email}</p>
                      <button
                        type="button"
                        onClick={openSettings}
                        className="mb-2 flex h-10 w-full items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
                      >
                        Settings
                      </button>
                      <button
                        type="button"
                        onClick={logout}
                        disabled={todayLoading}
                        className="flex h-10 w-full items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50"
                      >
                        Log Out
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-3 flex items-end gap-2">
                <p className="text-4xl font-bold tracking-tight">{today.remaining}</p>
                <p className="pb-1 text-sm text-zinc-500">remaining</p>
              </div>

              <p className="mb-4 text-sm text-zinc-600">
                {today.consumed.toLocaleString()} consumed of {today.dailyGoal.toLocaleString()} goal
              </p>

              <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full bg-linear-to-r transition-all duration-500 ${toneClasses[tone]}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

            </section>

            <section className="rounded-2xl border border-white/90 bg-white/95 p-5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.4)]">
              <h2 className="text-base font-semibold">Add Calories</h2>

              <div className="mt-4 grid grid-cols-2 rounded-xl bg-zinc-100 p-1">
                <button
                  type="button"
                  onClick={() => setTodayEntryTab("manual")}
                  className={`h-11 rounded-lg px-3 text-sm font-medium transition ${
                    todayEntryTab === "manual" ? "bg-white text-zinc-900 shadow" : "text-zinc-500"
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setTodayEntryTab("ai")}
                  className={`h-11 rounded-lg px-3 text-sm font-medium transition ${
                    todayEntryTab === "ai" ? "bg-white text-zinc-900 shadow" : "text-zinc-500"
                  }`}
                >
                  AI Estimate
                </button>
              </div>

              {todayEntryTab === "manual" ? (
                <div className="mt-4 grid gap-3">
                  <input
                    value={foodName}
                    onChange={(event) => setFoodName(event.target.value)}
                    placeholder="Food name (optional)"
                    className="h-11 rounded-xl border border-zinc-200 px-3 text-base outline-none ring-sky-200 transition focus:ring"
                  />
                  <input
                    inputMode="numeric"
                    value={manualCalories}
                    onChange={(event) => setManualCalories(event.target.value)}
                    placeholder="Calories"
                    className="h-11 rounded-xl border border-zinc-200 px-3 text-base outline-none ring-sky-200 transition focus:ring"
                  />
                  <button
                    type="button"
                    onClick={addManual}
                    disabled={todayLoading}
                    className="h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
                  >
                    Add Entry
                  </button>
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  <textarea
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    rows={3}
                    maxLength={300}
                    placeholder="What did you eat? Example: 2 eggs and toast"
                    className="rounded-xl border border-zinc-200 px-3 py-3 text-base outline-none ring-sky-200 transition focus:ring"
                  />

                  <button
                    type="button"
                    onClick={estimateWithAI}
                    disabled={todayLoading}
                    className="h-11 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Estimate with AI
                  </button>

                  {aiReviewItems && (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="mb-2 text-sm font-semibold">Review estimate</p>
                      <ul className="space-y-2 text-sm text-zinc-700">
                        {aiReviewItems.map((item, index) => (
                          <li key={`${item.foodName}-${index}`} className="flex items-center justify-between">
                            <span>{item.foodName}</span>
                            <span className="font-medium">{item.calories} cal</span>
                          </li>
                        ))}

                      </ul>
                      <p className="mt-3 border-t border-zinc-200 pt-3 text-sm font-semibold">Total: {aiReviewTotal} cal</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={acceptAI}
                          disabled={todayLoading}
                          className="h-11 flex-1 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={cancelAI}
                          disabled={todayLoading}
                          className="h-11 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/90 bg-white/95 p-5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.4)]">
              <h2 className="text-base font-semibold">Today&apos;s Log</h2>
              <ul className="mt-4 space-y-2">
                {today.entries.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-500">
                    No entries yet.
                  </li>
                ) : (
                  today.entries.map((entry: CalorieEntry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{entry.foodName}</p>
                        <p className="text-xs text-zinc-500">{entry.source === "ai" ? "AI estimate" : "Manual"}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-semibold text-zinc-900">{entry.calories} cal</p>
                        <button
                          type="button"
                          onClick={() => deleteEntry(entry.id)}
                          disabled={todayLoading}
                          className="h-11 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>

            {todayError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">{todayError}</div>
            )}
          </>
        )}

        {currentTab === "recipes" && (
          <>
            <section className="rounded-2xl border border-white/90 bg-white/95 p-5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.4)]">
              <div className="flex items-center justify-between gap-2">
                <h1 className="text-lg font-semibold tracking-tight">Recipes</h1>
                <button
                  type="button"
                  onClick={openNewRecipeForm}
                  className="h-11 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-700"
                >
                  Add Recipe
                </button>
              </div>

              <input
                value={recipeSearch}
                onChange={(event) => setRecipeSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void refreshRecipes(event.currentTarget.value);
                  }
                }}
                placeholder="Search recipes"
                className="mt-4 h-11 w-full rounded-xl border border-zinc-200 px-3 text-base outline-none ring-sky-200 transition focus:ring"
              />

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => refreshRecipes()}
                  className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
                >
                  Search
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-white/90 bg-white/95 p-5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.4)]">
              <h2 className="text-base font-semibold">AI Recipe Estimate</h2>
              <textarea
                value={recipeAiPrompt}
                onChange={(event) => setRecipeAiPrompt(event.target.value)}
                rows={3}
                maxLength={300}
                placeholder="Example: chicken rice bowl with avocado"
                className="mt-3 rounded-xl border border-zinc-200 px-3 py-3 text-base outline-none ring-sky-200 transition focus:ring"
              />
              <button
                type="button"
                onClick={estimateRecipeWithAI}
                disabled={recipesLoading}
                className="mt-3 h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
              >
                Estimate Recipe with AI
              </button>

              {recipeAiDraft && (
                <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-semibold">Review before saving</p>
                  <p className="mt-2 text-sm text-zinc-700">{recipeAiDraft.recipeName}</p>
                  <p className="mt-1 text-sm text-zinc-700">Total: {recipeAiDraft.totalCalories} cal</p>
                  <p className="mt-1 text-sm text-zinc-700">Servings: {recipeAiDraft.servings}</p>
                  <p className="mt-1 text-sm text-zinc-700">Per serving: {recipeAiDraft.caloriesPerServing} cal</p>
                  <button
                    type="button"
                    onClick={confirmRecipeAIToForm}
                    className="mt-3 h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    Use in Form
                  </button>
                </div>
              )}
            </section>

            {showRecipeForm && (
              <section className="rounded-2xl border border-white/90 bg-white/95 p-5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.4)]">
                <h2 className="text-base font-semibold">{recipeForm.id ? "Edit Recipe" : "New Recipe"}</h2>
                <div className="mt-3 grid gap-3">
                  <input
                    value={recipeForm.name}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Recipe name"
                    className="h-11 rounded-xl border border-zinc-200 px-3 text-base outline-none ring-sky-200 transition focus:ring"
                  />
                  <input
                    value={recipeForm.totalCalories}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, totalCalories: event.target.value }))}
                    inputMode="numeric"
                    placeholder="Total calories"
                    className="h-11 rounded-xl border border-zinc-200 px-3 text-base outline-none ring-sky-200 transition focus:ring"
                  />
                  <input
                    value={recipeForm.servings}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, servings: event.target.value }))}
                    inputMode="numeric"
                    placeholder="Servings (optional)"
                    className="h-11 rounded-xl border border-zinc-200 px-3 text-base outline-none ring-sky-200 transition focus:ring"
                  />
                  <input
                    value={recipeForm.caloriesPerServing}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, caloriesPerServing: event.target.value }))}
                    inputMode="numeric"
                    placeholder="Calories per serving"
                    className="h-11 rounded-xl border border-zinc-200 px-3 text-base outline-none ring-sky-200 transition focus:ring"
                  />
                  <textarea
                    value={recipeForm.notes}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, notes: event.target.value }))}
                    rows={2}
                    placeholder="Notes or ingredients"
                    className="rounded-xl border border-zinc-200 px-3 py-3 text-base outline-none ring-sky-200 transition focus:ring"
                  />
                  <textarea
                    value={recipeForm.ingredientsJson}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, ingredientsJson: event.target.value }))}
                    rows={3}
                    placeholder="Ingredients JSON (optional)"
                    className="rounded-xl border border-zinc-200 px-3 py-3 font-mono text-base outline-none ring-sky-200 transition focus:ring"
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={saveRecipe}
                    disabled={recipesLoading}
                    className="h-11 flex-1 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRecipeForm(false);
                      setRecipeForm(emptyRecipeForm);
                    }}
                    className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    Cancel
                  </button>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-white/90 bg-white/95 p-5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.4)]">
              <h2 className="text-base font-semibold">Saved Recipes</h2>
              <ul className="mt-4 space-y-3">
                {recipes.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-500">
                    No recipes yet.
                  </li>
                ) : (
                  recipes.map((recipe) => (
                    <li key={recipe.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{recipe.name}</p>
                          <p className="mt-1 text-xs text-zinc-600">Per serving: {recipe.caloriesPerServing} cal</p>
                          <p className="text-xs text-zinc-600">Total: {recipe.totalCalories} cal</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addRecipeToToday(recipe.id)}
                          className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500"
                        >
                          Add
                        </button>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditRecipeForm(recipe)}
                          className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRecipe(recipe.id)}
                          className="h-11 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>

            {recipesError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">{recipesError}</div>
            )}
          </>
        )}

        {currentTab === "calendar" && (
          <>
            <section className="rounded-2xl border border-white/90 bg-white/95 p-5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.4)]">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
                >
                  Prev
                </button>
                <h1 className="text-base font-semibold">{getMonthTitle(currentMonth)}</h1>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
                >
                  Next
                </button>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-zinc-500">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              <div className="mt-2 grid grid-cols-7 gap-2">
                {calendarGrid.map((cell) =>
                  cell.blank ? (
                    <div key={cell.id} className="h-12 rounded-lg bg-transparent" />
                  ) : (
                    (() => {
                      const dayForView =
                        cell.day.date === localTodayDate
                          ? {
                              ...cell.day,
                              consumed: today.consumed,
                              goal: today.dailyGoal,
                              hasData: todayHasData,
                              status: todayCalendarStatus,
                            }
                          : cell.day;

                      return (
                        <button
                          key={cell.id}
                          type="button"
                          onClick={() => loadCalendarDay(dayForView.date)}
                          className={`relative h-12 rounded-lg border border-zinc-200 text-sm font-medium ${statusStyles[dayForView.status]} ${
                            selectedDayView?.date === dayForView.date ? "ring-2 ring-sky-300" : ""
                          }`}
                        >
                          {Number.parseInt(dayForView.date.slice(8, 10), 10)}
                          <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-current" />
                        </button>
                      );
                    })()
                  ),
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-600">
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" />Under</div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500" />Near</div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-500" />Over</div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-zinc-400" />No data</div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/90 bg-white/95 p-5 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.4)]">
              <h2 className="text-base font-semibold">Day Details</h2>
              {!selectedDayView ? (
                <p className="mt-3 text-sm text-zinc-600">Tap a day to view goal, consumed calories, and entries.</p>
              ) : (
                <>
                  <p className="mt-3 text-sm font-medium text-zinc-900">{selectedDayView.date}</p>
                  <p className="mt-1 text-sm text-zinc-700">Goal: {selectedDayView.dailyGoal} cal</p>
                  <p className="mt-1 text-sm text-zinc-700">Consumed: {selectedDayView.consumed} cal</p>
                  <p className="mt-1 text-sm text-zinc-700">{selectedDayView.remaining >= 0 ? "Remaining" : "Over"}: {Math.abs(selectedDayView.remaining)} cal</p>
                  <p className="mt-1 text-sm text-zinc-700">Status: {selectedDayView.status}</p>

                  <ul className="mt-4 space-y-2">
                    {selectedDayView.entries.length === 0 ? (
                      <li className="rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-500">
                        No entries for this day.
                      </li>
                    ) : (
                      selectedDayView.entries.map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-3">
                          <div>
                            <p className="text-sm font-medium text-zinc-900">{entry.foodName}</p>
                            <p className="text-xs text-zinc-500">{entry.source === "ai" ? "AI estimate" : "Manual"}</p>
                          </div>
                          <p className="text-sm font-semibold text-zinc-900">{entry.calories} cal</p>
                        </li>
                      ))
                    )}
                  </ul>
                </>
              )}
            </section>

            {(calendarError || (calendarLoading && !calendarMonth)) && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                {calendarError ?? "Loading calendar..."}
              </div>
            )}
          </>
        )}

        {isSettingsOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/30 px-4">
            <div className="w-full max-w-sm rounded-3xl border border-white/80 bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Settings</h2>
                  <p className="mt-1 text-sm text-zinc-500">Manage your account preferences.</p>
                </div>
                <button
                  type="button"
                  onClick={closeSettings}
                  disabled={isAccountDeleting}
                  className="h-10 rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm font-semibold text-zinc-900">{initialProfile.displayName}</p>
                <p className="mt-1 text-sm text-zinc-600">{initialProfile.email}</p>
              </div>

              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-semibold text-rose-800">Delete account</p>
                <p className="mt-1 text-sm text-rose-700">This permanently removes your profile, entries, recipes, and saved goal.</p>

                {isDeleteConfirming ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm font-medium text-rose-800">This action cannot be undone.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={deleteAccount}
                        disabled={isAccountDeleting}
                        className="h-11 flex-1 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                      >
                        {isAccountDeleting ? "Deleting..." : "Confirm Delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDeleteConfirming(false);
                          setSettingsError(null);
                        }}
                        disabled={isAccountDeleting}
                        className="h-11 flex-1 rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsDeleteConfirming(true)}
                    className="mt-4 h-11 w-full rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Delete Account
                  </button>
                )}
              </div>

              {settingsError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">{settingsError}</div>
              )}
            </div>
          </div>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50">
        <div className="mx-auto w-full max-w-107.5 border-t border-zinc-200/80 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="grid grid-cols-3 gap-2">
            {([
              ["today", "Today"],
              ["recipes", "Recipes"],
              ["calendar", "Calendar"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setCurrentTab(key);
                  if (key === "recipes") {
                    void refreshRecipes();
                  }
                  if (key === "calendar") {
                    const date = getLocalDateKey();
                    void refreshCalendarSelection(date);
                  }
                }}
                className={`h-12 rounded-xl text-sm font-semibold transition ${
                  currentTab === key ? "bg-sky-100 text-sky-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
