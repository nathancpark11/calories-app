import type { NextRequest, NextResponse } from "next/server";
import { DEFAULT_TIMEZONE, sanitizeTimeZone } from "@/lib/calories/utils";

export const USER_ID_COOKIE = "calories_user_id";

export type RequestContext = {
  userId: string;
  timeZone: string;
  setCookie: boolean;
};

export function getRequestContext(request: NextRequest): RequestContext {
  const existingUserId = request.cookies.get(USER_ID_COOKIE)?.value?.trim();
  const userId = existingUserId || crypto.randomUUID();
  const setCookie = !existingUserId;

  const requestedTimeZone = request.headers.get("x-time-zone") || request.headers.get("x-vercel-ip-timezone");
  const timeZone = sanitizeTimeZone(requestedTimeZone ?? DEFAULT_TIMEZONE);

  return { userId, timeZone, setCookie };
}

export function withUserCookie(response: NextResponse, context: RequestContext): NextResponse {
  if (!context.setCookie) {
    return response;
  }

  response.cookies.set(USER_ID_COOKIE, context.userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
