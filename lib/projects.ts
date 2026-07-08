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
