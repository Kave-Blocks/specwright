<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Application Building Context

Read the following files in order before implementing or making any architectural decision:

1. `context/project-overview.md` — product definition, goals, features, and scope
2. `context/architecture-context.md` — system structure, boundaries, storage model, and invariants
3. `context/ui-context.md` — theme, colors, typography, canvas design, and component conventions
4. `context/code-standards.md` — implementation rules and conventions
5. `context/ai-workflow-rules.md` — development workflow, scoping rules, and delivery approach
6. `context/progress-tracker.md` — current phase, the unit index (status + link to full detail for every unit), open questions, and architecture decisions

After each meaningful implementation change, record it in `context/progress/NN-name.md` and update that unit's row in `progress-tracker.md`'s `## Unit Index` — never append a new paragraph to `progress-tracker.md` itself. See `Recording Progress` in `context/ai-workflow-rules.md`.

If implementation changes the architecture, scope, or standards documented in the context files, update the relevant file before continuing.