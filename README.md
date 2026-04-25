# Calories App

Simple, modern one-page calorie tracker built with Next.js App Router and Tailwind CSS.

## Features

- Daily calorie allowance (set and edit)
- Today status summary (allowed, consumed, remaining)
- Progress bar with green/amber/red state logic
- Manual calorie entry (food + calories)
- AI calorie estimate via backend-only OpenAI call
- AI review step with accept/cancel before saving
- Daily log with source badge (manual/AI) and delete action

## Tech Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS v4
- Neon Postgres (`@neondatabase/serverless`)
- OpenAI Node SDK

## Environment Variables

Create `.env.local` with:

```bash
DATABASE_URL=postgres://...
OPENAI_API_KEY=sk-...
# Optional override
OPENAI_MODEL=gpt-4.1-mini
```

Notes:

- OpenAI keys are used only in backend route handlers.
- If `DATABASE_URL` is missing, routes fall back to an in-memory mock store.
- If `OPENAI_API_KEY` is missing, AI routes fall back to a backend-only mock estimator so the UI flow still works.
- A stable user identity cookie (`calories_user_id`) is auto-created for per-user tracking.

Auth:

- The app currently uses a simple email/password login flow before showing the tracker.
- In mock mode, register once locally and your cookie-backed profile and calorie data will work without Neon.

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API Routes

- `GET /api/calories/today`
- `POST /api/calories/settings`
- `POST /api/calories/manual-add`
- `POST /api/calories/ai-estimate`
- `POST /api/calories/confirm-ai-entry`
- `DELETE /api/calories/entry/:id`

AI route limits:

- `POST /api/calories/ai-estimate` is limited to 10 requests per user per 5-minute window.

## Data Model

SQL schema is provided in `src/lib/calories/schema.sql` and auto-created by repository bootstrap logic.

Tables:

- `user_calorie_settings`
	- `id`
	- `user_id`
	- `daily_calorie_goal`
	- `created_at`
	- `updated_at`
- `calorie_entries`
	- `id`
	- `user_id`
	- `food_name`
	- `calories`
	- `source` (`manual` or `ai`)
	- `entry_date`
	- `created_at`

## Auth and Timezone

- Requests are scoped by a server-set HTTP-only cookie identity.
- The client sends `x-time-zone` on API calls so "today" uses the user's local day.
