import { NextRequest, NextResponse } from "next/server";
import { registerProfile } from "@/lib/auth/service";
import { normalizeDisplayName, normalizeEmail, normalizePassword } from "@/lib/auth/utils";
import { USER_ID_COOKIE } from "@/lib/calories/request-context";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: unknown;
      displayName?: unknown;
      password?: unknown;
    };

    const email = normalizeEmail(body.email);
    const displayName = normalizeDisplayName(body.displayName);
    const password = normalizePassword(body.password);

    if (!email || !displayName || !password) {
      return NextResponse.json(
        { error: "Invalid input. Provide valid email, displayName, and password." },
        { status: 400 },
      );
    }

    const profile = await registerProfile(email, displayName, password);
    const response = NextResponse.json({ profile }, { status: 201 });
    response.cookies.set(USER_ID_COOKIE, profile.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    if ((error as Error).message === "EMAIL_ALREADY_EXISTS") {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }

    return NextResponse.json(
      { error: "Failed to register", details: (error as Error).message },
      { status: 500 },
    );
  }
}
