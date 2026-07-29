"use client"

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
  const SidebarToggleIcon = isSidebarOpen ? PanelLeftClose : PanelLeftOpen

  const modes: EditorMode[] = [
    { label: "Home", href: `/editor/${roomId}` },
    { label: "Architecture Interview", href: `/editor/${roomId}/discovery` },
    { label: "Canvas", href: `/editor/${roomId}/canvas` },
    { label: "Specs", href: `/editor/${roomId}/specs` },
  ]

  return (
    <header className="fixed inset-x-0 top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-surface-border bg-surface px-3">
      <div className="flex min-w-0 items-center gap-2 justify-self-start">
        <LogoMark className="ml-1 size-5 shrink-0 text-brand" />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          <SidebarToggleIcon className="h-5 w-5" />
        </Button>
        <p className="truncate font-heading text-sm font-medium text-copy-primary">
          {projectName}
        </p>
      </div>

      <nav
        aria-label="Editor mode"
        className="flex items-center gap-1 justify-self-center"
      >
        {modes.map((mode) => {
          const isActive = pathname === mode.href
          return (
            <Link
              key={mode.href}
              href={mode.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
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
