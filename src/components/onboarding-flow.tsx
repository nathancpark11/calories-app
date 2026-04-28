"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Sex = "female" | "male";
type GoalType = "lose" | "maintain" | "gain";
type GoalStrategy = "slow" | "moderate" | "aggressive";

type OnboardingForm = {
  age: string;
  sex: Sex;
  heightInches: string;
  weightLbs: string;
  goalType: GoalType;
  goalStrategy: GoalStrategy;
};

type CalculationResult = {
  estimatedBmr: number;
  estimatedTdee: number;
  maintenanceCalories: number;
  recommendedDailyCalories: number;
  calorieAdjustment: number;
  goalType: GoalType;
  goalPace: GoalStrategy;
  disclaimer: string;
};

type ChoiceOption<TValue extends string> = {
  value: TValue;
  title: string;
  description: string;
};

const TOTAL_STEPS = 4;

const defaultForm: OnboardingForm = {
  age: "30",
  sex: "female",
  heightInches: "65",
  weightLbs: "150",
  goalType: "maintain",
  goalStrategy: "moderate",
};

const goalTypeOptions: ChoiceOption<GoalType>[] = [
  { value: "lose", title: "Lose", description: "Apply a daily deficit from your base calories." },
  { value: "maintain", title: "Maintain", description: "Keep intake at your base metabolic estimate." },
  { value: "gain", title: "Gain", description: "Apply a daily surplus above your base calories." },
];

const goalStrategyOptions: ChoiceOption<GoalStrategy>[] = [
  { value: "slow", title: "Conservative", description: "Smallest daily adjustment." },
  { value: "moderate", title: "Moderate", description: "Balanced adjustment for most users." },
  { value: "aggressive", title: "Aggressive", description: "Largest daily adjustment." },
];

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; details?: string };
    throw new Error(payload.details || payload.error || "Request failed");
  }

  return (await response.json()) as T;
}

function choiceClasses(selected: boolean): string {
  return selected
    ? "border-sky-500 bg-sky-50 text-sky-900"
    : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50";
}

