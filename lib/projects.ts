export type ProjectRole = "owner" | "collaborator"

export interface Project {
  id: string
  name: string
  slug: string
  role: ProjectRole
}

/**
 * Derive a URL-safe slug from a project name. Lowercased, non-alphanumeric
 * runs collapsed to single hyphens, and leading/trailing hyphens trimmed.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Mock project data used to develop the editor home and sidebar before the
 * Prisma-backed API exists. No persistence — edits live in client state only.
 */
export const mockProjects: Project[] = [
  { id: "p1", name: "Payments Platform", slug: "payments-platform", role: "owner" },
  { id: "p2", name: "Realtime Analytics", slug: "realtime-analytics", role: "owner" },
  { id: "p3", name: "Notification Service", slug: "notification-service", role: "owner" },
  { id: "p4", name: "Shared Infra Blueprint", slug: "shared-infra-blueprint", role: "collaborator" },
  { id: "p5", name: "Team Design Review", slug: "team-design-review", role: "collaborator" },
]
