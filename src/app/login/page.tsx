"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type AuthMode = "login" | "register";

type AuthResponse = {
  error?: string;
  details?: string;
};

async function submitAuth(
  mode: AuthMode,
  payload: { email: string; password: string; displayName?: string },
): Promise<void> {
  const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as AuthResponse;
    throw new Error(body.details || body.error || "Authentication failed");
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    const trimmedName = displayName.trim();
    if (!trimmedEmail || !password.trim()) {
      setError("Email and password are required.");
      return;
    }

    if (mode === "register" && !trimmedName) {
      setError("Display name is required.");
      return;
    }

    setLoading(true);
    try {
      await submitAuth(mode, {
        email: trimmedEmail,
        password,
        displayName: mode === "register" ? trimmedName : undefined,
      });
      router.replace(mode === "register" ? "/onboarding" : "/");
      router.refresh();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden text-zinc-900">
      <main className="relative mx-auto flex min-h-screen w-full max-w-107.5 flex-col justify-center px-4 py-10">
        <section className="rounded-3xl border border-white/90 bg-white/95 p-6 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">Calorie Tracker</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {mode === "login"
              ? "Sign in to continue tracking today."
              : "Create an account to save goals, entries, and recipes."}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 grid gap-3">
            {mode === "register" && (
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
                placeholder="Display name"
                className="h-11 rounded-xl border border-zinc-200 px-3 text-base outline-none ring-indigo-200 transition focus:ring"
              />
            )}

            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="Email"
              className="h-11 rounded-xl border border-zinc-200 px-3 text-base outline-none ring-indigo-200 transition focus:ring"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="Password"
              className="h-11 rounded-xl border border-zinc-200 px-3 text-base outline-none ring-indigo-200 transition focus:ring"
            />

            <button
              type="submit"
              disabled={loading}
              className="mt-1 h-11 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
            >
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {error && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <div className="mt-4 text-sm text-zinc-600">
            {mode === "login" ? "Need an account?" : "Already registered?"}{" "}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode((prev) => (prev === "login" ? "register" : "login"));
              }}
              className="font-semibold text-indigo-600 hover:text-indigo-500"
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            By continuing, you agree to keep your login details secure on this device.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Return to the app home at <Link href="/" className="font-semibold text-zinc-700 hover:text-zinc-900">/</Link> after login.
          </p>
        </section>
      </main>
    </div>
  );
}