# Layout drawing tool: document and editing architecture

## Goals
Preserve rectangle creation, rendering, tree selection, and fill/stroke editing. Preserve the existing sample circle. Establish a serializable, typed model before adding more shape tools.

## Implementation
1. Add strict, no-emit TypeScript configuration covering source, tests, and Vite. Remove suppressed type errors and type-check production builds.
2. Define a pure `Document` with schema version, title, and ordered shapes. Retain the existing array as drawing order; IDs uniquely identify shapes. Use discriminated unions for rectangle, circle, oval, and components. Move UI/plugin callbacks outside the data model.
3. Add an `EditorStore` as canonical document owner with stable frozen snapshots, subscriptions, selection IDs, and history availability. Resolve selection from the current document.
4. Route edits through typed methods and transactions. Use Immer patches/inverse patches for bounded undo/redo. Single edits use implicit transactions; begin/commit/cancel groups live updates. Coalesce gestures by comparing starting and final documents so one drag creates one compact entry. Cancellation restores baseline; no-ops preserve redo; committed edits clear redo. Reject nested transactions and history navigation during gestures.
5. Integrate React through `useSyncExternalStore`. Wire title, creation/deletion, component properties, history buttons, and shortcuts. Group property editing sessions and add rectangle pointer drag/resize with capture and cancellation.
6. Validate JSON save/load, serialize document data only, and reset selection/history on load. Wire save/load and new-document controls.
7. Test editing non-first shapes, immutability, subscriptions, history ordering, redo invalidation, no-ops, grouped gestures, cancellation, and serialization round trips/invalid input. Run type checking, tests, production build, and browser verification where available.

## Boundaries
No new shape creation tools, nesting/groups, collaboration, assets, or migrations. Circle/oval data is typed for extension. Deployment is outside this implementation scope.

## Completion

Implemented on 2026-10-03. All seven implementation steps are complete. The ordered shape array preserves drawing order, and rectangle, circle, and oval variants are explicitly typed. Existing rectangle behavior and the sample circle are preserved.

Validation: 18 tests pass, strict TypeScript checking and the production build pass, and Git whitespace checks pass. Browser checks covered rectangle creation, property edits, drag updates, and single-entry drag undo. File-picker interaction and pointer-cancellation UI paths remain unverified manually. See `README.md` for usage, architecture, validation, and next steps.


## File menu and multiple documents — 2026-10-03

Completed the next UI increment:

- Grouped Load file, New Document, and Save JSON into a File dropdown with outside-click, focus-leave, and Escape dismissal.
- Added a horizontally scrollable document tab bar below the menu bar, with active-tab styling and Left/Right/Home/End keyboard navigation.
- Kept a separate EditorStore for each open document so document contents, selection, and undo/redo history remain independent.
- Changed New Document and successful file loads to append and activate a new tab. Saving and undo/redo target the active tab. Invalid file loads preserve existing documents.
- Bound tab labels to document titles and handled editing-session cleanup during switches.

Validation: all 18 existing tests and the strict TypeScript/production build pass. Browser checks verified new-tab creation, switching with preserved contents, independent undo, and arrow-key navigation. Native file loading remains unverified manually.

Scope: tabs remain in memory only. Closing tabs, unsaved-change indicators, and restoring a workspace after reload are deferred. The version-0 document format is unchanged.


## Shared pixel-art images — 2026-10-03

Implemented a pixel-image shape backed by document-owned image data. Each shape has independent display bounds and an image ID; linked copies reuse the same palette and pixel array. The version-1 schema adds an image collection. Loading a version-0 document migrates it without changing its shapes.

Creation accepts 1–256 pixel dimensions and built-in palettes. Double-clicking opens a dedicated editor panel with pencil, eraser, four-connected flood fill, color picker, zoom, transparency, and grid controls. Main-canvas movement and lower-right resizing affect only display bounds. Linked Copy exposes shared data in the UI. Each stroke/fill uses document history; cancelled and no-op transactions preserve redo. Shape deletion retains shared data.

Validation: 63 tests pass, including 28 pixel-image/migration tests. Strict TypeScript and production build pass. Browser verification was blocked by unavailable computer-use access on a locked Mac; pixel editor gestures and modal transitions remain unverified manually.

Deferred: custom palettes, pixel-resolution changes, image import/export, and unused-data cleanup. Earlier scope boundaries and version-0 notes describe prior increments.


## Pixel-image refinements — 2026-10-04

Added Shift-constrained image resizing, the standard 16-color PICO-8 palette, and a square size selector (8 × 8, 16 × 16, 32 × 32). Existing image dimensions remain supported in the model and saved files. All 70 tests and the strict TypeScript/production build pass.


## Shape menu — 2026-10-04

Added Shape beside File and moved New Rect, New Circle, and New Pixel Image into it. Both menus reuse DropdownMenu for outside-click, focus-leave, action, and Escape dismissal. Selection-specific toolbar actions remain available. README usage now reflects the menus.

The user confirmed the pixel editor works in the live preview. All 70 automated tests, strict TypeScript checking, production build, and Git whitespace checks pass.


## PNG import and tile splitting — 2026-10-04

