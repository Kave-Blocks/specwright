import Link from "next/link"
import { ArrowLeft, Lock } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Full-screen state shown when a project is missing or the current user has no
 * access to it. Rendered directly by the `/editor/[roomId]` server component,
 * so it carries no chrome of its own.
 */
export function AccessDenied() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-elevated">
        <Lock className="h-8 w-8 text-copy-muted" />
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-xl font-medium text-copy-primary">
          Access denied
        </h1>
        <p className="max-w-sm text-sm text-copy-muted">
          This project doesn&apos;t exist, or you don&apos;t have permission to
          open it.
        </p>
      </div>

      <Link
        href="/editor"
        className={cn(buttonVariants({ variant: "outline" }))}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to projects
      </Link>
    </div>
  )
}
