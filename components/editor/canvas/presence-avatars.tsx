"use client"

import { useMemo } from "react"
import { UserButton, useUser } from "@clerk/nextjs"
import { shallow, useOthersMapped } from "@liveblocks/react/suspense"

import { CollaboratorAvatar } from "./collaborator-avatar"

/** Most collaborator avatars shown before collapsing the rest into a +N chip. */
const MAX_VISIBLE = 5

interface Collaborator {
  connectionId: number
  id: string
  name: string
  avatar: string
  color: string
}

/**
 * The active-participant group pinned to the top-right of the canvas view.
 *
 * Collaborators come from Liveblocks presence, filtered to exclude the current
 * Clerk user (so the user is never shown twice — even across their own extra
 * tabs) and deduped by user id so one collaborator appears once regardless of
 * how many connections they hold. The current user is rendered separately via
 * Clerk's `UserButton`, kept the same size as the collaborator avatars, with a
 * divider between the two only when at least one collaborator is present.
 *
 * Presence is read with `useOthersMapped` rather than a bare `useOthers()`: the
 * avatar stack only cares about identity, which almost never changes, while
 * presence itself changes constantly as people move their cursors. Mapping to
 * just the identity fields (compared shallowly) keeps remote mouse movement from
 * re-rendering the stack many times a second.
 */
export function PresenceAvatars() {
  const { user } = useUser()
  const currentUserId = user?.id ?? null

  const others = useOthersMapped(
    (other) => ({
      id: other.id,
      name: other.info.name,
      avatar: other.info.avatar,
      color: other.info.color,
    }),
    shallow
  )

  const collaborators = useMemo<Collaborator[]>(() => {
    const seen = new Set<string>()
    const list: Collaborator[] = []

    for (const [connectionId, info] of others) {
      const id = info.id
      // Skip the current user's own connections and any duplicate connection
      // from a collaborator who already appears in the stack.
      if (!id || id === currentUserId || seen.has(id)) continue
      seen.add(id)
      list.push({
        connectionId,
        id,
        name: info.name,
        avatar: info.avatar,
        color: info.color,
      })
    }

    return list
  }, [others, currentUserId])

  const visible = collaborators.slice(0, MAX_VISIBLE)
  const overflow = collaborators.length - visible.length
  const hasCollaborators = collaborators.length > 0

  return (
    <div className="absolute top-4 right-[calc(1rem+var(--canvas-inset-right,0px))] z-10 flex items-center transition-[right] duration-200 ease-out">
      {hasCollaborators && (
        <div className="flex items-center -space-x-2">
          {visible.map((collaborator) => (
            <CollaboratorAvatar
              key={collaborator.connectionId}
              name={collaborator.name}
              avatar={collaborator.avatar}
              color={collaborator.color}
            />
          ))}
          {overflow > 0 && (
            <span className="flex size-7 items-center justify-center rounded-full bg-elevated text-xs font-medium text-copy-secondary ring-2 ring-surface select-none">
              +{overflow}
            </span>
          )}
        </div>
      )}

      {hasCollaborators && (
        <div aria-hidden className="mx-2 h-6 w-px bg-surface-border" />
      )}

      <UserButton appearance={{ elements: { avatarBox: "size-7" } }} />
    </div>
  )
}
