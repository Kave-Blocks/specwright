Scope the canvas's existing selection, move, resize, and delete behavior to the `select` tool, and add marquee selection. Selection already works; this spec makes it the responsibility of one tool and gives empty-canvas drag a selection meaning.

## Dependencies

- spec 30 (canvas tool modes) must land first; this spec assumes `activeTool` exists and defaults to `select`

## Implementation

1. Selection is owned by the select tool

- click a shape to select it, click empty canvas to clear the selection
- shift-click adds or removes a shape from the selection
- drag a selected shape to move it; drag a resize handle to resize
- delete and backspace remove the selection
- all of the above only apply while `select` is the active tool; while any other tool is active these gestures do nothing
- existing selection outlines and resize handles are unchanged

2. Marquee selection

- dragging from empty canvas draws a marquee rectangle
- shapes intersecting the marquee are highlighted during the drag
- releasing selects every shape the marquee touched
- holding shift while marqueeing adds the result to the existing selection instead of replacing it
- a drag shorter than a small threshold is treated as a click, not a marquee, so it clears the selection rather than selecting nothing
- `Esc` during a marquee cancels it and leaves the previous selection intact

3. Connector creation is unaffected

- hovering a shape edge and dragging still creates a connector while `select` is active
- an edge drag never starts a marquee or a move

4. Panning still available in select mode

- scroll and trackpad pan continue to work while `select` is active
- hold-space temporary pan is specified in spec 32

## UI Details

- the marquee is a translucent rectangle with a visible border, drawn above shapes and below the toolbar
- use existing colors and tokens from `global.css`; the marquee border reuses the selection outline color
- follow `ui-context.md` for spacing and layout

## Scope Limits

- do not change the appearance of selection outlines or resize handles
- do not change move, resize, or delete behavior
- do not change connector creation
- do not add copy, paste, duplicate, group, or align
- do not add lasso or right-click selection
- do not implement hold-space pan (spec 32)

## Notes

- marquee is only possible because empty-canvas drag no longer means pan by default. that trade is intentional: pan moves to hand, hold-space, and scroll.

## Check When Done

- clicking a shape selects it and clicking empty canvas clears the selection while `select` is active
- shift-click adds a second shape to the selection
- dragging from empty canvas draws a marquee and selects every shape it touches on release
- shift-marquee adds to the existing selection instead of replacing it
- a short click-drag on empty canvas clears the selection and does not leave a marquee on screen
- `Esc` mid-marquee cancels it and the prior selection is still selected
- dragging from a shape edge creates a connector and does not start a marquee
- while a shape tool or `hand` is active, clicking a shape does not select it
- scroll and trackpad pan still work while `select` is active
- TypeScript and build pass
