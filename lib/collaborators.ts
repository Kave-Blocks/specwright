import { clerkClient } from "@clerk/nextjs/server";
import type { User } from "@clerk/backend";

import { prisma } from "@/lib/prisma";

export type MemberRole = "owner" | "collaborator";

/**
 * A person with access to a project as rendered in the share dialog: the owner
 * plus every collaborator, enriched with the Clerk display name and avatar.
 * `email`/`name`/`imageUrl` are `null` when Clerk has no matching data, so the
 * UI falls back to whatever identifier it has.
 */
export interface MemberView {
  /** Collaborator row id, or the owner's Clerk user id for the owner row. */
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  role: MemberRole;
}

/**
 * Coerce an unknown value into a usable collaborator email. Trims, lowercases
 * (emails are case-insensitive, and Clerk stores them lowercased so stored
 * collaborator rows match the identity email used in access checks), and
 * applies a minimal shape check. Returns `null` when the value is not a
 * plausible email.
 */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Build a Clerk display name, falling back to username, then `null`. */
function displayName(user: User): string | null {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (full) {
    return full;
  }
  return user.username ?? null;
}

/** Resolve a Clerk user's primary email, falling back to the first address. */
function primaryEmail(user: User): string | null {
  return (
    user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null
  );
}

/** The avatar URL only when the user uploaded one (skip Clerk's default). */
function avatarUrl(user: User): string | null {
  return user.hasImage ? user.imageUrl : null;
}

/** Fetch a single Clerk user by id; best-effort, `null` on failure. */
async function fetchClerkUser(userId: string): Promise<User | null> {
  try {
    const client = await clerkClient();
    return await client.users.getUser(userId);
  } catch (error) {
    console.error("Failed to load owner from Clerk", error);
    return null;
  }
}

/**
 * Resolve Clerk users for a set of emails, keyed by lowercased email address.
 * Enrichment is best-effort: if the Clerk Backend API is unreachable the map is
 * empty and callers fall back to showing the email only.
 */
async function fetchClerkUsersByEmail(
  emails: string[],
): Promise<Map<string, User>> {
  const byEmail = new Map<string, User>();
  const unique = [...new Set(emails.map((email) => email.toLowerCase()))];
  if (unique.length === 0) {
    return byEmail;
  }

  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({
      emailAddress: unique,
      limit: unique.length,
    });
    for (const user of data) {
      for (const address of user.emailAddresses) {
        byEmail.set(address.emailAddress.toLowerCase(), user);
      }
    }
  } catch (error) {
    console.error("Failed to enrich collaborators from Clerk", error);
  }

  return byEmail;
}

/**
 * List everyone with access to a project — the owner first, then collaborators
 * ordered oldest first — each enriched with Clerk display name and avatar so
 * the share dialog can render "people with access" in one list.
 */
export async function listProjectMembers(project: {
  id: string;
  ownerId: string;
}): Promise<MemberView[]> {
  const rows = await prisma.projectCollaborator.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });

  const [owner, byEmail] = await Promise.all([
    fetchClerkUser(project.ownerId),
    fetchClerkUsersByEmail(rows.map((row) => row.email)),
  ]);

  const ownerMember: MemberView = {
    id: project.ownerId,
    email: owner ? primaryEmail(owner) : null,
    name: owner ? displayName(owner) : null,
    imageUrl: owner ? avatarUrl(owner) : null,
    role: "owner",
  };

  const collaborators: MemberView[] = rows.map((row) => {
    const user = byEmail.get(row.email.toLowerCase());
    return {
      id: row.id,
      email: row.email,
      name: user ? displayName(user) : null,
      imageUrl: user ? avatarUrl(user) : null,
      role: "collaborator",
    };
  });

  return [ownerMember, ...collaborators];
}
