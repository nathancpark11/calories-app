import { NextRequest, NextResponse } from "next/server";
import { loginProfile } from "@/lib/auth/service";
import { normalizeEmail, normalizePassword } from "@/lib/auth/utils";
import { USER_ID_COOKIE } from "@/lib/calories/request-context";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };

    const email = normalizeEmail(body.email);
    const password = normalizePassword(body.password);

    if (!email || !password) {
      return NextResponse.json({ error: "Invalid email or password format" }, { status: 400 });
    }

    const profile = await loginProfile(email, password);
    const response = NextResponse.json({ profile });
    response.cookies.set(USER_ID_COOKIE, profile.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    if ((error as Error).message === "INVALID_CREDENTIALS") {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    return NextResponse.json({ error: "Failed to login", details: (error as Error).message }, { status: 500 });
  }
}
