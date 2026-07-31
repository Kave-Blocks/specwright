"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { PanelLeftClose, PanelLeftOpen, Share2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LogoMark } from "@/components/ui/logo"
import { cn } from "@/lib/utils"

interface WorkspaceNavbarProps {
  /** Room/project id (room id ≡ project id) the mode-switcher links resolve against. */
  roomId: string
  projectName: string
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  onOpenShare: () => void
}

interface EditorMode {
  label: string
  href: string
}

/**
 * Project-wide navbar, shared by every route under `/editor/[roomId]`: the
 * logo mark, the project sidebar toggle, the project name, the mode-switcher,
 * and Share. Canvas-specific controls (save status, starter templates, the AI
 * chat toggle) live on the Canvas route itself — they are meaningful only
 * while it's the active route, not project-wide chrome.
 */
export function WorkspaceNavbar({
  roomId,
  projectName,
  isSidebarOpen,
  onToggleSidebar,
  onOpenShare,
}: WorkspaceNavbarProps) {
  const pathname = usePathname()
  const switcherRef = useRef<HTMLElement>(null)
  const SidebarToggleIcon = isSidebarOpen ? PanelLeftClose : PanelLeftOpen

  const modes: EditorMode[] = [
    { label: "Home", href: `/editor/${roomId}` },
    { label: "Architecture Interview", href: `/editor/${roomId}/discovery` },
    { label: "Canvas", href: `/editor/${roomId}/canvas` },
    { label: "Specs", href: `/editor/${roomId}/specs` },
    { label: "Build", href: `/editor/${roomId}/build` },
    { label: "Changes", href: `/editor/${roomId}/changes` },
  ]

  /*
   * Keep the active mode visible whenever the switcher is scrolled.
   *
   * The scroller's resting position is `scrollLeft: 0`, so on a narrow window
   * the entries that overflow — Build and Changes, the two on the right — would
   * be off-screen even while one of them is the current route. An active tab
   * you cannot see is worse than a clipped one: it reads as "no mode selected".
   * So after every navigation we re-centre the active entry in whatever width
   * the scroller actually got.
   *
   * `scrollLeft +=` a measured delta rather than `scrollIntoView()` because
   * `scrollIntoView` walks *every* scrollable ancestor, including the document.
   * The navbar is `position: fixed` over route content that scrolls; nudging
   * the page sideways (or vertically, on the block axis) as a side effect of
   * rendering chrome is not a trade worth making for one API call. The browser
   * clamps an out-of-range `scrollLeft` on its own, so no bounds math here.
   */
  useEffect(() => {
    const switcher = switcherRef.current
    const active = switcher?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!switcher || !active) return

    const switcherBox = switcher.getBoundingClientRect()
    const activeBox = active.getBoundingClientRect()
    switcher.scrollLeft +=
      activeBox.left -
      switcherBox.left -
      (switcherBox.width - activeBox.width) / 2
  }, [pathname])

  return (
    /*
     * Track sizing carries the overflow contract, so it is deliberate rather
     * than cosmetic:
     *
     * - left `minmax(0,1fr)` — the project name is the only thing here that
     *   may be arbitrarily long, and it already truncates. It is the first
     *   thing asked to give up space.
     * - center `minmax(0,auto)` — `auto` keeps the switcher at its natural
     *   width (and therefore optically centered) whenever it fits; the `0`
     *   floor is what lets it shrink *below* its min-content width instead of
     *   forcing the grid wider than the viewport. The old `auto` track could
     *   not shrink at all, which is why five entries fit and six pushed the
     *   row into overflow.
     * - right `minmax(min-content,1fr)` — Share must never be squeezed or
     *   overlapped: it is the only destructive-to-lose control up here. Giving
     *   its track a min-content floor means the squeeze lands on the switcher,
     *   which knows how to handle it, rather than on a button that does not.
     */
    <header className="fixed inset-x-0 top-0 z-40 grid h-14 grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(min-content,1fr)] items-center border-b border-surface-border bg-surface px-3">
      {/*
       * No `justify-self-start` here, and that absence is the fix for a real
       * overlap bug. `justify-self: start` opts a grid item out of the default
       * `stretch`, which sizes it to its *content* instead of to its track — so
       * the block simply grew past the `minmax(0,1fr)` track and painted over
       * the mode-switcher, and the `min-w-0`/`truncate` below were inert
       * because nothing was ever constraining the box in the first place. The
       * longer the project name, the worse it got. Stretched to the track, the
       * chain works: the track bounds the wrapper, `min-w-0` lets the wrapper
       * shrink, and `truncate` finally has a box narrower than the text to
       * clip against. The row still reads left-aligned because the flex
       * children sit at its start.
       */}
      <div className="flex min-w-0 items-center gap-2">
        <LogoMark className="ml-1 size-5 shrink-0 text-brand" />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          <SidebarToggleIcon className="h-5 w-5" />
        </Button>
        {/*
         * `min-w-0` is load-bearing, not belt-and-braces. This `<p>` is a flex
         * item, and a flex item's default `min-width: auto` floors it at its
         * own content width — so `truncate`'s `overflow: hidden` never gets a
         * box narrower than the text to clip against, and the name spills out
         * of the track into the mode-switcher instead of ellipsing. The
         * `min-w-0` on the wrapper above lets the *wrapper* shrink; only this
         * one lets the text inside it actually give way.
         */}
        <p className="min-w-0 truncate font-heading text-sm font-medium text-copy-primary">
          {projectName}
        </p>
      </div>

      {/*
       * The mode-switcher overflows by scrolling on its own axis, not by
       * wrapping, collapsing into a menu, or abbreviating labels.
       *
       * Six entries with "Architecture Interview" among them is more label than
       * a 3.5rem navbar can promise to fit next to a project name and Share, at
       * every window width. The three candidate answers, and why this one:
       *
       * - Wrapping is out on sight: the navbar's height is a layout token
       *   (`--editor-navbar-height`) that the floating sidebar, the Canvas
       *   toolbar, and the AI panel all offset themselves against. A second row
       *   would silently invalidate all of them.
       * - An overflow menu ("More…") hides destinations behind a disclosure and
       *   needs width measurement to decide what to hide. It also has to
       *   special-case the active route so the current mode never ends up
       *   inside the collapsed group — real complexity, for six flat links.
       * - Scrolling keeps every entry present, in one order, at one size. Tab
       *   order is untouched and the browser scrolls a focused link into view
       *   for free, so nothing here is keyboard-unreachable and there is no
       *   focus trap: it is a scroll container, not a widget.
       *
       * `justify-center-safe` is what makes it behave in both regimes — the row
       * stays optically centred while it fits, and falls back to start-aligned
       * once it does not, instead of centring the overflow and pushing Home off
       * the left edge into a region that cannot be scrolled back to.
       *
       * The scrollbar is hidden (`scrollbar-none`): a classic scrollbar gutter
       * would eat vertical space inside a fixed-height bar and shift the pills
       * off centre on the platforms that draw one. Scroll affordance instead
       * comes from the active entry being auto-centred (see the effect above),
       * plus trackpad, drag, and keyboard focus movement. `overscroll-x-contain`
       * stops a horizontal flick from being handed to the browser as a
       * back-navigation gesture once the row hits its end.
       *
       * The `px-1 py-1` padding is not decoration: the focus ring is drawn
       * outside the pill, and a scroll container clips on both axes. Without a
       * gutter the ring on the first and last entries would be shaved off.
       */}
      <nav
        ref={switcherRef}
        aria-label="Editor mode"
        className="flex min-w-0 items-center justify-center-safe gap-1 overflow-x-auto overscroll-x-contain scrollbar-none px-1 py-1"
      >
        {modes.map((mode) => {
          const isActive = pathname === mode.href
          return (
            <Link
              key={mode.href}
              href={mode.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                isActive
                  ? "bg-accent-dim text-brand"
                  : "text-copy-muted hover:bg-elevated hover:text-copy-primary"
              )}
            >
              {mode.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex items-center justify-self-end">
        <Button variant="outline" size="sm" onClick={onOpenShare}>
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </div>
    </header>
  )
}
