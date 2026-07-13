import { Loader2 } from "lucide-react"

interface CursorProps {
  /** Position in flow coordinates — the parent layer applies the viewport transform. */
  x: number
  y: number
  /** Current viewport zoom, used to counter-scale so the cursor stays screen-sized. */
  zoom: number
  /** Participant display name shown in the badge. */
  name: string
  /** Participant presence color — tints both the pointer and the badge. */
  color: string
  /** When true, show a live "thinking" indicator (used by the AI agent). */
  thinking?: boolean
}

/**
 * A single remote participant's cursor: a small colored pointer with a name
 * badge attached, both tinted with the participant's presence color.
 *
 * Positioning happens in two layers. The outer element translates to the cursor's
 * flow coordinates inside the already-transformed layer from `LiveCursors`, and
 * transitions that translate to smooth the throttled presence updates arriving
 * over the network. Because the viewport transform lives on an ancestor, the
 * transition only ever animates genuine cursor movement — panning and zooming
 * move the cursor instantly along with the canvas, instead of lagging behind it.
 *
 * The inner element then undoes the viewport's zoom, so the pointer and badge
 * keep a constant on-screen size at any zoom level, as they do in Figma.
 *
 * When the participant is `thinking` (the AI agent while it works), a small
 * spinner is shown in the badge so the state is visible to everyone.
 */
export function Cursor({
  x,
  y,
  zoom,
  name,
  color,
  thinking = false,
}: CursorProps) {
  return (
    <div
      className="absolute top-0 left-0 transition-transform duration-100 ease-linear will-change-transform"
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <div
        className="origin-top-left"
        style={{ transform: `scale(${1 / zoom})` }}
      >
        <svg
          width="18"
          height="27"
          viewBox="0 0 24 36"
          fill="none"
          aria-hidden
          className="drop-shadow-sm"
        >
          <path
            d="M0.928548 2.18278C0.619075 1.37094 1.42087 0.577818 2.2293 0.896107L14.3863 5.68247C15.2271 6.0135 15.2325 7.20148 14.3947 7.54008L9.85984 9.373C9.61167 9.47331 9.41408 9.66891 9.31127 9.91604L7.43907 14.4165C7.09186 15.2511 5.90335 15.2333 5.58136 14.3886L0.928548 2.18278Z"
            fill={color}
          />
        </svg>
        <span
          className="absolute top-4 left-4 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap shadow-sm select-none"
          style={{ backgroundColor: color, color: "var(--bg-base)" }}
        >
          {thinking && (
            <Loader2 aria-hidden className="size-3 shrink-0 animate-spin" />
          )}
          {name}
          {thinking && " is thinking…"}
        </span>
      </div>
    </div>
  )
}
