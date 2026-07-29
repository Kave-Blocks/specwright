import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The Specwright mark: an "S" traced as a smooth-step canvas edge, terminating
 * in two connection nodes. Drawn on the same 24px grid and 2px stroke as the
 * Lucide icon set so it sits beside them as a peer.
 *
 * Strokes use `currentColor` — set the color with a text utility on the parent
 * (`text-brand`, `text-copy-primary`, ...).
 */
function LogoMark({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      data-slot="logo-mark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-6", className)}
      {...props}
    >
      <path d="M16.75 5.5H9.5Q5.5 5.5 5.5 8.75Q5.5 12 9.5 12h5Q18.5 12 18.5 15.25Q18.5 18.5 14.5 18.5H7.25" />
      <circle cx="18.5" cy="5.5" r="1.75" />
      <circle cx="5.5" cy="18.5" r="1.75" />
    </svg>
  )
}

/**
 * The mark paired with the wordmark. Renders as a single accessible unit, so
 * screen readers announce "Specwright" once rather than reading a decorative
 * mark alongside the text.
 */
function Logo({
  className,
  markClassName,
  ...props
}: React.ComponentProps<"span"> & { markClassName?: string }) {
  return (
    <span
      data-slot="logo"
      className={cn("flex items-center gap-2.5 text-base", className)}
      {...props}
    >
      <LogoMark className={cn("text-brand", markClassName)} />
      {/* Inherits its size from the root so callers scale the lockup with a
          single text utility. */}
      <span className="font-heading font-semibold tracking-tight text-copy-primary">
        Specwright
      </span>
    </span>
  )
}

export { Logo, LogoMark }
