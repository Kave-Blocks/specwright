"use client"

import { Component, type ReactNode } from "react"

interface CanvasErrorBoundaryProps {
  /** Rendered when a Liveblocks connection error is caught. */
  fallback: ReactNode
  children: ReactNode
}

interface CanvasErrorBoundaryState {
  hasError: boolean
}

/**
 * Catches errors thrown while connecting to or syncing the Liveblocks room so
 * a canvas connection failure shows a fallback instead of crashing the editor.
 */
export class CanvasErrorBoundary extends Component<
  CanvasErrorBoundaryProps,
  CanvasErrorBoundaryState
> {
  state: CanvasErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): CanvasErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error("Liveblocks canvas connection error:", error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }

    return this.props.children
  }
}
