import type { ReactNode } from "react"
import { FileText, Share2, Sparkles } from "lucide-react"

import { Logo } from "@/components/ui/logo"

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI Architecture Generation",
    description: "Describe your system, AI maps it to nodes and edges on a live canvas.",
  },
  {
    icon: Share2,
    title: "Real-time Collaboration",
    description: "Live cursors, presence indicators, and shared node editing across your team.",
  },
  {
    icon: FileText,
    title: "Instant Spec Generation",
    description: "Export a complete Markdown technical spec directly from the canvas graph.",
  },
]

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh grid-cols-1 bg-base lg:grid-cols-2">
      <aside className="hidden flex-col justify-between border-r border-surface-border bg-surface px-12 py-10 lg:flex xl:px-16">
        <Logo className="gap-3 text-lg" markClassName="size-8" />

        <div className="max-w-md space-y-10">
          <div className="space-y-5">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-copy-primary xl:text-5xl">
              Design systems at the speed of thought.
            </h1>
            <p className="text-base leading-relaxed text-copy-secondary">
              Describe your architecture in plain English. Specwright maps it to a
              shared canvas your whole team can refine in real time.
            </p>
          </div>

          <ul className="space-y-6">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-elevated text-brand">
                  <Icon className="size-5" />
                </span>
                <div className="space-y-1">
                  <p className="font-medium text-copy-primary">{title}</p>
                  <p className="text-sm leading-relaxed text-copy-muted">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-copy-faint">
          © 2026 Specwright. All rights reserved.
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-16">
        {children}
      </main>
    </div>
  )
}
