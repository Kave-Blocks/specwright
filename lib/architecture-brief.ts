/**
 * The guided architecture interview: its question catalog, its answer model, and
 * the deterministic composer that turns answers into a Markdown project brief.
 *
 * This module is **pure** — no React, no Liveblocks, no `@xyflow/react`, no
 * model call. It is imported by a client component, so it follows the same
 * bundle-coupling discipline as `lib/spec-agent/payload.ts`: nothing here may
 * drag a heavy runtime dependency into the sidebar, and `composeBrief` is a
 * plain function that can be exercised without a browser.
 *
 * Every option set is declared `as const` and its key union is *derived* from
 * that array, so adding an option is a one-line change: the type, the chips the
 * UI renders, and the label the composer prints all follow from the same
 * literal. There is no second place to update and therefore nothing to drift.
 */

/** One selectable option: the bounded value stored, and the text shown. */
interface BriefOption {
  readonly value: string
  readonly label: string
}

/* -------------------------------------------------------------------------- */
/* Option sets                                                                 */
/* -------------------------------------------------------------------------- */

const ACTOR_OPTIONS = [
  { value: "end-users", label: "End users" },
  { value: "internal-staff", label: "Internal staff" },
  { value: "admins", label: "Admins" },
  { value: "other-systems", label: "Other systems" },
] as const

const SCALE_TIER_OPTIONS = [
  { value: "prototype", label: "Prototype (<1k users)", phrase: "prototype" },
  { value: "growing", label: "Growing (1k–100k)", phrase: "growing" },
  { value: "large", label: "Large (100k–1M+)", phrase: "large-scale" },
  { value: "massive", label: "Massive (1M+)", phrase: "massive-scale" },
] as const

const GROWTH_OPTIONS = [
  { value: "flat", label: "Flat" },
  { value: "steady", label: "Steady" },
  { value: "spiky", label: "Spiky / bursty" },
] as const

const DATA_SHAPE_OPTIONS = [
  { value: "relational", label: "Relational" },
  { value: "document", label: "Document" },
  { value: "key-value", label: "Key-value" },
  { value: "graph", label: "Graph" },
  { value: "time-series", label: "Time-series" },
  { value: "files", label: "Files / blobs" },
] as const

const CONSISTENCY_OPTIONS = [
  { value: "strong", label: "Strong" },
  { value: "eventual", label: "Eventual" },
] as const

const LATENCY_OPTIONS = [
  { value: "live", label: "Live (push / streaming)", phrase: "live updates" },
  { value: "fast", label: "Fast (<1s)", phrase: "sub-second responses" },
  { value: "normal", label: "Normal (a few seconds)", phrase: "normal latency" },
  { value: "batch", label: "Batch (minutes+)", phrase: "batch processing" },
] as const

const INTEGRATION_OPTIONS = [
  { value: "auth", label: "Auth / identity" },
  { value: "payments", label: "Payments" },
  { value: "email-sms", label: "Email / SMS" },
  { value: "file-storage", label: "File storage" },
  { value: "external-apis", label: "External APIs" },
  { value: "internal-systems", label: "Internal systems" },
] as const

const AVAILABILITY_OPTIONS = [
  { value: "best-effort", label: "Best effort", phrase: "best-effort uptime" },
  { value: "high", label: "High (99.9%)", phrase: "high availability" },
  {
    value: "critical",
    label: "Critical (99.99%+)",
    phrase: "critical availability",
  },
] as const

const COMPLIANCE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "pii-gdpr", label: "PII / GDPR" },
  { value: "hipaa", label: "HIPAA" },
  { value: "pci", label: "PCI" },
  { value: "other", label: "Other" },
] as const

const PRIORITY_OPTIONS = [
  { value: "simple", label: "Keep it simple" },
  { value: "balanced", label: "Balanced" },
  { value: "speed", label: "Ship fast" },
  { value: "scale", label: "Built to scale" },
] as const

const BUDGET_OPTIONS = [
  { value: "tight", label: "Tight" },
  { value: "moderate", label: "Moderate" },
  { value: "flexible", label: "Flexible" },
] as const

