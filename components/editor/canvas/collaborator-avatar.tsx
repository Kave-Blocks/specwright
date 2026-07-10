"use client"

import { cn } from "@/lib/utils"

interface CollaboratorAvatarProps {
  /** Display name, used for the tooltip and the initials fallback. */
  name: string
  /** Profile photo URL, or an empty string when the user has no image. */
  avatar: string
  /** The participant's presence color, used to tint the initials fallback. */
  color: string
  className?: string
}

/**
 * A single, display-only collaborator avatar for the canvas presence stack.
 *
 * Renders the profile photo when available and falls back to the participant's
 * initials (tinted with their presence color) otherwise. A subtle ring in the
 * surface color keeps each avatar readable — and cleanly separated when
 * overlapped in a stack — on the dark canvas. Purely presentational: no click,
 * hover, or focus behavior beyond a native `title` tooltip.
 */
export function CollaboratorAvatar({
  name,
  avatar,
  color,
  className,
}: CollaboratorAvatarProps) {
  const ring = "size-7 rounded-full ring-2 ring-surface"

  if (avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar hosts (Clerk/Google) aren't configured for next/image
      <img
        src={avatar}
        alt={name}
        title={name}
        draggable={false}
        className={cn(ring, "object-cover select-none", className)}
      />
    )
  }

  return (
    <span
      title={name}
      aria-label={name}
      style={{ backgroundColor: color, color: "var(--bg-base)" }}
      className={cn(
        ring,
        "flex items-center justify-center text-xs font-semibold select-none",
        className
      )}
    >
      {getInitials(name)}
    </span>
  )
}

/** First letters of the first two words, uppercased. Falls back to "?". */
function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")

  return initials || "?"
}
