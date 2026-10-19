# Layout drawing tool

Run `npm install`, then `npm run dev`. Validate with `npm test` and `npm run build` (includes strict TypeScript checking).

## Editing

Use the **Shape** dropdown beside **File** to create shapes with **New Rect**, **New Circle**, or **New Pixel Image**, or **New Repeating Image**. Both dropdowns close after an action, outside click, focus change, or Escape. Select shapes in the tree or canvas. Shift-click toggles a shape in the current selection; drag on empty canvas to select intersecting shapes. Drag a selected shape to move the whole selection; hold **Option/Alt** while dragging to duplicate and move it. The **Hide Tree** and **Hide Properties** toolbar buttons toggle the left and right panels independently; the canvas expands to use the available space. The property sheet shows components shared by all selected shapes, marks differing values as mixed, and applies edits to every selected shape. Right-click a shape on the canvas or in the tree for Duplicate, Delete, Cut, Copy, Paste, Group, and Ungroup; right-click the canvas background for the active page's creation menu. The same shape editing actions are available in the **Edit** menu. Duplicate, Cut, Copy, and Paste also have Command/Control shortcuts: ⌘/Ctrl+D, X, C, and V. Delete and Backspace remove the current selection. These actions operate on the full selection, and document changes are undoable. Drag a rectangle’s lower-right corner to resize; selected circles have four handles at the top, right, bottom, and left. Circle handles adjust the radius while keeping the center fixed, with a minimum radius of zero. Circle hit testing follows the circular area. Scroll the canvas viewport to pan, use Ctrl/Command-scroll or trackpad pinch to zoom around the pointer, and use Space-drag or middle-button drag for direct panning. Toolbar controls zoom from 25% to 400%. Zoom redraws the canvas at device-pixel-aware resolution while keeping shape coordinates unchanged; imported pixel images use nearest-neighbor rendering. One gesture or focused property-editing session creates one undo entry. Enter or blur commits an input session; Escape cancels. Pointer cancellation or loss of capture cancels an unfinished gesture.

Use Undo/Redo or Command/Control-Z, Shift-Command/Control-Z, and Control-Y outside text inputs. Text fields retain native text-edit shortcuts while focused.

The **File** menu contains **Save to Browser** (or **Save Document** in Tauri), **Open from Browser** (or **Open Saved Document** in Tauri), **Load JSON file**, **Export JSON**, and **New Document**. Browser saves are manual and stored in this browser's local storage; Tauri saves are stored in the app's data directory. Edits do not save automatically. A dot on a tab marks changes since its last save. Use ⌘S/Ctrl+S to save the active document, ⌘⇧O/Ctrl+Shift+O to open the saved-document manager, and ⌘O/Ctrl+O to load a JSON file. The manager can open, rename, or delete saved documents. Opening one creates a new tab with its saved state; deleting its saved entry marks any open copy unsaved. **Export JSON** downloads `<document title>.json`, replacing filename-unsafe characters; a blank title uses `Untitled.json`. The JSON file picker validates data before opening; invalid files leave existing tabs intact. New Document and successful loads open a new tab. Each tab retains its own document, selection, and undo/redo history. Use Left/Right arrows or Home/End while focused on the tab bar to switch documents. Tabs remain in memory; saves from the File menu provide the persistent local copy.

### Tauri desktop app

Run `npm run tauri-dev` to start the desktop app. In Tauri, the in-window menubar is hidden and the same File, Edit, Page, Shape, and Appearance menus are provided by the native window/application menubar. The File menu's save and open actions use JSON-backed saved documents in the app data directory; **Export JSON** and **Load JSON file** continue to work with ordinary JSON files. Rename Page opens the app's rename dialog from both the native Page menu and the page context menu. The native menu is connected to the editor through Tauri events, enabled for the main window by `src-tauri/capabilities/default.json`.

