"use client"

import { useMemo } from "react"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * Renders a generated spec's Markdown.
 *
 * `remark-gfm` is required, not cosmetic: tables, strikethrough, and task lists
 * are GitHub extensions rather than CommonMark, so without it a spec's tables
 * render as literal pipe characters in a paragraph.
 *
 * Raw HTML is **not** rendered — that would need `rehype-raw`, deliberately left
 * out. The document is LLM-authored, so any markup it emits is escaped to
 * visible text instead of being injected into the page.
 *
 * Every element is styled explicitly against the `globals.css` tokens, because
 * `@tailwindcss/typography` is not installed and the design system is dark-only:
 * a prose plugin's defaults would fight the palette in `ui-context.md`.
 */

/**
 * react-markdown hands every component the mdast `node` it came from. That is
 * not a DOM attribute — spreading it straight through renders a bogus
 * `node="[object Object]"` on the element — so it is dropped here.
 *
 * Deleting from a copy rather than destructuring a `node` binding keeps this
 * free of an unused variable, which the project's lint rules reject.
 */
function withoutNode<P extends object>(props: P): Omit<P, "node"> {
  const rest = { ...props }
  delete (rest as { node?: unknown }).node
  return rest
}

const COMPONENTS: Components = {
  // The spread comes first throughout, so the styling below always wins.
  h1: (props) => (
    <h1
      {...withoutNode(props)}
      className="mt-6 mb-3 font-heading text-lg font-medium text-copy-primary first:mt-0"
    />
  ),
  h2: (props) => (
    <h2
      {...withoutNode(props)}
      className="mt-6 mb-2 border-b border-surface-border pb-1.5 font-heading text-base font-medium text-copy-primary first:mt-0"
    />
  ),
  h3: (props) => (
    <h3
      {...withoutNode(props)}
      className="mt-5 mb-2 font-heading text-sm font-medium text-copy-secondary first:mt-0"
    />
  ),
  p: (props) => (
    <p
      {...withoutNode(props)}
      className="my-2 text-sm leading-relaxed text-copy-secondary"
    />
  ),
  ul: (props) => (
    <ul
      {...withoutNode(props)}
      className="my-2 list-disc space-y-1 pl-5 text-sm text-copy-secondary marker:text-copy-faint"
    />
  ),
  ol: (props) => (
    <ol
      {...withoutNode(props)}
      className="my-2 list-decimal space-y-1 pl-5 text-sm text-copy-secondary marker:text-copy-faint"
    />
  ),
  li: (props) => <li {...withoutNode(props)} className="leading-relaxed" />,
  strong: (props) => (
    <strong
      {...withoutNode(props)}
      className="font-medium text-copy-primary"
    />
  ),
  em: (props) => (
    <em {...withoutNode(props)} className="text-copy-primary italic" />
  ),
  a: (props) => (
    <a
      {...withoutNode(props)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand underline underline-offset-2 hover:text-brand/80"
    />
  ),
  blockquote: (props) => (
    <blockquote
      {...withoutNode(props)}
      className="my-3 border-l-2 border-subtle-border pl-3 text-sm text-copy-muted italic"
    />
  ),
  hr: (props) => <hr {...withoutNode(props)} className="my-5 border-surface-border" />,
  // One component serves both inline code and fenced blocks, and the two cannot be
  // told apart here: react-markdown only sets `language-*` when a fence carries an
  // info string, so a bare ``` fence — which LLM-authored specs emit constantly —
  // reaches this component looking exactly like inline code.
  //
  // So don't try. `code` always renders the inline pill, and `pre` resets its child
  // back to block styling below. A fenced block is the only thing that can produce a
  // <pre> (authored HTML is escaped, not rendered — see above), so that reset lands
  // on exactly the blocks and never on inline code.
  code: (props) => (
    <code
      {...withoutNode(props)}
      className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-xs text-brand"
    />
  ),
  // The `[&>code]` reset outranks the pill's own classes on specificity (child
  // combinator + class beats a bare class), so it wins regardless of source order.
  pre: (props) => (
    <pre
      {...withoutNode(props)}
      className="my-3 overflow-x-auto rounded-xl border border-surface-border bg-base p-3 [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-copy-secondary"
    />
  ),
  // A wide table scrolls inside its own container rather than widening the modal.
  table: (props) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-surface-border">
      <table
        {...withoutNode(props)}
        className="w-full border-collapse text-left text-xs"
      />
    </div>
  ),
  th: (props) => (
    <th
      {...withoutNode(props)}
      className="border-b border-surface-border bg-elevated px-3 py-2 font-medium text-copy-primary"
    />
  ),
  td: (props) => (
    <td
      {...withoutNode(props)}
      className="border-b border-surface-border px-3 py-2 text-copy-secondary"
    />
  ),
}

const PLUGINS = [remarkGfm]

/** The rendered body of one generated spec. */
export function SpecMarkdown({ content }: { content: string }) {
  // The component map and plugin list are static, so memoize on the content
  // alone: the dialog's re-renders (open/close animation, focus changes) then
  // don't re-parse the whole document.
  return useMemo(
    () => (
      <Markdown components={COMPONENTS} remarkPlugins={PLUGINS}>
        {content}
      </Markdown>
    ),
    [content]
  )
}
