import { NextRequest, NextResponse } from "next/server";
import { getRequestContext, withUserCookie } from "@/lib/calories/request-context";
import { removeEntry } from "@/lib/calories/service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const requestContext = getRequestContext(request);
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Entry id is required" }, { status: 400 });
    }

    const wasDeleted = await removeEntry(requestContext.userId, id);
    if (!wasDeleted) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return withUserCookie(NextResponse.json({ success: true }), requestContext);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete entry", details: (error as Error).message },
      { status: 500 },
    );
  }
}
