"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRealtimeRun } from "@trigger.dev/react-hooks"
import {
  AlertCircle,
  Download,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react"

import { SpecMarkdown } from "@/components/editor/ai/spec-markdown"
import { useCanvasGraph } from "@/components/editor/canvas/canvas-graph-context"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAiChat } from "@/hooks/use-ai-chat"
import { useProjectSpecs } from "@/hooks/use-project-specs"
import { useRoomReady } from "@/hooks/use-room-ready"
import { downloadSpec } from "@/lib/spec-download"
import {
  MAX_CHAT_MESSAGES,
  MAX_EDGES,
  MAX_NODES,
} from "@/lib/spec-agent/payload"
import { isFinishedRunStatus } from "@/lib/trigger-run"
import { cn } from "@/lib/utils"
import type { generateSpec } from "@/trigger/generate-spec"
import type { ProjectSpecSummary } from "@/types/specs"
import { specDownloadUrl } from "@/types/specs"

const EMPTY_CANVAS_ERROR =
  "Add some nodes to the canvas before generating a spec."
const TOO_LARGE_ERROR =
  "This canvas is too large to turn into a spec. Try trimming it down."
const START_ERROR = "Couldn’t start the spec. Please try again."
const RUN_FAILED_ERROR = "Specwright couldn’t finish the spec. Please try again."
const CONTENT_ERROR = "Couldn’t load this spec. Please try again."

/** Status line while a spec run is in flight but has published nothing yet. */
const WORKING_FALLBACK = "Specwright is working…"

/** The spec run this client is tracking. */
interface ActiveRun {
  runId: string
  /** Run-scoped read token from `POST /api/ai/spec/token`. */
  token: string
}

/** e.g. "Jul 12, 2026 at 9:41 AM". */
function formatSpecDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * The `/editor/[roomId]/specs` route: a list of the project's specs on the
 * left, an inline Markdown preview of the selected one on the right.
 *
 * Generating and listing behave exactly as they did in the former sidebar
 * `specs-tab.tsx` — only the preview changed, from a modal (`SpecPreviewDialog`)
 * to this inline pane, reusing `spec-markdown.tsx`'s rendering rather than
 * dialog chrome.
 */
