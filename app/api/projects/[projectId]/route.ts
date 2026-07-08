import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  normalizeName,
  readJsonBody,
  verifyProjectOwnership,
} from "@/lib/projects-api";

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

function ownershipError(status: 403 | 404) {
  return NextResponse.json(
    { error: status === 403 ? "Forbidden" : "Not found" },
    { status },
  );
}

/** Rename a project. Only the owner may mutate it. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  const ownership = await verifyProjectOwnership(projectId, userId);
  if (!ownership.authorized) {
    return ownershipError(ownership.status);
  }

  const body = await readJsonBody(request);
  const name = normalizeName(body.name);
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: { name },
  });

  return NextResponse.json({ project });
}

/** Delete a project. Only the owner may mutate it. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  const ownership = await verifyProjectOwnership(projectId, userId);
  if (!ownership.authorized) {
    return ownershipError(ownership.status);
  }

  await prisma.project.delete({ where: { id: projectId } });

  return NextResponse.json({ success: true });
}