export type ActorKey = (typeof ACTOR_OPTIONS)[number]["value"]
export type ScaleTierKey = (typeof SCALE_TIER_OPTIONS)[number]["value"]
export type GrowthKey = (typeof GROWTH_OPTIONS)[number]["value"]
export type DataShapeKey = (typeof DATA_SHAPE_OPTIONS)[number]["value"]
export type ConsistencyKey = (typeof CONSISTENCY_OPTIONS)[number]["value"]
export type LatencyKey = (typeof LATENCY_OPTIONS)[number]["value"]
export type IntegrationKey = (typeof INTEGRATION_OPTIONS)[number]["value"]
export type AvailabilityKey = (typeof AVAILABILITY_OPTIONS)[number]["value"]
export type ComplianceKey = (typeof COMPLIANCE_OPTIONS)[number]["value"]
export type PriorityKey = (typeof PRIORITY_OPTIONS)[number]["value"]
export type BudgetKey = (typeof BUDGET_OPTIONS)[number]["value"]

/* -------------------------------------------------------------------------- */
/* Answers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every answer the interview can collect, flat rather than nested per question:
 * a step renders a slice of these keys, and the composer reads them all. Free
 * text is `string`; a single-select is a literal union; a multi-select is a
 * readonly array of one.
 *
 * That three-way split is not cosmetic — {@link FreeTextKey}, {@link SingleKey},
 * and {@link MultiKey} below derive the field kinds *from* this interface, so a
 * catalog entry can never point a chip group at a free-text answer.
 */
export interface BriefAnswers {
  idea: string
  actors: readonly ActorKey[]
  scaleTier: ScaleTierKey
  growth: GrowthKey
  entities: string
  dataShapes: readonly DataShapeKey[]
  consistency: ConsistencyKey
  latency: LatencyKey
  integrations: readonly IntegrationKey[]
  integrationNotes: string
  availability: AvailabilityKey
  compliance: readonly ComplianceKey[]
  teamSize: string
  stack: string
  priority: PriorityKey
  budget: BudgetKey
  mandates: string
  outOfScope: string
}

/**
 * What every question is worth when it is skipped. Skipping is always allowed —
 * nothing in the interview is required — so every key needs a sane default, and
 * every default that survives to composition is disclosed under `## Assumptions`
 * rather than applied silently.
 */
export const DEFAULT_ANSWERS: BriefAnswers = {
  idea: "",
  actors: [],
  scaleTier: "growing",
  growth: "steady",
  entities: "",
  dataShapes: [],
  consistency: "strong",
  latency: "normal",
  integrations: [],
  integrationNotes: "",
  availability: "high",
  compliance: [],
  teamSize: "",
  stack: "",
  priority: "balanced",
  budget: "moderate",
  mandates: "",
  outOfScope: "",
}

/** Keys whose answer is unbounded human text (`string`, not a literal union). */
export type FreeTextKey = {
  [K in keyof BriefAnswers]: string extends BriefAnswers[K] ? K : never
}[keyof BriefAnswers]

/** Keys whose answer is exactly one option from a fixed set. */
export type SingleKey = {
  [K in keyof BriefAnswers]: BriefAnswers[K] extends string
    ? string extends BriefAnswers[K]
      ? never
      : K
    : never
}[keyof BriefAnswers]

/** Keys whose answer is any number of options from a fixed set. */
export type MultiKey = {
  [K in keyof BriefAnswers]: BriefAnswers[K] extends readonly string[]
    ? K
    : never
}[keyof BriefAnswers]

/* -------------------------------------------------------------------------- */
/* Question catalog                                                            */
/* -------------------------------------------------------------------------- */

interface TextFieldSpec {
  readonly kind: "text"
  readonly key: FreeTextKey
  readonly label: string
  readonly placeholder: string
  /** Render as a multi-line box rather than a single-line input. */
  readonly multiline?: boolean
}

interface SingleFieldSpec {
  readonly kind: "single"
  readonly key: SingleKey
  readonly label: string
  readonly options: readonly BriefOption[]
}

interface MultiFieldSpec {
  readonly kind: "multi"
  readonly key: MultiKey
  readonly label: string
  readonly options: readonly BriefOption[]
}

export type BriefField = TextFieldSpec | SingleFieldSpec | MultiFieldSpec

export interface BriefQuestion {
  readonly id: string
  /** Step heading, e.g. "What are you building?". */
  readonly title: string
  /** Help text under the heading. */
  readonly help: string
  /** Markdown section this question's answers are printed under. */
  readonly section: string
  readonly fields: readonly BriefField[]
  /** Optional questions come after the seven core ones and are clearly marked. */
  readonly optional?: boolean
}

