import { auth, currentUser } from "@clerk/nextjs/server";

import { BuildUnitStatus } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type {
  Project,
  ProjectRole,
  WorkspaceProject,
} from "@/lib/projects";

export interface EditorHomeProjects {
  ownedProjects: Project[];
  sharedProjects: Project[];
}

export interface WorkspaceHomeProjects {
  ownedProjects: WorkspaceProject[];
  sharedProjects: WorkspaceProject[];
}

/** The signed-in user, plus whichever email their collaborator rows key off. */
interface ProjectViewer {
  userId: string;
  /**
   * `null` when Clerk resolves no email at all. The shared query is skipped
   * entirely in that case — running it with `email: undefined` drops the
   * predicate and matches every project in the database.
   */
  email: string | null;
}

/**
 * Resolve the signed-in user and the email their `ProjectCollaborator` rows are
 * keyed by. Returns `null` when unauthenticated, which both callers below turn
 * into empty lists rather than an error: page routes are already protected by
 * `proxy.ts`, so this is unreachable in practice.
 */
async function getProjectViewer(): Promise<ProjectViewer | null> {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const user = await currentUser();
  const email =
    user?.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;

  return { userId, email };
}

/**
 * Fetch the authenticated user's owned and shared projects for the editor
 * sidebar. Owned projects match `ownerId`; shared projects are those where a
 * collaborator record matches the user's Clerk email address. Both lists are
 * ordered by most recent activity. Returns empty lists when unauthenticated.
 *
 * Kept narrow on purpose. Its two callers are `app/editor/[roomId]/layout.tsx`,
 * which wraps all six room routes, so widening this return shape taxes every
 * in-project navigation with joins that feed a sidebar rendering only `name`
 * and `slug`. Workspace Home's richer shape has its own function below.
 */
export async function getEditorHomeProjects(): Promise<EditorHomeProjects> {
  const viewer = await getProjectViewer();
  if (!viewer) {
    return { ownedProjects: [], sharedProjects: [] };
  }
  const { userId, email } = viewer;

  const [owned, shared] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: userId },
      // `updatedAt`, not `createdAt`: the same sidebar is fed from
      // `getWorkspaceHomeProjects` at `/editor` and from here inside a project,
      // and the two must not disagree about the order. `updatedAt` is also the
      // honest activity signal — canvas autosave, renames, brief saves, and all
      // three sequence counters write the row.
      orderBy: { updatedAt: "desc" },
    }),
    email
      ? prisma.project.findMany({
          where: { collaborators: { some: { email } } },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return {
    ownedProjects: owned.map((project) => toUiProject(project, "owner")),
    sharedProjects: shared.map((project) =>
      toUiProject(project, "collaborator"),
    ),
  };
}

/**
 * The columns Workspace Home's status line composes from. `specs` and
 * `buildUnits` are totals, which `_count` answers in the same round trip as the
 * row itself.
 */
const WORKSPACE_PROJECT_SELECT = {
  id: true,
  name: true,
  canvasJsonPath: true,
  _count: { select: { specs: true, buildUnits: true } },
} as const;

/**
 * Fetch the authenticated user's projects for Workspace Home — the same two
 * predicates as {@link getEditorHomeProjects}, plus the per-project signals a
 * project card's status line is composed from.
 *
 * Two rounds of queries, constant regardless of project count: the two
 * `findMany` calls, then one `groupBy` over every resulting id for the shipped
 * counts. The `groupBy` is **not** a stylistic choice — the same relation
 * cannot appear twice under one `_count` with different filters, so the total
 * and the shipped subset cannot both come from `_count`. Do not "simplify" it
 * back.
 */
export async function getWorkspaceHomeProjects(): Promise<WorkspaceHomeProjects> {
  const viewer = await getProjectViewer();
  if (!viewer) {
    return { ownedProjects: [], sharedProjects: [] };
  }
  const { userId, email } = viewer;

  const [owned, shared] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      select: WORKSPACE_PROJECT_SELECT,
    }),
    email
      ? prisma.project.findMany({
          where: { collaborators: { some: { email } } },
          orderBy: { updatedAt: "desc" },
          select: WORKSPACE_PROJECT_SELECT,
        })
      : Promise.resolve([]),
  ]);

  const shippedByProject = await countShippedBuildUnits(
    [...owned, ...shared].map((project) => project.id),
  );

  return {
    ownedProjects: owned.map((project) =>
      toWorkspaceProject(project, "owner", shippedByProject),
    ),
    sharedProjects: shared.map((project) =>
      toWorkspaceProject(project, "collaborator", shippedByProject),
    ),
  };
}

/**
 * How many build units each of these projects has shipped, as one grouped
 * query. A project absent from the result has none.
 */
async function countShippedBuildUnits(
  projectIds: string[],
): Promise<Map<string, number>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const grouped = await prisma.projectBuildUnit.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds }, status: BuildUnitStatus.SHIPPED },
    _count: { _all: true },
  });

  return new Map(grouped.map((row) => [row.projectId, row._count._all]));
}

/**
 * Map a persisted project onto the UI shape used by the sidebar. The project
 * id doubles as the Liveblocks room id (slug + suffix), so it is surfaced as
 * the slug.
 */
function toUiProject(
  project: { id: string; name: string },
  role: ProjectRole,
): Project {
  return {
    id: project.id,
    name: project.name,
    slug: project.id,
    role,
  };
}

/** {@link toUiProject}, plus the signals a Workspace Home card reads. */
function toWorkspaceProject(
  project: {
    id: string;
    name: string;
    canvasJsonPath: string | null;
    _count: { specs: number; buildUnits: number };
  },
  role: ProjectRole,
  shippedByProject: Map<string, number>,
): WorkspaceProject {
  return {
    ...toUiProject(project, role),
    hasCanvas: project.canvasJsonPath !== null,
    specCount: project._count.specs,
    buildUnitCount: project._count.buildUnits,
    shippedBuildUnitCount: shippedByProject.get(project.id) ?? 0,
  };
}
