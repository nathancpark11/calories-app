import { getAuthRepository, toPublicUserProfile } from "@/lib/auth/repository";
import type { PublicUserProfile } from "@/lib/auth/types";
import { deleteUserCalorieData } from "@/lib/calories/service";
import { hashPassword, verifyPassword } from "@/lib/auth/utils";
import { getOnboardingRepository } from "@/lib/onboarding/repository";

const repository = getAuthRepository();
const onboardingRepository = getOnboardingRepository();

export async function getProfileByUserId(userId: string): Promise<PublicUserProfile | null> {
  const user = await repository.getById(userId);
  return user ? toPublicUserProfile(user) : null;
}

export async function registerProfile(
  email: string,
  displayName: string,
  password: string,
): Promise<PublicUserProfile> {
  const existing = await repository.getByEmail(email);
  if (existing) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = hashPassword(password);
  const created = await repository.create(email, displayName, passwordHash);
  return toPublicUserProfile(created);
}

export async function loginProfile(email: string, password: string): Promise<PublicUserProfile> {
  const user = await repository.getByEmail(email);
  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  if (!verifyPassword(password, user.passwordHash)) {
    throw new Error("INVALID_CREDENTIALS");
  }

  return toPublicUserProfile(user);
}

export async function getDailyGoalForUser(userId: string): Promise<number> {
  return repository.getDailyGoal(userId);
}

export async function updateDailyGoalForUser(userId: string, dailyCalorieGoal: number): Promise<PublicUserProfile | null> {
  const updated = await repository.updateDailyGoal(userId, dailyCalorieGoal);
  return updated ? toPublicUserProfile(updated) : null;
}

export async function deleteAccount(userId: string): Promise<boolean> {
  await onboardingRepository.deleteByUserId(userId);
  await deleteUserCalorieData(userId);
  return repository.deleteById(userId);
}