/**
 * The seven core questions plus one optional eighth, in the order they are
 * asked. `section` doubles as the `##` heading `composeBrief` prints under, so
 * the interview and the brief cannot fall out of order with each other.
 */
export const BRIEF_QUESTIONS: readonly BriefQuestion[] = [
  {
    id: "scope",
    title: "What are you building, and who uses it?",
    help: "One or two sentences is plenty. Pick every kind of user that applies.",
    section: "Users & Scope",
    fields: [
      {
        kind: "text",
        key: "idea",
        label: "What are you building?",
        placeholder: "A collaborative design tool for small product teams…",
        multiline: true,
      },
      {
        kind: "multi",
        key: "actors",
        label: "Who uses it?",
        options: ACTOR_OPTIONS,
      },
    ],
  },
  {
    id: "scale",
    title: "How big does it need to get?",
    help: "Scale drives almost every structural decision — be honest, not aspirational.",
    section: "Scale",
    fields: [
      {
        kind: "single",
        key: "scaleTier",
        label: "Expected users",
        options: SCALE_TIER_OPTIONS,
      },
      {
        kind: "single",
        key: "growth",
        label: "Growth pattern",
        options: GROWTH_OPTIONS,
      },
    ],
  },
  {
    id: "data",
    title: "What data does it hold?",
    help: "Name the core things the system stores, then how they are shaped.",
    section: "Data",
    fields: [
      {
        kind: "text",
        key: "entities",
        label: "Core entities",
        placeholder: "Users, projects, documents, comments…",
        multiline: true,
      },
      {
        kind: "multi",
        key: "dataShapes",
        label: "Data shapes",
        options: DATA_SHAPE_OPTIONS,
      },
      {
        kind: "single",
        key: "consistency",
        label: "Consistency",
        options: CONSISTENCY_OPTIONS,
      },
    ],
  },
  {
    id: "realtime",
    title: "How fresh does the data need to be?",
    help: "How quickly a change made in one place has to show up in another.",
    section: "Real-time",
    fields: [
      {
        kind: "single",
        key: "latency",
        label: "Freshness",
        options: LATENCY_OPTIONS,
      },
    ],
  },
  {
    id: "integrations",
    title: "What does it connect to?",
    help: "Third-party services and internal systems it has to talk to.",
    section: "Integrations",
    fields: [
      {
        kind: "multi",
        key: "integrations",
        label: "Services",
        options: INTEGRATION_OPTIONS,
      },
      {
        kind: "text",
        key: "integrationNotes",
        label: "Anything specific?",
        placeholder: "Stripe, Clerk, an internal billing API…",
        multiline: true,
      },
    ],
  },
  {
    id: "reliability",
    title: "How reliable and regulated is it?",
    help: "What breaking costs you, and what rules the data comes with.",
    section: "Reliability & Compliance",
    fields: [
      {
        kind: "single",
        key: "availability",
        label: "Availability target",
        options: AVAILABILITY_OPTIONS,
      },
      {
        kind: "multi",
        key: "compliance",
        label: "Compliance",
        options: COMPLIANCE_OPTIONS,
      },
    ],
  },
  {
    id: "constraints",
    title: "What are you working with?",
    help: "The team, the stack you'd rather stay on, and what you optimise for.",
    section: "Constraints",
    fields: [
      {
        kind: "text",
        key: "teamSize",
        label: "Team size",
        placeholder: "2 engineers",
      },
      {
        kind: "text",
        key: "stack",
        label: "Preferred stack / cloud",
        placeholder: "Next.js on Vercel, Postgres…",
        multiline: true,
      },
      {
        kind: "single",
        key: "priority",
        label: "Priority",
        options: PRIORITY_OPTIONS,
      },
      {
        kind: "single",
        key: "budget",
        label: "Budget",
        options: BUDGET_OPTIONS,
      },
    ],
  },
  {
    id: "mandates",
    title: "Anything mandatory, or explicitly out of scope?",
    help: "Hard requirements the design must honour, and things it should not try to solve.",
    section: "Mandates & Out of Scope",
    optional: true,
    fields: [
      {
        kind: "text",
        key: "mandates",
        label: "Hard mandates",
        placeholder: "Must run on AWS; must reuse the existing auth service…",
        multiline: true,
      },
      {
        kind: "text",
        key: "outOfScope",
        label: "Out of scope",
        placeholder: "No mobile apps; no self-hosted deployment…",
        multiline: true,
      },
    ],
  },
]

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Cap on any single human-typed field once it reaches the brief.
 *
 * Truncate, never reject — the same stance `lib/spec-agent/payload.ts` takes for
 * node labels, and for the same reason: these boxes have no `maxlength`, so
 * refusing an over-long one would fail an otherwise legitimate interview. The
 * cap exists so the composed prompt stays bounded no matter what was pasted in.
 */