The left tree has collapsible document, Pages, and Assets nodes. Drag page rows to reorder pages and shape rows to reorder shapes within the same page; this also changes their canvas stacking order. A yellow line shows whether the dragged item will be inserted before or after the hovered row. Each document starts with Page 1. Select a page in the tree or page selector to switch pages. Right-click **Pages** to add a page; right-click a page to add shapes, rename it, or delete it. The top-level **Page** menu also offers new, rename, and delete actions for the active page. Right-click the canvas background for the active page's New Rectangle, New Circle, New Pixel Image, New Repeating Image, and Import PNG actions. Shapes belong to one page and only that page's shapes appear on the canvas. Deleting a page moves its shapes to another page. Select shapes and use **Group** in the shape context menu to create a group. Click a group to select its shapes; double-click its name to rename it. Use **Ungroup** in a selected-shape context menu to remove selected members from groups. Groups organize shapes in the tree and support joint selection; they do not change drawing order or appearance. Group membership is saved with the document. A repeating image shape references a shared image asset and displays a selected source rectangle as a repeating pixel pattern inside its bounds. Create one with **Shape → New Repeating Image** or the page context menu, choose an asset, then edit the source rectangle and repeat width/height in the property sheet. The repeating shape does not edit source pixels; changes to the shared asset are reflected in all its views.

## Vector networks

Choose **Shape → New Vector Network** to draw a shape with branching paths, cubic curves, disconnected loops, and holes. Double-click a vector or choose **Edit Vector** to open its floating palette. Use Pen to draw, Select to move points and curve handles, Insert point and Join crossing to edit connections, and Fill to paint enclosed regions independently. **No fill** makes a region transparent. Smooth pair/Corner control handle coupling. Done exits; each completed action remains separately undoable.

See [the vector network guide](docs/vector-networks.md) for tools, fill rules, architecture, and numerical limits. Load [the example document](examples/vector-network.json) with **File → Load JSON file** to try curves, multiple colors, a hole, and a branch.

## Pixel art images

Choose **Shape → New Pixel Image**, then **8 × 8**, **16 × 16**, or **32 × 32**, and select **PICO-8**, **Classic 16**, **Grayscale**, or **Pocket 4**. The image starts transparent. Double-click an image shape, or select it and choose **Edit Pixels**, to enter pixel editing directly on the main canvas. The floating tool palette opens above the image, or below it when there is not enough room; drag its title bar to move it. Use the main canvas zoom and pan controls while editing.

- **Pencil (B)** paints the selected palette color; fast pointer movements interpolate a continuous stroke.
- **Eraser (E)** writes transparent pixels.
- **Flood fill (G)** fills connected pixels of the same color (four-way connectivity).
- **Color picker (I)** samples a pixel, including transparency, then returns to the pencil.
- **Move (M)** shifts pixels by dragging and wraps them across the image region's edges.
- Choose a swatch or transparency. Right-click a pixel to sample its color. A pixel grid appears while editing.

Each completed stroke, fill, or move is one undo step in the document's history. Escape cancels an active stroke or exits pixel editing. Closing preserves completed edits. Pointer cancellation, lost capture, or focus loss cancels an unfinished stroke or move.

Drag the image to move it and its lower-right handle to resize its display bounds. Hold **Shift** while resizing to preserve the aspect ratio from the start of the drag; release Shift for free resizing. Rendering uses nearest-neighbor scaling; resizing does not change the pixel resolution. Select an image and choose **Linked Copy** to add another shape referencing the same data. Editing either shape's source pixels updates both, while their positions and display sizes stay independent. Sharing is within a document, not across document tabs.

## Importing PNGs

Choose **Shape → Import PNG**, then select a file. Import the whole image, or enable **Slice into tile shapes** and choose tile width and height (8, 16, 32, 64, 128, or 256 pixels independently). Dimensions must divide the source exactly; nothing is cropped or padded. Shapes are created left-to-right, then top-to-bottom, including transparent tiles.

**A sliced import creates one shared image asset.** Each tile shape references its own source rectangle in that asset. Assets lists the original sheet once, at its original dimensions. Double-clicking a tile edits only its source region; pencil, eraser, and flood fill cannot spill into neighboring tiles. Shapes with overlapping source regions, including Linked Copies, reflect the same pixel edits. Moving/resizing a shape changes only its display bounds. Deleting a tile keeps the shared asset.

Select an image in the Assets tree to open its asset view. It shows the complete source image and its original imported filename, with zoom controls from 1× to 32× and **Export PNG**. Zoom affects only the preview; exported PNG dimensions remain the asset's native pixel dimensions. Rename an asset in this view or rename a shape in the property sheet. Names are undoable document edits.