export function SpecsView({ projectId }: { projectId: string }) {
  const { specs, isLoading, error: listError, refresh } = useProjectSpecs(projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Derived, not synced: falling back to the newest spec (`specs[0]`, the list
  // is already newest-first) whenever nothing is explicitly selected — or the
  // explicit selection disappeared from a refreshed list — needs no effect,
  // since it's a pure function of `specs` and `selectedId` on every render.
  const selected =
    specs.find((spec) => spec.id === selectedId) ?? specs[0] ?? null

  return (
    <div className="flex h-full flex-1 overflow-hidden pl-(--canvas-inset-left,0px) transition-[padding-left] duration-200 ease-out">
      <div className="flex w-80 shrink-0 flex-col overflow-hidden border-r border-surface-border">
        <div className="p-3">
          <GenerateSpecButton projectId={projectId} onGenerated={refresh} />
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 px-3 pb-3">
            {isLoading && specs.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-copy-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Loading specs…</span>
              </div>
            ) : listError ? (
              <p
                role="alert"
                className="flex items-center justify-center gap-1.5 py-10 text-xs text-error"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{listError}</span>
              </p>
            ) : specs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-subtle text-brand">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-copy-primary">
                    No specs yet
                  </p>
                  <p className="text-xs text-copy-muted">
                    Generate one to turn your canvas into a technical spec.
                  </p>
                </div>
              </div>
            ) : (
              specs.map((spec) => (
                <SpecCard
                  key={spec.id}
                  spec={spec}
                  projectId={projectId}
                  isSelected={spec.id === selected?.id}
                  onSelect={() => setSelectedId(spec.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {selected ? (
          <SpecPreviewPane projectId={projectId} spec={selected} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-subtle text-copy-muted">
              <FileText className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-copy-primary">
                No spec selected
              </p>
              <p className="text-xs text-copy-muted">
                Generate a spec, or pick one from the list to preview it here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * One spec in the list — click to preview it inline on the right, or download
 * it directly. The card is the button (so Enter/Space select it), and the
 * download control is a sibling rather than a nested button — nesting one
 * interactive element inside another is invalid and breaks keyboard
 * navigation.
 */
function SpecCard({
  spec,
  projectId,
  isSelected,
  onSelect,
}: {
  spec: ProjectSpecSummary
  projectId: string
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border transition-colors",
        isSelected
          ? "border-brand bg-accent-dim"
          : "border-surface-border bg-elevated hover:border-subtle-border"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={isSelected}
        aria-label={`Preview ${spec.filename}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            isSelected ? "bg-surface text-brand" : "bg-subtle text-brand"
          )}
        >
          <FileText className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-sm font-medium",
              isSelected ? "text-brand" : "text-copy-primary"
            )}
          >
            {spec.filename}
          </span>
          <span className="mt-0.5 block truncate text-xs text-copy-muted">
            {formatSpecDate(spec.createdAt)}
          </span>
        </span>
      </button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => downloadSpec(projectId, spec.id, spec.filename)}
        aria-label={`Download ${spec.filename}`}
        className="mr-3 shrink-0 text-copy-muted hover:text-copy-primary"
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  )
}

/** The selected spec's Markdown, fetched on selection and dropped on deselect. */
function SpecPreviewPane({
  projectId,
  spec,
}: {
  projectId: string
  spec: ProjectSpecSummary
}) {
  const { content, isLoading, error } = useSpecContent(projectId, spec.id)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-surface-border px-5 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-copy-primary">
            {spec.filename}
          </p>
          <p className="text-xs text-copy-muted">
            Generated {formatSpecDate(spec.createdAt)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => downloadSpec(projectId, spec.id, spec.filename)}
          className="shrink-0 bg-brand text-white hover:bg-brand/90"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
      </div>

      <ScrollArea className="flex-1 overflow-hidden">
        <div className="px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-copy-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Loading spec…</span>
            </div>
          ) : error ? (
            <p
              role="alert"
              className="flex items-center justify-center gap-1.5 py-12 text-xs text-error"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          ) : (
            <SpecMarkdown content={content ?? ""} />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

interface SpecContent {
  content: string | null
  isLoading: boolean
  error: string | null
}

/**
 * Fetch one spec's Markdown through the access-checked download route — the
 * only endpoint a client may read a spec through. Its `Content-Disposition:
 * attachment` only governs a browser *navigation*; a `fetch` reads the body as
 * text, so no Blob URL is ever touched from here and no second route is
 * needed.
 *
 * The content lives in this hook's state, which drops it the moment the
 * selection changes (a fresh `specId` re-runs the effect).
 */
function useSpecContent(projectId: string, specId: string): SpecContent {
  const [content, setContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(specDownloadUrl(projectId, specId), {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Spec fetch failed (${response.status})`)
        }

        setContent(await response.text())
      } catch (fetchError) {
        // A superseded request is aborted on purpose — not an error.
        if (controller.signal.aborted) return
        console.error(fetchError)
        setError(CONTENT_ERROR)
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [projectId, specId])

  return { content, isLoading, error }
}

/**
 * Gate the generate action on the room connection: it reads the room's `ai-chat`
 * feed for context, and a feed read issued before the socket connects fails
 * permanently (see {@link useRoomReady}). Until then the button is inert.
 */
function GenerateSpecButton({
  projectId,
  onGenerated,
}: {
  projectId: string
  onGenerated: () => void
}) {
  const isRoomReady = useRoomReady()

  if (!isRoomReady) {
    return (
      <Button type="button" disabled className="w-full bg-brand text-white">
        <Loader2 className="h-4 w-4 animate-spin" />
        Connecting…
      </Button>
    )
  }

  return <GenerateSpecAction projectId={projectId} onGenerated={onGenerated} />
}

/**
 * Kick off `generate-spec` from the canvas the user is looking at, and track the
 * run to completion.
 *
 * The graph is read from the canvas bridge at click time (never held in state),
 * and the conversation from the shared `ai-chat` feed — the two inputs the task
 * writes a spec from. Progress rides on the **run's own metadata**, not on the
 * `ai-status-feed`: a spec is written for the person who asked for it, so only
 * this client tracks it (that is also why the design agent's shared status strip
 * has no equivalent here).
 */
function GenerateSpecAction({
  projectId,
  onGenerated,
}: {
  projectId: string
  onGenerated: () => void
}) {
  const { graphRef } = useCanvasGraph()
  const { messages } = useAiChat()
  const [pending, setPending] = useState(false)
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Guards the settle, so a run is only ever finished once. */
  const settledRunRef = useRef<string | null>(null)

  // Keyed by run id so a finished run's cached state can't settle the next one
  // instantly; idle (and quiet about the absent token) while nothing is running.
  const { run, error: runError } = useRealtimeRun<typeof generateSpec>(
    activeRun?.runId,
    {
      accessToken: activeRun?.token,
      enabled: activeRun !== null,
      id: activeRun?.runId,
      // The payload is the canvas we just sent — don't ship it back.
      skipColumns: ["payload"],
    }
  )

  const busy = pending || activeRun !== null

  const settle = useCallback(
    (failed: boolean) => {
      if (failed) setError(RUN_FAILED_ERROR)
      // The task persists the spec before it completes, so by now the new row
      // exists — reload the list to pick it up.
      else onGenerated()
      setActiveRun(null)
    },
    [onGenerated]
  )

  // Close the run out once it finishes. Deliberately not `useRealtimeRun`'s
  // `onComplete`, which fires at most once per mount — a second generation in
  // the same session would never settle and the button would stay disabled.
  useEffect(() => {
    if (!activeRun) return
    if (settledRunRef.current === activeRun.runId) return

    const isFinished =
      run?.id === activeRun.runId && isFinishedRunStatus(run.status)
    // A dropped subscription also ends tracking — otherwise a network blip would
    // leave the button disabled forever.
    if (!isFinished && !runError) return

    const runId = activeRun.runId
    const failed = Boolean(runError) || run?.status !== "COMPLETED"

    // Deferred so the settle never sets state synchronously inside the effect.
    // The guard is claimed inside the timer, not before it: a later realtime
    // update would otherwise cancel this timer while the guard already read as
    // settled, and the run would hang.
    const timer = setTimeout(() => {
      settledRunRef.current = runId
      settle(failed)
    }, 0)
    return () => clearTimeout(timer)
  }, [activeRun, run, runError, settle])

  async function generate() {
    if (busy) return

    const { nodes, edges } = graphRef.current
    if (nodes.length === 0) {
      setError(EMPTY_CANVAS_ERROR)
      return
    }
    if (nodes.length > MAX_NODES || edges.length > MAX_EDGES) {
      // Surfaced here rather than as a bare 400: silently truncating the graph
      // would produce a spec that describes a canvas the user never drew.
      setError(TOO_LARGE_ERROR)
      return
    }

    setPending(true)
    setError(null)

    try {
      // Nodes, edges, and messages go over verbatim — the request schema narrows
      // them server-side to the fields the model reasons about. Only the message
      // count is bounded here, since a long-running room would otherwise exceed
      // the cap and be rejected outright; the most recent turns are the relevant
      // ones.
      const response = await fetch("/api/ai/spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: projectId,
          chatHistory: messages.slice(-MAX_CHAT_MESSAGES),
          nodes,
          edges,
        }),
      })
      if (!response.ok) {
        throw new Error(`Spec request failed (${response.status})`)
      }

      const { runId } = (await response.json()) as { runId?: string }
      if (!runId) {
        throw new Error("Spec response is missing the run id")
      }

      // The trigger route returns only the run id; the token is minted by its
      // own route (scoped to this run, for an hour).
      const tokenResponse = await fetch("/api/ai/spec/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      })
      if (!tokenResponse.ok) {
        throw new Error(`Spec token failed (${tokenResponse.status})`)
      }

      const { token } = (await tokenResponse.json()) as { token?: string }
      if (!token) {
        throw new Error("Spec token response is missing the token")
      }

      setActiveRun({ runId, token })
    } catch (generateError) {
      console.error(generateError)
      setError(START_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={() => void generate()}
        disabled={busy}
        className="w-full bg-brand text-white hover:bg-brand/90"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {busy ? "Generating…" : "Generate Spec"}
      </Button>

      {activeRun && (
        <p
          role="status"
          aria-live="polite"
          className="truncate px-1 text-xs text-copy-muted"
        >
          {runStatusText(run?.metadata)}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-center gap-1.5 px-1 text-xs text-error"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

/**
 * The run's latest status line. Metadata crosses the network, so it is checked
 * rather than trusted — an unexpected shape falls back to a generic line.
 */
function runStatusText(metadata: unknown): string {
  if (typeof metadata !== "object" || metadata === null) return WORKING_FALLBACK
  const text = (metadata as { text?: unknown }).text
  return typeof text === "string" && text.length > 0 ? text : WORKING_FALLBACK
}
