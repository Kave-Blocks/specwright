"use client"

import { createContext, useContext } from "react"

import type { UseProjectActions } from "@/hooks/use-project-actions"

const ProjectActionsContext = createContext<UseProjectActions | null>(null)

export function ProjectActionsProvider({
  value,
  children,
}: {
  value: UseProjectActions
  children: React.ReactNode
}) {
  return (
    <ProjectActionsContext.Provider value={value}>
      {children}
    </ProjectActionsContext.Provider>
  )
}

export function useProjectActionsContext(): UseProjectActions {
  const context = useContext(ProjectActionsContext)
  if (!context) {
    throw new Error(
      "useProjectActionsContext must be used within a ProjectActionsProvider"
    )
  }
  return context
}
