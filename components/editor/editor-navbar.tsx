"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"

import { Button } from "@/components/ui/button"

interface EditorNavbarProps {
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

export function EditorNavbar({
  isSidebarOpen,
  onToggleSidebar,
}: EditorNavbarProps) {
  const SidebarToggleIcon = isSidebarOpen ? PanelLeftClose : PanelLeftOpen

  return (
    <header className="fixed inset-x-0 top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-surface-border bg-surface px-3">
      <div className="flex items-center justify-self-start">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          <SidebarToggleIcon className="h-5 w-5" />
        </Button>
      </div>
      <div className="justify-self-center" />
      <div className="justify-self-end" />
    </header>
  )
}
