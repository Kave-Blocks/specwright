import { ChangeStatus } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { ChangeStatusValue } from "@/types/changes";

/**
 * Server-side change vocabulary, and the two derived quantities that read it.
 *
 * This is the **only** module that translates between the SCREAMING_SNAKE
 * `ChangeStatus` Prisma enum members and the lowercase vocabulary the wire
 * carries (`types/changes.ts`), exactly as `lib/build-units.ts` is the only
 * place that does it for the build-unit enums. Keeping both directions here
 * means a route never sees an enum member and the database never sees a wire
 * string, so a status added later is added in exactly two places: the schema,
 * and the tables below.
 *
 * It also owns {@link currentSpecVersionOf} and {@link
 * countAppliedChangesSinceCurrentSpec} — "which spec version is current" and
 * "how far the spec has fallen behind". The first was `41`'s, private to
 * `lib/changes/apply.ts`; `42` needs the same answer, so it moved up here
 * rather than being written a second time. Both are queries, so this module is
 * server-only for two reasons now.
 *
 * The shapes it speaks in live in `types/changes.ts`, which imports nothing, so
 * a `"use client"` module can share them without dragging the database client
 * into the browser bundle.
 */

/*
 * Both directions are exhaustive `Record`s rather than switches with a default,
 * so a member added to `ChangeStatus` fails the build here instead of silently
 * falling through to a fallback. The Prisma 7.8 `prisma-client` generator emits
 * enums as `as const` objects, so a "member" is a string literal and these maps
 * are ordinary objects.
 */

const STATUS_TO_WIRE: Record<ChangeStatus, ChangeStatusValue> = {
  PROPOSED: "proposed",
  APPLIED: "applied",
  DISCARDED: "discarded",
};

const STATUS_FROM_WIRE: Record<ChangeStatusValue, ChangeStatus> = {
  proposed: ChangeStatus.PROPOSED,
  applied: ChangeStatus.APPLIED,
  discarded: ChangeStatus.DISCARDED,
};

/** Map a persisted status onto the value the wire carries. */
export function changeStatusToWire(status: ChangeStatus): ChangeStatusValue {
  return STATUS_TO_WIRE[status];
}

/**
 * Parse a wire status into its enum member, or `null` when it is not one of the
 * three. Returning `null` rather than a default is what lets a route answer 400
 * instead of quietly writing a status the caller did not ask for — the same
 * contract `parseBuildUnitStatus` has.
 */
export function parseChangeStatus(value: unknown): ChangeStatus | null {
  if (typeof value !== "string" || !Object.hasOwn(STATUS_FROM_WIRE, value)) {
    return null;
  }
  return STATUS_FROM_WIRE[value as ChangeStatusValue];
}

/* -------------------------------------------------------------------------- */
/* Spec drift                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The project's current highest spec version, or `null` when it has no specs.
 *
 * Read from the spec rows rather than from `Project.nextSpecVersion - 1`: the
 * counter records the last number *assigned*, which is not the same as the
 * highest version that still exists once a spec has been removed. What both
 * callers mean by "current" is the newest spec somebody could be looking at.
 *
 * `41`'s staleness check treats `null` as "nothing to be stale against" rather
 * than asserting; for a change that exists it cannot happen, since `baseSpecId`
 * is required and `onDelete: Restrict`.
 */
export async function currentSpecVersionOf(
  projectId: string,
): Promise<number | null> {
  const newest = await prisma.projectSpec.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return newest?.version ?? null;
}

/** How far a project's spec has fallen behind its own build list. */
export interface SpecDrift {
  /**
   * Applied changes reasoned against the version that is *still* current — the
   * work the spec does not describe. `0` when the spec is up to date, and `0`
   * when the project has no spec at all.
   */
  appliedSinceCurrentSpec: number;
  /** The version the count is measured against, or `null` with no specs. */
  currentSpecVersion: number | null;
}

/**
 * Count the applied changes the project's current spec does not describe.
 *
 * **Derived, never stored.** A change already records `baseSpecId` — the version
 * it was reasoned against — and a spec version is only ever assigned upward. So
 * a spec is behind exactly when an `APPLIED` change's base version is still the
 * project's highest: had a spec been generated after that change, the current
 * version would be higher. A `specStaleSince` column would store nothing these
 * two numbers do not already say, and would need keeping in sync with every
 * apply and every generation — `39`'s rule (record a fact already true, not one
 * that anticipates a relationship) applied a third time.
 *
 * Both numbers come back together because the one surface that renders them
 * renders them in the same sentence — "2 changes applied since Version 3" — and
 * a second round-trip for the second number would be gratuitous.
 *
 * A project with no specs is not an error: there is nothing to be behind, so
 * the count is `0`. `projectId` must already be access-checked by the caller.
 */
export async function countAppliedChangesSinceCurrentSpec(
  projectId: string,
): Promise<SpecDrift> {
  const currentSpecVersion = await currentSpecVersionOf(projectId);
  if (currentSpecVersion === null) {
    return { appliedSinceCurrentSpec: 0, currentSpecVersion: null };
  }

  // Filtered through the relation rather than by `baseSpecId`: the question is
  // about the base spec's *version*, and resolving the id of the current
  // version first would be a second query to say the same thing. Discarded and
  // proposed changes are excluded by the status — neither has touched the build
  // list, so neither can have put the spec behind.
  const appliedSinceCurrentSpec = await prisma.projectChange.count({
    where: {
      projectId,
      status: ChangeStatus.APPLIED,
      baseSpec: { version: currentSpecVersion },
    },
  });

  return { appliedSinceCurrentSpec, currentSpecVersion };
}
