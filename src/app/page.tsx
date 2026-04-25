import CalorieTracker from "@/components/calorie-tracker";
import { getProfileByUserId } from "@/lib/auth/service";
import { cookies, headers } from "next/headers";
import { USER_ID_COOKIE } from "@/lib/calories/request-context";
import { getTodayPayload } from "@/lib/calories/service";
import { DEFAULT_TIMEZONE } from "@/lib/calories/utils";
import { redirect } from "next/navigation";

type HomeProps = {
  searchParams?: Promise<{ welcome?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const params = (await searchParams) ?? {};
  const userId = cookieStore.get(USER_ID_COOKIE)?.value ?? "anonymous";
  const timeZone = headerStore.get("x-vercel-ip-timezone") ?? DEFAULT_TIMEZONE;
  const initialProfile = await getProfileByUserId(userId);

  if (!initialProfile) {
    redirect("/login");
  }

  const initialToday = await getTodayPayload(userId, timeZone);
  const showOnboarding = params.welcome === "1";

  return (
    <CalorieTracker
      initialToday={initialToday}
      initialProfile={initialProfile}
      showOnboarding={showOnboarding}
    />
  );
}
