import { prisma } from "@/lib/prisma";

/** Fallback name applied when a project is created without one. */
export const DEFAULT_PROJECT_NAME = "Untitled Project";

/**
 * Safely parse a JSON request body at the API boundary. Malformed or
 * non-object payloads collapse to an empty object so callers can validate
 * individual fields without trusting the input shape.
 */
export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const data = await request.json();
    return typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Coerce an unknown value into a usable project name. Returns the trimmed
 * string when it carries content, otherwise `null`.
 */
export function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Coerce an unknown value into a client-supplied project id. Returns the
 * trimmed string when it carries content, otherwise `null` so the caller can
 * fall back to the database default.
 */
export function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type OwnershipResult =
  | { authorized: true }
  | { authorized: false; status: 403 | 404 };

/**
 * Verify a project exists and is owned by the given user before a mutation.
 * Yields `404` when the project is missing and `403` when it belongs to
 * someone else, so a non-owner can never observe the difference beyond status.
 */
export async function verifyProjectOwnership(
  projectId: string,
  userId: string,
): Promise<OwnershipResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });

  if (!project) {
    return { authorized: false, status: 404 };
  }

  if (project.ownerId !== userId) {
    return { authorized: false, status: 403 };
  }

  return { authorized: true };
}
