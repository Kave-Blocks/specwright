"use client"

import { Check, Link2, Loader2, Mail, Trash2 } from "lucide-react"
import { type FormEvent, useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { MemberRole, MemberView } from "@/lib/collaborators"
import { cn } from "@/lib/utils"

interface ShareDialogProps {
  open: boolean
  projectId: string
  /** Owners may invite/remove and copy the link; collaborators get a read-only list. */
  isOwner: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Share dialog for a project workspace. Owners can copy the workspace link,
 * invite collaborators by email, and remove them; collaborators see the
 * "people with access" list read-only. Members are fetched from the server and
 * enriched with Clerk display names and avatars.
 */
export function ShareDialog({
  open,
  projectId,
  isOwner,
  onOpenChange,
}: ShareDialogProps) {
  const [members, setMembers] = useState<MemberView[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [isInviting, setIsInviting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadMembers = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/collaborators`)
      if (!response.ok) {
        throw new Error(`Failed to load members (${response.status})`)
      }
      const data = (await response.json()) as { members: MemberView[] }
      setMembers(data.members)
    } catch (loadError) {
      console.error(loadError)
      setError("Could not load people with access.")
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  // Fetch the current list each time the dialog opens.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadMembers()
    }
  }, [open, loadMembers])

  // Reset transient state on close, then defer to the parent.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setEmail("")
      setError(null)
      setCopied(false)
    }
    onOpenChange(next)
  }

  async function handleInvite(event: FormEvent) {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || isInviting) return

    setIsInviting(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/collaborators`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        },
      )
      const data = (await response.json()) as {
        members?: MemberView[]
        error?: string
      }
      if (!response.ok) {
        setError(data.error ?? "Could not send the invite.")
        return
      }
      if (data.members) {
        setMembers(data.members)
      }
      setEmail("")
    } catch (inviteError) {
      console.error(inviteError)
      setError("Could not send the invite.")
    } finally {
      setIsInviting(false)
    }
  }

  async function handleRemove(collaboratorId: string) {
    if (removingId) return

    setRemovingId(collaboratorId)
    setError(null)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/collaborators/${collaboratorId}`,
        { method: "DELETE" },
      )
      const data = (await response.json()) as {
        members?: MemberView[]
        error?: string
      }
      if (!response.ok) {
        setError(data.error ?? "Could not remove the collaborator.")
        return
      }
      if (data.members) {
        setMembers(data.members)
      }
    } catch (removeError) {
      console.error(removeError)
      setError("Could not remove the collaborator.")
    } finally {
      setRemovingId(null)
    }
  }

  async function handleCopyLink() {
    const link = `${window.location.origin}/editor/${projectId}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (copyError) {
      console.error(copyError)
      setError("Could not copy the link.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>
            {isOwner
              ? "Invite collaborators, copy the workspace link, and manage access."
              : "You have collaborator access to this project."}
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-surface-border bg-surface p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-copy-primary">
                  Workspace link
                </p>
                <p className="mt-1 text-xs text-copy-muted">
                  Share a direct link with teammates after you grant them
                  access.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleCopyLink}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-state-success" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {copied ? "Copied!" : "Copy link"}
              </Button>
            </div>

            <form
              onSubmit={handleInvite}
              className="flex items-center gap-2 rounded-2xl border border-surface-border bg-surface p-2"
            >
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-copy-muted" />
                <input
                  type="email"
                  autoComplete="off"
                  aria-label="Invite by email"
                  placeholder="teammate@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-9 w-full rounded-xl bg-transparent pr-3 pl-9 text-sm text-copy-primary outline-none placeholder:text-copy-muted"
                />
              </div>
              <Button type="submit" disabled={!email.trim() || isInviting}>
                {isInviting && <Loader2 className="h-4 w-4 animate-spin" />}
                Invite
              </Button>
            </form>
          </>
        )}

        {error && <p className="text-sm text-state-error">{error}</p>}

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium text-copy-primary">
              People with access
            </p>
            <span className="text-xs text-copy-muted">
              {members.length} total
            </span>
          </div>

          <ScrollArea className="max-h-64">
            {isLoading && members.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-copy-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <ul className="flex flex-col gap-2 pr-1">
                {members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    canRemove={isOwner && member.role === "collaborator"}
                    isRemoving={removingId === member.id}
                    onRemove={() => handleRemove(member.id)}
                  />
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface MemberRowProps {
  member: MemberView
  canRemove: boolean
  isRemoving: boolean
  onRemove: () => void
}

function MemberRow({ member, canRemove, isRemoving, onRemove }: MemberRowProps) {
  const fallback = member.role === "owner" ? "Project owner" : "Collaborator"
  const primaryLabel = member.name ?? member.email ?? fallback
  const showEmailLine = Boolean(member.name && member.email)

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-surface-border bg-surface px-3 py-2.5">
      <MemberAvatar member={member} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-copy-primary">
            {primaryLabel}
          </p>
          <RoleBadge role={member.role} />
        </div>
        {showEmailLine && (
          <p className="truncate text-xs text-copy-muted">{member.email}</p>
        )}
      </div>
      {canRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={isRemoving}
          aria-label={`Remove ${member.email ?? "collaborator"}`}
        >
          {isRemoving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      )}
    </li>
  )
}

/**
 * Access-level pill. The owner reads as brand-accented; collaborators get a
 * muted gray label. Role changes aren't editable yet — this is a label only.
 */
function RoleBadge({ role }: { role: MemberRole }) {
  const isOwner = role === "owner"
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase",
        isOwner
          ? "border-brand/30 bg-accent-dim text-brand"
          : "border-subtle-border text-copy-muted",
      )}
    >
      {isOwner ? "Owner" : "Collaborator"}
    </span>
  )
}

/** Circular avatar: Clerk image when available, otherwise an initial. */
function MemberAvatar({ member }: { member: MemberView }) {
  const initial = (member.name ?? member.email ?? "?")
    .trim()
    .charAt(0)
    .toUpperCase()

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-subtle text-xs font-medium text-copy-secondary">
      {member.imageUrl ? (
        // Clerk avatar URLs are external and unoptimized; a plain img avoids
        // configuring a remote-image loader for third-party hosts.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.imageUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  )
}