export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<OnboardingForm>(defaultForm);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [manualOverrideEnabled, setManualOverrideEnabled] = useState(false);
  const [manualOverrideValue, setManualOverrideValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);

  const progressPercent = useMemo(() => Math.round((step / TOTAL_STEPS) * 100), [step]);

  function formKey(value: OnboardingForm): string {
    return JSON.stringify(value);
  }

  function parseWhole(value: string): number | null {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
  }

  function validateStep(targetStep: number): boolean {
    if (targetStep === 2) {
      const age = parseWhole(form.age);
      if (!age || age < 13 || age > 100) {
        setError("Enter an age between 13 and 100.");
        return false;
      }
    }

    if (targetStep === 3) {
      const heightInches = parseWhole(form.heightInches);
      const weightLbs = parseWhole(form.weightLbs);
      if (!heightInches || heightInches < 48 || heightInches > 90) {
        setError("Enter a height between 48 and 90 inches.");
        return false;
      }

      if (!weightLbs || weightLbs < 70 || weightLbs > 700) {
        setError("Enter a weight between 70 and 700 lbs.");
        return false;
      }
    }

    if (targetStep === 4) {
      if (!form.goalType || !form.goalStrategy) {
        setError("Choose a goal and strategy.");
        return false;
      }
    }

    setError(null);
    return true;
  }

  async function calculateIfNeeded() {
    const key = formKey(form);
    if (result && resultKey === key) {
      return;
    }

    setCalculating(true);
    setError(null);

    try {
      const age = Number.parseInt(form.age, 10);
      const heightInches = Number.parseInt(form.heightInches, 10);
      const weightLbs = Number.parseInt(form.weightLbs, 10);

      const payload = await postJson<{ result: CalculationResult }>("/api/onboarding/calculate-goal", {
        age,
        sex: form.sex,
        heightInches,
        weightLbs,
        goalType: form.goalType,
        goalPace: form.goalStrategy,
      });

      setResult(payload.result);
      setResultKey(key);
      if (!manualOverrideEnabled) {
        setManualOverrideValue(String(payload.result.recommendedDailyCalories));
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setCalculating(false);
    }
  }

  async function goNext() {
    if (step >= TOTAL_STEPS) {
      return;
    }

    const nextStep = step + 1;
    if (!validateStep(nextStep)) {
      return;
    }

    if (nextStep === 4) {
      await calculateIfNeeded();
    }

    setStep(nextStep);
  }

  function goBack() {
    setError(null);
    setStep((prev) => Math.max(1, prev - 1));
  }

  async function saveProfile() {
    if (!result) {
      setError("Please calculate your estimate first.");
      return;
    }

    let dailyCalorieGoalOverride: number | undefined;
    if (manualOverrideEnabled) {
      const parsed = parseWhole(manualOverrideValue);
      if (!parsed || parsed < 1000 || parsed > 7000) {
        setError("Manual target must be between 1000 and 7000 calories.");
        return;
      }

      dailyCalorieGoalOverride = parsed;
    }

    setSaving(true);
    setError(null);
    try {
      await postJson("/api/onboarding/save-profile", {
        age: Number.parseInt(form.age, 10),
        sex: form.sex,
        heightInches: Number.parseInt(form.heightInches, 10),
        weightLbs: Number.parseInt(form.weightLbs, 10),
        goalType: form.goalType,
        goalPace: form.goalStrategy,
        dailyCalorieGoalOverride,
      });

      router.replace("/");
      router.refresh();
    } catch (requestError) {
      setError((requestError as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden text-zinc-900">
      <main className="relative mx-auto flex min-h-screen w-full max-w-107.5 flex-col px-4 pb-10 pt-6">
        <section className="rounded-3xl border border-white/90 bg-white/95 p-5 shadow-[0_20px_44px_-24px_rgba(15,23,42,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">Onboarding</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Set your base calorie target</h1>
          <p className="mt-2 text-sm text-zinc-600">Step {step} of {TOTAL_STEPS}</p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-linear-to-r from-sky-500 to-cyan-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>

          {step === 1 && (
            <div className="mt-5 grid gap-3">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Age
                <input
                  inputMode="numeric"
                  value={form.age}
                  onChange={(event) => setForm((prev) => ({ ...prev, age: event.target.value }))}
                  className="h-12 rounded-xl border border-zinc-200 bg-white px-3 text-base outline-none ring-sky-200 transition focus:ring"
                />
              </label>

              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Sex</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, sex: "female" }))}
                    className={`min-h-12 rounded-xl border px-3 text-sm font-semibold transition ${choiceClasses(form.sex === "female")}`}
                  >
                    Female
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, sex: "male" }))}
                    className={`min-h-12 rounded-xl border px-3 text-sm font-semibold transition ${choiceClasses(form.sex === "male")}`}
                  >
                    Male
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-5 grid gap-3">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Height (inches)
                <input
                  inputMode="numeric"
                  value={form.heightInches}
                  onChange={(event) => setForm((prev) => ({ ...prev, heightInches: event.target.value }))}
                  className="h-12 rounded-xl border border-zinc-200 bg-white px-3 text-base outline-none ring-sky-200 transition focus:ring"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Weight (lbs)
                <input
                  inputMode="numeric"
                  value={form.weightLbs}
                  onChange={(event) => setForm((prev) => ({ ...prev, weightLbs: event.target.value }))}
                  className="h-12 rounded-xl border border-zinc-200 bg-white px-3 text-base outline-none ring-sky-200 transition focus:ring"
                />
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Goal</p>
                {goalTypeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, goalType: option.value }))}
                    className={`min-h-14 rounded-xl border px-3 py-2 text-left transition ${choiceClasses(form.goalType === option.value)}`}
                  >
                    <p className="text-sm font-semibold">{option.title}</p>
                    <p className="mt-1 text-xs opacity-80">{option.description}</p>
                  </button>
                ))}
              </div>

              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Strategy</p>
                {goalStrategyOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, goalStrategy: option.value }))}
                    className={`min-h-14 rounded-xl border px-3 py-2 text-left transition ${choiceClasses(form.goalStrategy === option.value)}`}
                  >
                    <p className="text-sm font-semibold">{option.title}</p>
                    <p className="mt-1 text-xs opacity-80">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={calculateIfNeeded}
                disabled={calculating || saving}
                className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50"
              >
                {calculating ? "Calculating..." : "Recalculate"}
              </button>

              {result ? (
                <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Calculation result</p>
                  <p className="mt-2 text-sm text-zinc-700">
                    Base metabolic calories (BMR): <span className="font-semibold text-zinc-900">{result.estimatedBmr.toLocaleString()} cal/day</span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-700">
                    Goal adjustment: <span className="font-semibold text-zinc-900">{result.calorieAdjustment >= 0 ? "+" : ""}{result.calorieAdjustment.toLocaleString()} cal/day</span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-700">
                    Daily target: <span className="font-semibold text-zinc-900">{result.recommendedDailyCalories.toLocaleString()} cal/day</span>
                  </p>
                  <p className="mt-3 text-xs text-zinc-600">{result.disclaimer}</p>
                </div>
              ) : (
                <p className="text-sm text-zinc-600">Your result will appear here after calculation.</p>
              )}

              <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-3">
                <input
                  type="checkbox"
                  checked={manualOverrideEnabled}
                  onChange={(event) => setManualOverrideEnabled(event.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-zinc-700">Override with my own daily target</span>
              </label>

              {manualOverrideEnabled && (
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Manual Daily Target
                  <input
                    inputMode="numeric"
                    value={manualOverrideValue}
                    onChange={(event) => setManualOverrideValue(event.target.value)}
                    className="h-12 rounded-xl border border-zinc-200 bg-white px-3 text-base outline-none ring-sky-200 transition focus:ring"
                  />
                </label>
              )}
            </div>
          )}

          {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1 || calculating || saving}
              className="h-12 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50"
            >
              Back
            </button>

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={() => {
                  void goNext();
                }}
                disabled={calculating || saving}
                className="h-12 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void saveProfile();
                }}
                disabled={calculating || saving || !result}
                className="h-12 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Confirm and Save"}
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
