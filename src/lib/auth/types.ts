export type UserProfile = {
  id: string;
  email: string;
  displayName: string;
  dailyCalorieGoal: number;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicUserProfile = {
  id: string;
  email: string;
  displayName: string;
  dailyCalorieGoal: number;
  createdAt: string;
  updatedAt: string;
};
