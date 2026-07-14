Give panning its own tool. The `hand` tool makes every drag pan the viewport and disables selection entirely, and hold-space makes the hand tool available temporarily from any other tool without switching away from it.

## Dependencies

- spec 30 (canvas tool modes) must land first; this spec assumes `activeTool` exists

## Implementation

1. Hand tool

- while `hand` is active, dragging anywhere on the canvas pans the viewport, including dragging on top of a shape
- while `hand` is active, clicking does not select, move, resize, or delete anything
- while `hand` is active, hovering a shape edge does not start a connector
- the existing selection stays selected and stays outlined while `hand` is active; it is simply not editable
- panning has no bounds beyond whatever the canvas already enforces

2. Hold-space temporary pan

- holding space from any tool temporarily activates `hand`
- releasing space returns to the tool that was active before space was pressed, including a shape tool
- the toolbar shows `hand` as active while space is held, then returns
- space is ignored while a text input has focus
- pressing space mid-gesture (mid-marquee, mid-move, mid-connector) is ignored; the gesture completes normally

3. Cursor

- open hand while `hand` is active, closed hand while actively dragging
- this applies to both the explicit tool and hold-space

## Scope Limits

- do not change scroll or trackpad panning
- do not change zoom or fit
- do not add zoom-to-selection or space-drag-to-zoom
- do not add momentum, inertia, or animated panning
- do not persist viewport position

## Notes

- hold-space is what makes select-as-default tolerable: it means pan is always one key away without leaving the tool you are in.
- if the default tool is ever flipped back to `hand` in spec 30, the only change here is that hold-space becomes redundant rather than load-bearing; the tool behavior itself is unchanged.

## Check When Done

- with `hand` active, dragging empty canvas pans the viewport
- with `hand` active, dragging on top of a shape pans the viewport and does not move the shape
- with `hand` active, clicking a shape does not change the selection, and delete does not remove anything
- a shape selected before switching to `hand` is still outlined while `hand` is active
- holding space from `select` pans, and releasing space returns to `select`
- holding space from a shape tool pans, and releasing space returns to that same shape tool
- the toolbar shows `hand` as active while space is held and returns to the prior tool on release
- space pressed while dragging a marquee does not interrupt the marquee
- the cursor is an open hand when idle and a closed hand while panning
- TypeScript and build pass
