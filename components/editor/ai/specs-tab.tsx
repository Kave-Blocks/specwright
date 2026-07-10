"use client"

import { Download, FileText, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

/** Static demo spec shown until real generation is wired up. */
const DEMO_SPEC = {
  title: "E-commerce Backend Spec",
  snippet:
    "Microservices for catalog, cart, and checkout with an event-driven order pipeline, Postgres storage, and a Redis cache layer.",
}

/**
 * The "Specs" tab: a Generate button above a single static demo spec card.
 * UI only — generation and downloads are not wired yet.
 */
export function SpecsTab() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="p-3">
        <Button
          type="button"
          className="w-full bg-brand text-white hover:bg-brand/90"
        >
          <Sparkles className="h-4 w-4" />
          Generate Spec
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 px-3 pb-3">
          <SpecCard title={DEMO_SPEC.title} snippet={DEMO_SPEC.snippet} />
        </div>
      </ScrollArea>
    </div>
  )
}

function SpecCard({ title, snippet }: { title: string; snippet: string }) {
  return (
    <article className="rounded-xl border border-surface-border bg-elevated p-3">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-brand">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-copy-primary">
            {title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-copy-muted">{snippet}</p>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button variant="outline" size="sm" disabled aria-label="Download spec">
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
      </div>
    </article>
  )
}
