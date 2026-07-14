/**
 * True when a keyboard event originates from a field the user is typing into
 * (input, textarea, select, or any contentEditable element).
 *
 * Every canvas keyboard binding is guarded by this, so shortcuts never hijack
 * normal text editing — a node label, an edge label, or the AI prompt box.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  )
}
