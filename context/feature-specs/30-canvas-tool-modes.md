Introduce an explicit tool mode system for the canvas. Exactly one tool is active at any time, the active tool owns the cursor and decides what click and drag mean, and the toolbar shows which tool is active. This is the foundation for the Select and Hand tools; it ships with the mode state, the toolbar controls, and the shape tools converted to modes.

## Implementation

1. Tool mode state

- add a single canvas-level `activeTool` value with exactly one of: `select`, `hand`, or a shape tool (`rectangle`, `diamond`, `circle`, `pill`, `cylinder`, `hexagon`)
- exactly one tool is active at all times; there is no "no tool" state
- the default tool on canvas load is `select`
- switching tools clears any in-progress gesture (an unfinished marquee, an unfinished shape placement, a connector being dragged)
- switching tools does not clear the current selection

2. Shape tools become modes

- clicking a shape in the toolbar activates that shape tool rather than starting a drag-and-drop
- while a shape tool is active, clicking the canvas places that shape at the click point
- after placing a shape, the canvas returns to `select` and the newly placed shape becomes the selection
- existing drag-and-drop of a shape from the toolbar onto the canvas continues to work unchanged; it does not change `activeTool`

3. Toolbar

- add `select` and `hand` to the left edge of the existing shapes group, in that order
- add a divider between the two cursor tools and the six shape tools
- the shapes group now reads: select, hand, divider, rectangle, diamond, circle, pill, cylinder, hexagon
- the existing left group (zoom out, fit, zoom in, undo, redo) is unchanged and is not part of the tool mode system
- the active tool is visually distinct from inactive tools and from hover

4. Cursor

- the canvas cursor reflects `activeTool`:
  - `select` — default arrow
  - `hand` — open hand; closed hand while panning
  - any shape tool — crosshair
- hovering a shape edge while a connector can be started keeps the existing connector cursor, regardless of active tool

5. Keyboard

- `V` activates `select`
- `H` activates `hand`
- `R` activates `rectangle`
- `Esc` returns to `select` from any tool and cancels any in-progress gesture
- shortcuts are ignored while a text input has focus

## UI Details

- one toolbar row, three groups; do not add a second row
- reuse the existing pill container, icon size, spacing, and divider treatment from the current toolbar
- use existing colors and tokens from `global.css`
- follow `ui-context.md` for spacing and layout
- select uses a cursor/arrow icon, hand uses a hand icon; match the stroke weight of the existing icons

## Scope Limits

- do not implement Select tool behavior (spec 31)
- do not implement Hand tool behavior (spec 32)
- do not change zoom, fit, undo, or redo
- do not change connector creation
- do not add a connector, text, or eraser tool
- do not add a second toolbar row or a flyout menu
- do not persist the active tool across reloads

## Notes

- shape tools and cursor tools are peers: all of them own the cursor, so they live in one group. zoom and undo do not own the cursor, which is why they stay in their own group.
- `activeTool` is what makes marquee selection possible at all — empty-canvas drag currently means pan, and that gesture can only belong to one tool.

## Check When Done

- canvas loads with `select` active and the select icon shown as active in the toolbar
- clicking each of the eight tools makes it the only active tool in the toolbar
- clicking a shape tool then clicking the canvas places that shape and returns the toolbar to `select`
- dragging a shape from the toolbar onto the canvas still places a shape and leaves the active tool unchanged
- the canvas cursor changes between arrow, hand, and crosshair as the active tool changes
- `V`, `H`, `R`, and `Esc` change the active tool; typing in a text input does not
- switching tools mid-gesture leaves no in-progress marquee, shape, or connector on the canvas
- TypeScript and build pass
