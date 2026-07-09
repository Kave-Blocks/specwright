import { NextResponse } from "next/server";

import { withProjectOwner } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeName, readJsonBody } from "@/lib/projects-api";

/** Rename a project. Only the owner may mutate it. */
export const PATCH = withProjectOwner<{ projectId: string }>(
  async (request, { params: { projectId } }) => {
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
  },
);

/** Delete a project. Only the owner may mutate it. */
export const DELETE = withProjectOwner<{ projectId: string }>(
  async (_request, { params: { projectId } }) => {
    await prisma.project.delete({ where: { id: projectId } });

    return NextResponse.json({ success: true });
  },
);