Import preserves decoded opaque RGB colors and full transparency without resizing, quantization, or dithering. Limits: 2048 × 2048 source pixels, 256 unique opaque colors, 10 MB per file, and 1024 tile shapes. Sources larger than 256 pixels require slicing. Tile source regions can be up to 256 × 256 pixels. Choose larger tiles when a sheet would exceed the shape limit. Partially transparent pixels, animated PNGs, and 16-bit-channel PNGs are rejected. Fully transparent images receive one editable black palette color. Processing stays local and leaves the source file untouched.

An entire import is one undo entry, including the asset and all referencing shapes. Invalid/cancelled imports leave the document unchanged. Import tests include the supplied 160 × 8 terrain.png fixture: twenty 8 × 8 source regions backed by one asset. Tests cover exact pixels, large sheets, boundary-limited tile edits, shared references, placement independence, deletion, undo/redo, cancellation, invalid regions, JSON round trips, and version-1 migration.

Browser verification previously confirmed PNG decoding, preview, and one-step undo/redo for separate-image imports. The shared-sheet rendering, region editor, asset view, name editing, and asset preview zoom have not yet been manually checked in the browser.

During development, tabs created before new EditorStore methods were hot-loaded retain the older class instance. Use a new document tab, or save documents and reload the page, before trying a newly added store action.

## Architecture

`types.ts` contains only serializable data. `Document` version 5 adds vector networks and retains the ordered `shapes` array, pages, and groups. IDs are unique and drawing order is array order. Shapes carry a page ID; groups record shape IDs without changing draw order. `Shape` and `ShapeComponent` are discriminated unions. `editorTypes.ts` holds extension/UI contracts separately.

`Document.images` contains `PixelImageData` objects: stable ID, editable name, original imported filename (when available), dimensions, hex palette colors, and row-major palette indices (`-1` means transparent). Selecting an image asset opens its full-resolution asset view, where it can be renamed or exported as PNG. A `PixelImageShape` holds an image ID, an integer source rectangle within that asset, and separate display bounds. Multiple shapes can show different regions of one sprite sheet. Validation rejects dangling references, duplicate image IDs, invalid dimensions/palettes, wrong pixel counts, and invalid palette indices. Deleting a shape retains its image data, so other linked shapes and undo remain valid; unused-data cleanup is not implemented.

Use `createPixelImage`, `linkImageShape`, and `updatePixelImage` on the store. Creation adds image data and its first shape atomically. Pixel tool algorithms live in `pixelImages.ts` and operate on drafts through the store, with no GUI dependency. Image data participates in snapshots, transactions, undo/redo, and JSON save/load. The editor's tool, zoom, and selected color are transient UI state.

`DropdownMenu` shares disclosure, dismissal, and focus behavior between File and Shape. Creation actions live in Shape; selection-specific actions such as Edit Pixels, Linked Copy, and Delete remain in the toolbar.

`App` maintains an ordered list of tabs with stable IDs and one `EditorStore` per tab. The active tab supplies the editor, property sheet, save action, and history shortcuts. Each tab subscribes to its store for its title. Switching tabs blurs focused editor controls to finish input sessions and cancels any remaining transaction; canvas and property-sheet components remount for the active tab. Workspace tabs are not part of the saved JSON. Tab closing and session restoration are not implemented.

`EditorStore` owns the document, transient selection ID, and bounded history (100 entries by default). Snapshots are stable between updates and deeply frozen at runtime. React observes them with `useSyncExternalStore`; it never owns a second document copy. Selection resolves from the latest snapshot, including after undo/redo. Deleting a selected shape clears selection; undo restores document data, not selection history.

Use `setTitle`, `addShape`, `updateShape`, `removeShape`, or `edit` for mutations. `edit` recipes receive an Immer draft and must be synchronous. Invalid edits are rejected before publication. Individual edits record Immer patches and inverse patches. For gestures, call `beginTransaction(label)`, perform live updates, then `commitTransaction()` or `cancelTransaction()`. Commit reconciles the starting and ending document, generating patches per changed shape or image-data object, independent of the number of pointer events. No-op gestures and cancellation preserve redo. Transactions cannot nest, and history navigation/loading is rejected while one is active. Keep unrelated operations outside a gesture transaction.