Added Shape → Import PNG with file preview and optional splitting into independently editable tiles. Tile width and height can each be 8, 16, or 32; dimensions must divide exactly. Original decoded colors, resolution, transparency, and tile order are preserved. Source limits and unsupported alpha/animation/16-bit channels produce actionable errors before document mutation. Creation of every imported data object and shape is atomic and undoable in one step.

Validation: 79 tests pass, including nine importer tests and the supplied terrain.png regression fixture. Type checking and production build pass. Browser verification imported terrain.png into twenty 8 × 8 tiles and confirmed a single undo/redo removes/restores the whole import. Existing user documents were preserved by testing in a fresh tab. Older development tabs require saving/reloading or a new tab after store methods are hot-loaded.


## Shared sprite-sheet imports — 2026-10-04

Changed sliced imports to retain one source image asset, with per-shape integer source rectangles. Tile bounds remain independent of image coordinates. Linked Copy preserves the source rectangle, rendering crops from a cached asset bitmap, and pixel editing is confined to the opened tile's source region. Flood fill cannot cross tile boundaries.

Source PNGs may now be up to 2048 × 2048 pixels; sources above 256 pixels require slicing. Tile-size choices extend through 256 pixels, with at most 1024 shapes per import. Document version 2 validates source rectangles; version-0/1 saved files migrate to it. Existing separate assets are preserved rather than merged speculatively.

Validation: 88 model tests, strict TypeScript, production build, and whitespace checks pass. Tests cover a large sheet, the supplied terrain fixture as one asset, crop bounds, overlapping linked copies, isolated tile edits, history, and migration. Shared-sheet browser checks remain pending. No commit made for this increment.


## Asset view and item names — 2026-10-04

Selecting an image asset in the Assets tree switches the workspace from the canvas/property panels to a full-image asset view. The view shows native pixel dimensions, palette size, and the imported filename, and supports PNG export. Imported assets retain the source filename separately from their editable asset name; files created in the editor have no original filename. Image assets and shapes can both be renamed through their name fields, with edits recorded in document history.

Added asset preview zoom controls (1×–32×) that preserve nearest-neighbor pixels and leave exported PNG dimensions unchanged.

Document version 3 stores the optional original filename. Version-1 and version-2 documents migrate to version 3 while preserving image pixels and, for version 2, source regions. Version-0 migration remains supported. Strict TypeScript and production build pass; tests and browser verification were not run for this increment. No commit made.


## Multiple selection — 2026-10-04

Added shift-click toggling in the canvas and shape tree, marquee selection by dragging empty canvas, selection outlines for all selected objects, and group movement. The primary selected object retains resize handles. The property sheet intersects component keys and kinds across the selection, displays mixed values, and applies edits to all selected shapes in one transaction. Delete removes a multi-selection in one undo step.

Strict TypeScript, production build, and whitespace checks pass. Tests and browser verification were not run for this increment. No commit made.


## Canvas pan and zoom — 2026-10-04

Added scrollable viewport panning, Space/middle-button drag panning, pointer-anchored Ctrl/Command-wheel and trackpad zoom, plus toolbar zoom controls from 25% to 400%. Canvas backing resolution follows zoom and device-pixel ratio so vector drawing no longer stretches a fixed 1024 × 1024 bitmap; document-space geometry and image nearest-neighbor rendering are preserved. The wheel listener is native and non-passive to prevent the browser from also zooming the page.

Strict TypeScript, production build, and whitespace checks pass. Tests and browser verification were not run for this increment. No commit made.


## Collapsible tree and named JSON saves — 2026-10-06

Made the document, Shapes, and Assets tree nodes collapsible, with nested structure prepared for future group and page nodes. JSON saves now use a filesystem-safe document title as the filename and fall back to `Untitled.json` for blank titles.

Strict TypeScript, production build, and whitespace checks pass. No tests were run for this increment.


## Vector networks — 2026-10-16, implemented on codex/vector-networks

1. Added a version-5 serializable graph model: stable local point/segment IDs, cubic controls, smooth segment pairs, region boundary spans and independent fills.
2. Added pure geometry helpers and planar region discovery, including branches, crossings, nested holes, cubic subdivision, bounds, hit testing and transformations.
3. Added fill reconciliation for movement, region splitting/merging, opened boundaries, and gesture cancellation.
4. Integrated store transactions, schema migration/validation, independent duplication/paste, page/group behavior, and history.
5. Added canvas rendering, shape movement/resizing, and double-click/Enter/Edit Vector entry.
6. Added the floating vector palette with Pen, Select, Curve, Insert point, Join crossing, Connect/Merge, Smooth pair/Corner, deletion, region fill, stroke, undo/redo and Done.
7. Added model tests, the runnable JSON example, and `docs/vector-networks.md`. Browser checks and numerical limits are recorded in that guide.

Deferred extensions: gradients, SVG import/export, inter-shape boolean operations, variable-width strokes, and primitive-to-network conversion.

Vector network validation: 109 tests pass across eight files; strict TypeScript, production build, and Git whitespace checks pass. Browser verification covers drawing, independent fills, holes, double-click editing, curve handles, undo/redo, JSON loading, and zoom. See the guide for the remaining verification boundaries.