export const MAX_FREE_TEXT_LENGTH = 400

/** Shown in a section when a free-text field was left empty. */
const NOT_SPECIFIED = "not specified"

/** Trim, collapse newlines into the section, and bound the length. */
function boundedText(value: string): string {
  return value.trim().slice(0, MAX_FREE_TEXT_LENGTH).trim()
}

/** The `label` for one option value, or the raw value if it is unrecognized. */
function labelFor(options: readonly BriefOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value
}

/** The labels a multi-select picked, in catalog order. */
function pickedLabels(
  options: readonly BriefOption[],
  values: readonly string[]
): string[] {
  // Iterate the catalog, not the answers, so the printed order is the order the
  // chips were shown in — click order can't change the brief, which is half of
  // what makes composition a function of the answers alone.
  return options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label)
}

/** Comma-joined labels for a multi-select, or `null` when nothing was picked. */
function labelsFor(
  options: readonly BriefOption[],
  values: readonly string[]
): string | null {
  const labels = pickedLabels(options, values)
  return labels.length > 0 ? labels.join(", ") : null
}

/** `a`, `a and b`, `a, b and c` — for the one place that has to read as prose. */
function joinAsProse(parts: readonly string[]): string | null {
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

/** The short prose fragment an option contributes to the summary sentence. */
function phraseFor(
  options: readonly { value: string; label: string; phrase?: string }[],
  value: string
): string {
  const option = options.find((candidate) => candidate.value === value)
  return option?.phrase ?? option?.label ?? value
}

/** `- Label: value` */
function line(label: string, value: string): string {
  return `- ${label}: ${value}`
}

/**
 * The one-sentence description composed from the answers themselves, printed
 * under `## Summary` beneath whatever the user had already typed. Deliberately
 * built from the bounded enum answers only — free text is restated verbatim
 * above it rather than paraphrased, because paraphrasing would need a model and
 * this unit has none.
 */
function composeDescription(answers: BriefAnswers): string {
  const audience =
    joinAsProse(
      pickedLabels(ACTOR_OPTIONS, answers.actors).map((label) =>
        label.toLowerCase()
      )
    ) ?? "its users"
  const qualities = joinAsProse([
    phraseFor(LATENCY_OPTIONS, answers.latency),
    phraseFor(AVAILABILITY_OPTIONS, answers.availability),
  ])
  const tier = phraseFor(SCALE_TIER_OPTIONS, answers.scaleTier)
  return `A ${tier} system for ${audience}, with ${qualities}.`
}

/**
 * Every question left untouched, as a disclosed assumption.
 *
 * Checked **per field, not per question**: a question where the user picked a
 * scale tier but never touched the growth pattern has still had a default
 * applied, and the whole point of this section is that no default is applied
 * silently. A question-level check would hide exactly that case.
 *
 * Equality against {@link DEFAULT_ANSWERS} is the test, so explicitly choosing
 * the default value and skipping the step compose the same brief — which is what
 * makes `composeBrief` a function of its answers alone.
 */
function composeAssumptions(answers: BriefAnswers): string[] {
  const assumptions: string[] = []

  for (const question of BRIEF_QUESTIONS) {
    for (const field of question.fields) {
      if (field.kind === "text") {
        if (boundedText(answers[field.key]).length > 0) continue
        assumptions.push(
          `- ${question.section} — ${field.label}: ${NOT_SPECIFIED}.`
        )
        continue
      }

      if (field.kind === "multi") {
        if (answers[field.key].length > 0) continue
        assumptions.push(
          `- ${question.section} — ${field.label}: none selected.`
        )
        continue
      }

      const value = answers[field.key]
      if (value !== DEFAULT_ANSWERS[field.key]) continue
      assumptions.push(
        `- ${question.section} — ${field.label} assumed “${labelFor(
          field.options,
          value
        )}”.`
      )
    }
  }

  return assumptions
}

/**
 * Turn interview answers into the Markdown project brief that is submitted in
 * place of a one-line prompt.
 *
 * **Deterministic**: the same `answers` and `initialIdea` always compose the
 * same string. There is no model call, no clock, and no randomness here — the
 * brief is assembled from fixed section labels, catalog-derived option labels,
 * and truncated free text. That is what makes this testable without a browser,
 * and it is the seam a later unit (AI pre-fill, document ingestion) fills by
 * producing better *answers* rather than by changing this function.
 *
 * @param answers  Everything the interview collected; skipped questions carry
 *                 their {@link DEFAULT_ANSWERS} value.
 * @param initialIdea Whatever was already typed into the freeform prompt, if
 *                 anything. Restated verbatim (bounded) at the top of the brief.
 */
export function composeBrief(
  answers: BriefAnswers,
  initialIdea: string
): string {
  const idea = boundedText(initialIdea)
  const scopeIdea = boundedText(answers.idea)
  const sections: string[] = []

  // The initial idea is restated verbatim above the composed description —
  // except when the interview's own "what are you building?" answer still holds
  // exactly that text (it is pre-filled from the freeform prompt), in which case
  // printing it here and again under `## Users & Scope` would just be a
  // duplicate paragraph. They differ the moment the user refines the answer, and
  // then both are worth keeping.
  const summary =
    idea.length > 0 && idea !== scopeIdea
      ? [idea, composeDescription(answers)]
      : [composeDescription(answers)]
  sections.push(`## Summary\n\n${summary.join("\n\n")}`)

  sections.push(
    [
      "## Users & Scope",
      "",
      line("What we're building", scopeIdea || NOT_SPECIFIED),
      line(
        "Primary users",
        labelsFor(ACTOR_OPTIONS, answers.actors) ?? NOT_SPECIFIED
      ),
    ].join("\n")
  )

  sections.push(
    [
      "## Scale",
      "",
      line("Expected users", labelFor(SCALE_TIER_OPTIONS, answers.scaleTier)),
      line("Growth pattern", labelFor(GROWTH_OPTIONS, answers.growth)),
    ].join("\n")
  )

  sections.push(
    [
      "## Data",
      "",
      line("Core entities", boundedText(answers.entities) || NOT_SPECIFIED),
      line(
        "Data shapes",
        labelsFor(DATA_SHAPE_OPTIONS, answers.dataShapes) ?? NOT_SPECIFIED
      ),
      line("Consistency", labelFor(CONSISTENCY_OPTIONS, answers.consistency)),
    ].join("\n")
  )

  sections.push(
    [
      "## Real-time",
      "",
      line("Freshness", labelFor(LATENCY_OPTIONS, answers.latency)),
    ].join("\n")
  )

  sections.push(
    [
      "## Integrations",
      "",
      line(
        "Services",
        labelsFor(INTEGRATION_OPTIONS, answers.integrations) ?? NOT_SPECIFIED
      ),
      line("Specifics", boundedText(answers.integrationNotes) || NOT_SPECIFIED),
    ].join("\n")
  )

  sections.push(
    [
      "## Reliability & Compliance",
      "",
      line(
        "Availability target",
        labelFor(AVAILABILITY_OPTIONS, answers.availability)
      ),
      line(
        "Compliance",
        labelsFor(COMPLIANCE_OPTIONS, answers.compliance) ?? NOT_SPECIFIED
      ),
    ].join("\n")
  )

  sections.push(
    [
      "## Constraints",
      "",
      line("Team size", boundedText(answers.teamSize) || NOT_SPECIFIED),
      line("Preferred stack / cloud", boundedText(answers.stack) || NOT_SPECIFIED),
      line("Priority", labelFor(PRIORITY_OPTIONS, answers.priority)),
      line("Budget", labelFor(BUDGET_OPTIONS, answers.budget)),
    ].join("\n")
  )

  sections.push(
    [
      "## Mandates & Out of Scope",
      "",
      line("Hard mandates", boundedText(answers.mandates) || NOT_SPECIFIED),
      line("Out of scope", boundedText(answers.outOfScope) || NOT_SPECIFIED),
    ].join("\n")
  )

  const assumptions = composeAssumptions(answers)
  sections.push(
    [
      "## Assumptions",
      "",
      assumptions.length > 0
        ? `These were skipped or left at their default:\n\n${assumptions.join("\n")}`
        : "None — every question was answered.",
    ].join("\n")
  )

  return sections.join("\n\n")
}
