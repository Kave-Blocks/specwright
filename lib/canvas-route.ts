/**
 * Search param that lands `/editor/[roomId]/canvas` with the starter-templates
 * picker already open.
 *
 * It exists because there is no active Liveblocks room at `/editor` and
 * template import runs client-side inside one, so "Browse starter designs"
 * creates the project first and reaches the picker after arriving — rather than
 * a server-side path that seeds a room with a template.
 *
 * Shared by its one producer (`hooks/use-project-actions.ts`) and its one
 * consumer (the canvas page, which reads it on the server), so the two cannot
 * drift into a param with no reader.
 */
export const CANVAS_TEMPLATES_PARAM = "templates"

/** The value the param carries. Its presence is the signal; this keeps the URL honest. */
export const CANVAS_TEMPLATES_PARAM_VALUE = "1"
