import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import OnboardingFlow from "@/components/onboarding-flow";
import { getProfileByUserId } from "@/lib/auth/service";
import { USER_ID_COOKIE } from "@/lib/calories/request-context";
import { getOnboardingRepository } from "@/lib/onboarding/repository";

const onboardingRepository = getOnboardingRepository();

export default async function OnboardingPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(USER_ID_COOKIE)?.value?.trim();

  if (!userId) {
    redirect("/login");
  }

  const user = await getProfileByUserId(userId);
  if (!user) {
    redirect("/login");
  }

  const existingOnboardingProfile = await onboardingRepository.getByUserId(userId);
  if (existingOnboardingProfile) {
    redirect("/");
  }

  return <OnboardingFlow />;
}
