interface CursorProps {
  /** Position within the canvas pane, in pixels. */
  x: number
  y: number
  /** Participant display name shown in the badge. */
  name: string
  /** Participant presence color — tints both the pointer and the badge. */
  color: string
}

/**
 * A single remote participant's cursor: a small colored pointer with a name
 * badge attached, both tinted with the participant's presence color. Positioned
 * via `translate` so movement stays on the compositor; a short transition
 * smooths the throttled presence updates coming over the network.
 */
export function Cursor({ x, y, name, color }: CursorProps) {
  return (
    <div
      className="absolute top-0 left-0 transition-transform duration-100 ease-linear will-change-transform"
      style={{ transform: `translate(${x}px, ${y}px)` }}
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
        className="absolute top-4 left-4 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap shadow-sm select-none"
        style={{ backgroundColor: color, color: "var(--bg-base)" }}
      >
        {name}
      </span>
    </div>
  )
}
