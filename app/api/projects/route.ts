import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PROJECT_NAME,
  normalizeId,
  normalizeName,
  readJsonBody,
} from "@/lib/projects-api";

/** List the authenticated user's own projects, newest first. */
export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ projects });
}

/** Create a project owned by the authenticated user. */
export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  const name = normalizeName(body.name) ?? DEFAULT_PROJECT_NAME;
  const description = normalizeName(body.description);
  // The client aligns the project id with the Liveblocks room id (slug +
  // suffix). When absent, Prisma's cuid() default supplies one.
  const id = normalizeId(body.id);

  try {
    const project = await prisma.project.create({
      data: {
        ...(id ? { id } : {}),
        ownerId: userId,
        name,
        description,
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "A project with that id already exists" },
        { status: 409 },
      );
    }
    throw error;
  }
}

/** Detect Prisma's unique-constraint violation (duplicate project id). */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