`serialization.ts` validates schema version, discriminants, components, finite geometry, nonnegative dimensions, and unique IDs. Only document data is serialized; callbacks, history, and selection are excluded. Unknown fields/types/versions are rejected rather than silently discarded. Version-0 JSON files gain an empty image collection. Version-1 files gain full-image source rectangles for their existing image shapes, and version-2 files gain a null original filename. Older formats migrate through version 4 to version 5, the current save format, with shapes assigned to Page 1; image IDs, palettes, pixels, and source regions are preserved. Previously imported separate assets stay separate.

Rectangles and circles support creation, movement, and resizing. Oval data/rendering is supported by the union, but oval creation and gestures remain deferred. Rounded-corner metadata remains stored; rectangle rendering retains its existing square-corner appearance. The legacy reducer helpers remain pure for compatibility; the UI uses only the store for edits.

See `plan.md` for the implementation scope.

## Validation and follow-up

The implementation passes 109 automated tests across the legacy document helpers, editor store, and multiple-document isolation. Coverage includes editing a non-first shape, immutable snapshots, subscriptions, add/delete history, grouped updates, cancellation, redo invalidation, invalid operations, bounded history, and JSON round trips for rectangle/circle/oval documents.

Strict TypeScript checking and the production build pass. Browser checks confirmed rectangle creation, property editing, live drag updates, and a single undo restoring the entire drag. No browser warnings or errors were observed. Native file-picker interaction and pointer-cancellation UI paths have not been manually exercised; store cancellation and JSON validation are tested automatically.

Browser checks for document tabs confirmed new-tab creation, preserved contents when switching, independent undo history, and arrow-key navigation. These UI checks are manual. Six model-level tests in `test/multiple-documents.test.ts` verify independent edits, selections, subscriptions, interleaved undo/redo, simultaneous transactions, loading, and opening another copy with the same shape IDs. These test the per-document stores without rendering the GUI; tab routing itself remains manually verified.

Eleven circle tests cover creation and serialization, hit testing, baseline movement, all four resize handles, off-center grabs, zero radius, grouped undo/redo, cancellation, and invalid geometry. Circle geometry helpers are shared by the canvas and tests. The new circle pointer interactions have not yet been manually verified in the browser.

Twenty-eight pixel-image and migration tests cover shared references, independent display bounds, immutable snapshots, document isolation, atomic creation, deletion, stroke grouping/cancellation, undo/redo, pencil interpolation, erasure, flood-fill boundaries, sampling, invalid data, JSON round trips, and version-0 migration. Type checking and production build pass. The user confirmed the pixel editor works in the live preview on 2026-10-04. Agent-driven browser verification was unavailable while the Mac was locked; this is not a full pointer-path UI audit.

Next steps include oval creation/interactions and rounded-corner rendering. Custom palettes, pixel-resolution changes, and unused-image cleanup are outside the current pixel-art scope.

Seven image-resize tests cover free and constrained resizing, shrinking and minimum bounds, modifier changes, zero-size bounds, and undo/redo without changing shared pixels. The creation UI offers square presets; the model still supports existing 1–256 pixel dimensions.


## Editor appearance and shared controls

The interface adapts the adjacent `layout-mockup` project's neutral panels, blue property-section headers, compact icon toolbars, menu shortcut columns, tree icons, select controls, dialogs, canvas grid, and transitions. The working editor's document model, history, selection, and pixel editing remain in place.

Use **Appearance** to choose System, Light, or Dark. The preference is stored locally in `layout-editor-theme`, separately from document data. The bottom-left and bottom-right icons toggle the layer tree and property panel. Property sections collapse individually. Menus support Up/Down, Home/End, Escape, and normal Tab navigation; icon buttons have accessible names and tooltips. Animation respects reduced-motion preferences.

Shared UI code lives in `src/ui/`: `controls.tsx` provides `IconButton`, `ToolbarGroup`, `MenuItem`, `PropertySection`, and `SelectControl`; `theme.css` defines color and sizing tokens; `theme.ts` persists the appearance choice; `animations.css` adapts the mockup transitions. `src/styles.css` contains base control styling and `src/app.css` contains editor layouts. Select controls use native HTML selects for keyboard and platform behavior. The mockup is not a runtime dependency.

Validation for this styling update: all 88 model tests, TypeScript, production build, and whitespace checks pass. Browser checks covered light/dark appearance, shape properties, image creation with size/palette selection, the inline pixel palette, undo, and keyboard menu opening/dismissal. This is not a full browser regression or native desktop audit.
