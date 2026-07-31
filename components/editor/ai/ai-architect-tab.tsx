"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { AlertCircle, Bot, Loader2, Send } from "lucide-react"

import type { AiActivity } from "@/components/editor/ai/ai-activity-context"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { useAiChat, type AiChatMessage } from "@/hooks/use-ai-chat"
import { useDesignSubmit } from "@/hooks/use-design-submit"
import { useRoomReady } from "@/hooks/use-room-ready"
import { cn } from "@/lib/utils"

/** Prompt suggestions shown in the empty state. */
const STARTER_PROMPTS = [
  "Design an e-commerce backend",
  "Create a chat app architecture",
  "Build a CI/CD pipeline",
] as const

/**
 * Shown inline (not in the feed) — the one error the chat feed can't carry, by
 * definition: the write to the feed is what failed.
 */
const LOAD_ERROR_MESSAGE =
  "Couldn’t load the conversation. Reload the page to try again."

/** Status-strip line while the AI works but hasn't published any text yet. */
const WORKING_FALLBACK = "Specwright is working…"

interface AiArchitectTabProps {
  /** The room/project id the design task should generate into (room id ≡ project id). */
  projectId: string
  /** Shared AI activity (status feed + working state), visible to everyone. */
  aiActivity: AiActivity
}

/**
 * The "AI Architect" tab. This outer component exists only to hold the chat back
 * until the room's socket is connected.
 *
 * Liveblocks fetches a feed's first page over the WebSocket. A fetch issued
 * before the socket connects is dropped from the flush buffer, rejects after a
 * 5s timeout, and — because the feed resource is created with `autoRetry: false`
 * — that error is cached for the lifetime of the client. The panel mounts with
 * the workspace, well before the room connects (the auth endpoint has to check
 * Clerk, hit the database, and ensure the room and its feeds first), so mounting
 * the chat immediately meant the history *never* loaded, while writing new
 * messages still worked — a chat that looked permanently empty. The canvas's
 * status feed never hit this because it lives inside `ClientSideSuspense`, which
 * only renders once the room is live.
 */
export function AiArchitectTab({ projectId, aiActivity }: AiArchitectTabProps) {
  const isRoomReady = useRoomReady()

  if (!isRoomReady) {
    return (
      <div className="flex h-full items-center justify-center gap-2 px-6 text-xs text-copy-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Connecting to the room…</span>
      </div>
    )
  }

  return <AiArchitectChat projectId={projectId} aiActivity={aiActivity} />
}

/**
 * The chat itself: the room's shared conversation (the `ai-chat` Liveblocks feed,
 * so everyone sees every message) above an auto-resizing input.
 *
 * Submitting hands the prompt to `useDesignSubmit`, which publishes it to the
 * feed and starts the durable design task, tracking the run live: the input
 * stays disabled and the send button spins until it finishes, at which point
 * Specwright's reply is pushed to the feed. Progress text rides the separate
 * `ai-status-feed` (shown in the status strip above the input), so it never
 * lands in the chat — and the nodes and edges the task writes arrive on their
 * own through Liveblocks, which is why nothing here touches the canvas.
 */
function AiArchitectChat({ projectId, aiActivity }: AiArchitectTabProps) {
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const {
    messages,
    isLoading,
    error: loadError,
    selfId,
  } = useAiChat()
  const { send, busy: submitBusy, error, clearError } = useDesignSubmit(projectId)

  const isEmpty = messages.length === 0
  // A message needs a sender, so sending waits for the room connection.
  const canSend = selfId !== null
  // Busy while this client's request/run is in flight, OR any AI agent is
  // working in the room (shared presence) — so a collaborator's generation
  // locks the input too.
  const busy = submitBusy || aiActivity.isWorking

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" })
  }, [messages.length])

  async function handleSend(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy || !canSend) return
    clearError()
    const started = await send(trimmed)
    if (started) setInput("")
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter submits; Shift+Enter inserts a newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void handleSend(input)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ScrollArea className="flex-1">
        {isLoading && isEmpty ? (
          <div className="flex h-full items-center justify-center gap-2 px-6 py-10 text-xs text-copy-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Loading conversation…</span>
          </div>
        ) : isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-subtle text-ai-text">
              <Bot className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-copy-primary">
                Describe what you want to build
              </p>
              <p className="text-xs text-copy-muted">
                Specwright turns your prompt into a system architecture on the
                canvas.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  disabled={busy || !canSend}
                  className="rounded-full bg-subtle px-3 py-1.5 text-xs text-brand transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {messages.map((message) => (
              <ChatBubble
                key={message.id}
                message={message}
                isOwn={message.sender.id === selfId}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Status strip — the latest `ai-status-feed` line, only while a run is
       * active. Sits directly above the input, on the base background. */}
      {busy && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 border-t border-surface-border bg-base px-3 py-2 text-xs font-medium text-accent-green"
        >
          <span className="relative flex size-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-accent-green" />
          </span>
          <span className="truncate">
            {aiActivity.status?.text ?? WORKING_FALLBACK}
          </span>
        </div>
      )}

      <div className="border-t border-surface-border p-3">
        {(error ?? (loadError ? LOAD_ERROR_MESSAGE : null)) && (
          <p
            role="alert"
            className="mb-2 flex items-center gap-1.5 text-xs text-error"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error ?? LOAD_ERROR_MESSAGE}</span>
          </p>
        )}
        <div className="relative">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={busy ? "Specwright is working…" : "Message Specwright…"}
            aria-label="Message Specwright"
            disabled={busy}
            className="max-h-40 min-h-18 resize-none pr-12"
          />
          <Button
            type="button"
            size="icon-sm"
            onClick={() => handleSend(input)}
            disabled={busy || !canSend || input.trim().length === 0}
            aria-label="Send message"
            className="absolute right-2 bottom-2 bg-accent-green text-(--bg-base) hover:bg-accent-green/90"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          <p className="text-xs text-copy-muted">
            Prefer a guided flow?{" "}
            <Link
              href={`/editor/${projectId}/discovery`}
              className="text-brand hover:underline"
            >
              Discovery →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

/** Time-of-day label for a message, e.g. "9:41 AM". */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * One message in the shared room chat. Specwright's replies get the dark bubble;
 * everyone's prompts get the green one. The chat is collaborative, so a person's
 * message also carries who sent it — own messages sit on the right, a
 * collaborator's (and the AI's) on the left.
 */
function ChatBubble({
  message,
  isOwn,
}: {
  message: AiChatMessage
  isOwn: boolean
}) {
  const isAssistant = message.role === "assistant"
  const alignRight = isOwn && !isAssistant

  return (
    <div className={cn("flex flex-col gap-1", alignRight && "items-end")}>
      <div className="flex items-baseline gap-2 px-1">
        <span className="truncate text-xs font-medium text-copy-primary">
          {alignRight ? "You" : message.sender.name}
        </span>
        <span className="shrink-0 text-xs text-copy-faint">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm wrap-break-word whitespace-pre-wrap",
          isAssistant
            ? "border border-surface-border bg-elevated text-copy-primary"
            : "bg-accent-green text-(--bg-base)"
        )}
      >
        {message.content}
      </div>
    </div>
  )
}
