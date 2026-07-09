Review the editor canvas implementation and fix the visual issues. The canvas currently looks like it's floating above the background inside a border box, instead of feeling like a real design canvas. Check `/context/screenshots/image.png` for the current broken state.

Read the current canvas component code in `components/editor`

Issues to look for and document:

DRAG AND DROP ISSUES:

* Canvas nodes from the node panel cannot be dragged and dropped onto the canvas. Investigate and fix the full drag-and-drop pipeline:
* Confirm that draggable nodes in the node panel have the correct draggable attribute and onDragStart handler that sets the node type in dataTransfer
* Confirm that the canvas has onDragOver (with preventDefault to allow dropping) and onDrop handlers wired up correctly
* Ensure the drop handler reads the node type from dataTransfer, calculates the correct canvas coordinates accounting for pan offset and zoom scale, and creates a new node at the dropped position
* Check that no parent element is intercepting or blocking the drag events before they reach the canvas

CANVAS VISUAL ISSUES:

* Box shadow or elevation styles making the canvas appear to float
* Border or border-radius giving it a "card" appearance instead of a canvas feel
* Background color mismatch between canvas and its container
* Missing or incorrect dotted background pattern on the canvas
* z-index or positioning (absolute/relative) causing the floating effect
* Padding/margin around the canvas creating separation from the background
* Any wrapper div styles (like rounded corners, shadows, or elevated backgrounds) treating the canvas as a UI card

SIDEBAR ISSUES:

* The left and right sidebars should float OVER the canvas, not push or shrink it
* Sidebars must use position: fixed or position: absolute with a higher z-index so the canvas extends fully behind them
* The canvas background (dotted pattern) should be visible edge-to-edge underneath both sidebars
* Sidebars should have a semi-transparent or solid background with a subtle shadow so they feel elevated above the canvas, not embedded in the layout
* The left sidebar is not fully hiding when toggled off

The provided documentation lists the following additional details regarding the left sidebar and the final goals for the editor canvas:

* **Left Sidebar Issue:** The sidebar is partially visible or "peeking out" instead of sliding completely off-screen.
* **Debugging Steps:** To fix this, check for incorrect `transform: translateX` values, insufficient negative offsets, overflow issues on the parent container, or missing `overflow: hidden` properties that cause it to remain visible during or after the transition.
* **Final Objectives:** Once all issues are documented, the fixes should ensure that:
* The canvas has a dotted background pattern that fills the full viewport naturally.
* The canvas feels flush with the surrounding background, eliminating floating or "card" effects.
* Box-shadows, excessive borders, and elevated styling are removed from the canvas.
* The canvas mimics an infinite design canvas, similar to tools like Figma or Excalidraw.
* Both sidebars float over the canvas and are completely hidden when toggled off.
* Nodes can be correctly dragged from the node panel and dropped onto the canvas.
