import { ChangeStatus } from "@/app/generated/prisma/enums";
import type { ChangeStatusValue } from "@/types/changes";

/**
 * Server-side change vocabulary.
 *
 * This is the **only** module that translates between the SCREAMING_SNAKE
 * `ChangeStatus` Prisma enum members and the lowercase vocabulary the wire
 * carries (`types/changes.ts`), exactly as `lib/build-units.ts` is the only
 * place that does it for the build-unit enums. Keeping both directions here
 * means a route never sees an enum member and the database never sees a wire
 * string, so a status added later is added in exactly two places: the schema,
 * and the tables below.
 *
 * It imports the generated Prisma enums, so it is server-only. The shapes it
 * speaks in live in `types/changes.ts`, which imports nothing, so a
 * `"use client"` module can share them without dragging the database client
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
