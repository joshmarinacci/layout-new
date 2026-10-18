# Vector networks

Choose **Shape → New Vector Network** (also in the page/canvas context menu). The new shape opens in Pen mode. Double-click an existing network, select it and choose **Edit Vector**, or press Enter with the canvas focused to edit it again.

The floating palette contains every network editing action. Drag its header to reposition it. **Done** exits editing. Escape cancels an active gesture, ends the current pen chain, or exits if neither is active. Completed changes remain in document history. Pan and zoom work during editing, and point/handle hit targets retain their screen size.

## Tools

- **Pen (P):** Click to add points and straight segments. Drag an endpoint to create a curve; the next segment continues from its outgoing handle. Click existing points to start branches or close loops. Clicking a segment inserts a point and connects to it. **New path** starts a separate chain within the same shape.
- **Select (V):** Click points or segments; Shift-click toggles them. Drag points to move the selected points and attached handles. Drag empty space for a point marquee. Select a curved segment or its endpoint to reveal curve handles, then drag those handles.
- **Curve (B):** Click a straight segment to bend it and reveal its handles. **Straighten** removes selected segments' curve handles.
- **Insert point:** Click a segment to subdivide it. Cubic subdivision preserves its curve.
- **Connect points:** Select two points and connect them. **Merge points** combines selected points at the first selected point's location.
- **Join crossing:** Click the intersection of two segments to create a shared editable point. Ordinary crossings already subdivide fillable space, but do not automatically weld the authored paths together.
- **Smooth pair:** Select an endpoint with two incident segments. At a branch, also Shift-select the two segments to pair. Their handles align; subsequent handle dragging keeps the opposite handle aligned while preserving its length. **Corner** makes handles independent again.
- **Delete selected:** Remove selected points and their incident segments, or selected segments. Delete/Backspace does the same inside vector editing, without deleting the whole shape.
- **Fill (G):** Hover to preview a region, choose a color (swatch or six-digit hex), and click to paint it. **No fill** clears its fill, including an inner region to make a transparent hole. Stroke color and width apply to the whole network; width zero hides strokes.

Outside editing, vectors participate in selection, movement, lower-right-handle resizing, duplication, clipboard actions, pages, groups, and stacking order. Resizing transforms points and handles while keeping stroke width unchanged. Internal IDs are scoped to each shape, so duplicate and pasted networks are independent.

## Fill ownership

New isolated regions start unfilled. Moving geometry preserves fill when the region's boundary identity remains stable. Dividing a painted region gives both children its fill, including drawing a new closed loop inside an existing filled region. Merging equally filled regions preserves their fill; merging different fills, including filled and unfilled regions, clears the result. Opening a boundary removes its region. Undo restores both geometry and paint.

## Example

Open `examples/vector-network.json` using **File → Load JSON file**. It contains one network with a curved edge, two different region colors, a transparent hole, and a branch. Hide the side panels if the example is outside a narrow canvas viewport. Double-click a filled section to edit it.

## Implementation

`types.ts` defines `VectorShape`, `VectorNetwork`, points, segments, and regions. Points and cubic control points use local coordinates plus a shape origin. Smooth constraints belong to pairs of incident segments. Regions store boundary spans (segment ID plus parameter interval) and nullable solid fills. Tool state, hover, selection, and pen continuation are transient.

`vectorNetworks.ts` contains the geometry operations independently of React. It adaptively subdivides cubics, splits a temporary planar graph at intersections and collinear overlaps, walks bounded faces, and attaches nested boundaries as holes. Authored segments are unchanged until an explicit edit. Stable boundary signatures preserve fill through ordinary movement; containment witnesses resolve region splits and merges. Derived faces are cached for immutable network snapshots. Rendering uses the original cubic spans and an even-odd fill rule; strokes draw authored segments independently of region boundaries.

Curve subdivision uses a tolerance of 0.1 document units, independent of zoom. Derived vertices are quantized to one millionth of a document unit. Very close curves and tangencies are subject to these numerical tolerances. Documents allow at most 1,024 points, 2,048 segments, and 4,096 regions per network; region calculation rejects more than 8,192 curve subdivisions. Large networks have quadratic intersection cost and are not optimized for imported illustrations with thousands of curves.

`EditorStore.updateVector` reconciles regions against the previous network or an immutable gesture baseline. Each drag uses one begin/commit/cancel transaction. Pointer cancellation, lost capture, window focus loss, and leaving the editor cancel unfinished changes. Group membership is included in transactions so grouped-shape deletion and undo remain valid.

Document version **5** adds vector networks. Versions 0–4 migrate through the existing migration path. Structural validation checks IDs, references, finite coordinates, curve intervals, smooth pairs, and fills. JSON loading also verifies region boundaries against derived geometry. Vector data participates in browser saves and JSON export/import; editor state does not.

## Validation

Run `npm test`, `npm run build`, and `git diff --check`.

Verified on 2026-10-16: all 109 tests across eight test files pass, strict TypeScript checking and the Vite production build pass, and Git whitespace checks pass.

Model tests cover branches, disconnected paths, adjacent faces, nested holes/islands, crossings, self-intersections, collinear overlaps, tiny gaps, Bézier hit testing/subdivision/extrema, smooth pairs, fill inheritance/conflicts, gesture undo/cancellation, resizing, migrations, malformed JSON, independent copies/tabs, grouped deletion, and the sample document.

Browser checks verified creation with click and drag, independent fills, a transparent hole, double-click reentry, curve conversion and handle dragging, fill and handle undo/redo, loading the example through the JSON picker, and editing at 80% and 100% zoom. Store cancellation is tested; browser pointer-cancel/lost-capture events and complex tangencies have not received an exhaustive browser audit.

Gradients, SVG interchange, boolean operations between shapes, variable-width strokes, and conversion of existing rectangles/circles to networks are not part of this version.
