"use client"

import { createContext, useContext } from "react"

import { DEFAULT_CANVAS_TOOL, type CanvasTool } from "@/types/canvas"

/**
 * The tool that currently owns the canvas, published to the renderers *inside* the
 * flow. Node and edge renderers are React Flow's children, so they cannot reach
 * `CanvasFlow`'s state directly — but resizing is a select-tool gesture, and a node's
 * resize handles have to go quiet while any other tool owns the canvas.
 *
 * Defaults to `select` so a renderer mounted outside the provider behaves exactly as
 * it did before tools existed.
 */
const CanvasToolContext = createContext<CanvasTool>(DEFAULT_CANVAS_TOOL)

export const CanvasToolProvider = CanvasToolContext.Provider

/** The tool that currently owns the canvas. */
export function useActiveCanvasTool(): CanvasTool {
  return useContext(CanvasToolContext)
}
