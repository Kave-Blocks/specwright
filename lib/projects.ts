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
 * A project as Workspace Home renders it: the sidebar's {@link Project} plus
 * the signals its card's status line composes from.
 *
 * It **extends** `Project` deliberately. `WorkspaceProject[]` is therefore
 * assignable to `EditorShell`'s `Project[]` props, so `/editor` makes one fetch
 * and hands the same arrays to both the shell and the view — and `EditorShell`,
 * `ProjectSidebar`, and `use-project-actions.ts` need no change at all. That
 * assignability is the reason the shape was chosen over a parallel type.
 *
 * There is deliberately **no `updatedAt`**: ordering happens server-side and
 * nothing renders a date, which sidesteps `Date` serialization across the
 * server boundary and locale hydration entirely.
 */
export interface WorkspaceProject extends Project {
  /** Whether the project has a saved canvas (`Project.canvasJsonPath !== null`). */
  hasCanvas: boolean
  /** Real count of generated specs (`ProjectSpec` rows for this project). */
  specCount: number
  /** Real count of build units (`ProjectBuildUnit` rows for this project). */
  buildUnitCount: number
  /** How many of those build units a person has marked `shipped`. */
  shippedBuildUnitCount: number
}
