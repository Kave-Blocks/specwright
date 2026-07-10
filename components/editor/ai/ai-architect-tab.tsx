"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { Bot, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

/** Prompt suggestions shown in the empty state. */
const STARTER_PROMPTS = [
  "Design an e-commerce backend",
  "Create a chat app architecture",
  "Build a CI/CD pipeline",
] as const

/**
 * Static stand-in reply. There is no AI/backend wired yet (see the sidebar
 * spec scope) — sending a message just echoes this placeholder so the
 * assistant bubble styling is exercised.
 */
const ASSISTANT_PLACEHOLDER =
  "AI responses are coming soon — this is a preview of the Architect chat."

/**
 * The "AI Architect" chat tab: a scrollable conversation area (with an empty
 * state + starter chips) above an auto-resizing input. UI only — no generation
 * logic.
 */
export function AiArchitectTab() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const messageIdRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  const isEmpty = messages.length === 0

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" })
  }, [messages.length])

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    const userId = `msg-${(messageIdRef.current += 1)}`
    const assistantId = `msg-${(messageIdRef.current += 1)}`

    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: trimmed },
      { id: assistantId, role: "assistant", content: ASSISTANT_PLACEHOLDER },
    ])
    setInput("")
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter submits; Shift+Enter inserts a newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      send(input)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ScrollArea className="flex-1">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-subtle text-ai-text">
              <Bot className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-copy-primary">
                Describe what you want to build
              </p>
              <p className="text-xs text-copy-muted">
                Ghost AI turns your prompt into a system architecture on the
                canvas.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  className="rounded-full bg-subtle px-3 py-1.5 text-xs text-brand transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-surface-border p-3">
        <div className="relative">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Ghost AI…"
            aria-label="Message Ghost AI"
            className="max-h-40 min-h-18 resize-none pr-12"
          />
          <Button
            type="button"
            size="icon-sm"
            onClick={() => send(input)}
            disabled={input.trim().length === 0}
            aria-label="Send message"
            className="absolute bottom-2 right-2 bg-brand text-white hover:bg-brand/90"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-copy-faint">
          <kbd className="font-sans">Enter</kbd> to send ·{" "}
          <kbd className="font-sans">Shift + Enter</kbd> for a new line
        </p>
      </div>
    </div>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm wrap-break-word whitespace-pre-wrap",
          isUser
            ? "border-2 border-brand/50 bg-accent-dim text-copy-primary"
            : "border border-surface-border bg-elevated text-brand"
        )}
      >
        {message.content}
      </div>
    </div>
  )
}
