import { NextResponse } from "next/server";
import { USER_ID_COOKIE } from "@/lib/calories/request-context";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(USER_ID_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
