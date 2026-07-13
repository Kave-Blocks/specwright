"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useOthersMapped } from "@liveblocks/react/suspense"

/** A participant who currently has a given node or edge selected. */
export interface RemoteSelector {
  name: string
  color: string
}

interface RemoteSelectionValue {
  /** Node id -> participants who have it selected. */
  nodes: ReadonlyMap<string, RemoteSelector[]>
  /** Edge id -> participants who have it selected. */
  edges: ReadonlyMap<string, RemoteSelector[]>
}

const EMPTY_VALUE: RemoteSelectionValue = { nodes: new Map(), edges: new Map() }
const EMPTY_IDS: readonly string[] = []

const RemoteSelectionContext = createContext<RemoteSelectionValue>(EMPTY_VALUE)

/** The slice of another participant's presence that drives selection highlights. */
interface MappedSelection {
  name: string
  color: string
  nodes: readonly string[]
  edges: readonly string[]
}

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index])

const isSameSelection = (a: MappedSelection, b: MappedSelection): boolean =>
  a.name === b.name &&
  a.color === b.color &&
  sameIds(a.nodes, b.nodes) &&
  sameIds(a.edges, b.edges)

function add(
  map: Map<string, RemoteSelector[]>,
  id: string,
  selector: RemoteSelector
): void {
  const existing = map.get(id)
  if (existing) {
    existing.push(selector)
  } else {
    map.set(id, [selector])
  }
}

/**
 * Publishes every other participant's current selection to the canvas, so nodes
 * and edges can show who has them selected.
 *
 * Selection is read through `useOthersMapped` with an explicit equality check
 * rather than a bare `useOthers()`. That matters: presence also carries the
 * cursor, which updates many times a second, and an unselected `useOthers()`
 * here would re-render every node and edge on every remote mouse move. With the
 * mapped selector, this only re-renders when a selection actually changes.
 *
 * The resulting maps go through context, so the single subscription is shared by
 * all node and edge renderers instead of each one subscribing on its own.
 */
export function RemoteSelectionProvider({ children }: { children: ReactNode }) {
  const selections = useOthersMapped<MappedSelection>(
    (other) => ({
      name: other.info.name,
      color: other.info.color,
      // Presence written by non-browser participants (the AI agent) has no
      // `selection` at all, so fall back rather than trusting the type here.
      nodes: other.presence.selection?.nodes ?? EMPTY_IDS,
      edges: other.presence.selection?.edges ?? EMPTY_IDS,
    }),
    isSameSelection
  )

  const value = useMemo<RemoteSelectionValue>(() => {
    const nodes = new Map<string, RemoteSelector[]>()
    const edges = new Map<string, RemoteSelector[]>()

    for (const [, selection] of selections) {
      const selector: RemoteSelector = {
        name: selection.name,
        color: selection.color,
      }
      for (const id of selection.nodes) add(nodes, id, selector)
      for (const id of selection.edges) add(edges, id, selector)
    }

    return { nodes, edges }
  }, [selections])

  return (
    <RemoteSelectionContext.Provider value={value}>
      {children}
    </RemoteSelectionContext.Provider>
  )
}

/** Participants who have this node selected, or `undefined` when nobody does. */
export function useRemoteNodeSelectors(id: string): RemoteSelector[] | undefined {
  return useContext(RemoteSelectionContext).nodes.get(id)
}

/** Participants who have this edge selected, or `undefined` when nobody does. */
export function useRemoteEdgeSelectors(id: string): RemoteSelector[] | undefined {
  return useContext(RemoteSelectionContext).edges.get(id)
}
