# Layout drawing tool

Run `npm install`, then `npm run dev`. Validate with `npm test` and `npm run build` (includes strict TypeScript checking).

## Editing

Use the **Shape** dropdown beside **File** to create shapes with **New Rect**, **New Circle**, or **New Pixel Image**. Both dropdowns close after an action, outside click, focus change, or Escape. Select shapes in the tree or canvas. Shift-click toggles a shape in the current selection; drag on empty canvas to select intersecting shapes. Drag a selected shape to move the whole selection. The property sheet shows components shared by all selected shapes, marks differing values as mixed, and applies edits to every selected shape. Delete removes the whole selection in one undo step. Drag a rectangle’s lower-right corner to resize; selected circles have four handles at the top, right, bottom, and left. Circle handles adjust the radius while keeping the center fixed, with a minimum radius of zero. Circle hit testing follows the circular area. Scroll the canvas viewport to pan, use Ctrl/Command-scroll or trackpad pinch to zoom around the pointer, and use Space-drag or middle-button drag for direct panning. Toolbar controls zoom from 25% to 400%. Zoom redraws the canvas at device-pixel-aware resolution while keeping shape coordinates unchanged; imported pixel images use nearest-neighbor rendering. One gesture or focused property-editing session creates one undo entry. Enter or blur commits an input session; Escape cancels. Pointer cancellation or loss of capture cancels an unfinished gesture.

Use Undo/Redo or Command/Control-Z, Shift-Command/Control-Z, and Control-Y outside text inputs. Text fields retain native text-edit shortcuts while focused.

The **File** dropdown contains Load file, New Document, and Save JSON. It closes after choosing an action, clicking outside, moving focus outside, or pressing Escape. Load file validates JSON before opening a document; invalid files leave existing tabs intact. New Document and successful loads open a new tab below the menu bar. Each tab retains its own document, selection, and undo/redo history. Save JSON saves the active document as `<document title>.json`, replacing filename-unsafe characters; a blank title uses `Untitled.json`. Tab titles follow document titles; use Left/Right arrows or Home/End while focused on the tab bar to switch documents. Open tabs live in memory; save each document before refreshing or leaving the page.

The left tree has collapsible document, Shapes, and Assets nodes. Expanding nodes reveals their children; the nested tree structure is ready to hold groups and pages.

## Pixel art images

Choose **Shape → New Pixel Image**, then **8 × 8**, **16 × 16**, or **32 × 32**, and select **PICO-8**, **Classic 16**, **Grayscale**, or **Pocket 4**. The image starts transparent and opens in a dedicated editor panel. Double-click an image shape, or select it and choose **Edit Pixels**, to reopen the editor.

- **Pencil (B)** paints the selected palette color; fast pointer movements interpolate a continuous stroke.
- **Eraser (E)** writes transparent pixels.
- **Flood fill (G)** fills connected pixels of the same color (four-way connectivity).
- **Color picker (I)** samples a pixel, including transparency, then returns to the pencil.
- Choose a swatch or transparency, adjust zoom, and toggle the grid (visible at 8× or above).

Each completed stroke or fill is one undo step in the document's history. Escape cancels an active stroke; otherwise it closes the panel. Closing preserves completed edits. Pointer cancellation, lost capture, or focus loss cancels an unfinished stroke.

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

`types.ts` contains only serializable data. `Document` version 3 retains the ordered `shapes` array; IDs are unique and drawing order is array order. `Shape` and `ShapeComponent` are discriminated unions. `editorTypes.ts` holds extension/UI contracts separately.

`Document.images` contains `PixelImageData` objects: stable ID, editable name, original imported filename (when available), dimensions, hex palette colors, and row-major palette indices (`-1` means transparent). Selecting an image asset opens its full-resolution asset view, where it can be renamed or exported as PNG. A `PixelImageShape` holds an image ID, an integer source rectangle within that asset, and separate display bounds. Multiple shapes can show different regions of one sprite sheet. Validation rejects dangling references, duplicate image IDs, invalid dimensions/palettes, wrong pixel counts, and invalid palette indices. Deleting a shape retains its image data, so other linked shapes and undo remain valid; unused-data cleanup is not implemented.

Use `createPixelImage`, `linkImageShape`, and `updatePixelImage` on the store. Creation adds image data and its first shape atomically. Pixel tool algorithms live in `pixelImages.ts` and operate on drafts through the store, with no GUI dependency. Image data participates in snapshots, transactions, undo/redo, and JSON save/load. The editor's tool, zoom, and selected color are transient UI state.

`DropdownMenu` shares disclosure, dismissal, and focus behavior between File and Shape. Creation actions live in Shape; selection-specific actions such as Edit Pixels, Linked Copy, and Delete remain in the toolbar.

`App` maintains an ordered list of tabs with stable IDs and one `EditorStore` per tab. The active tab supplies the editor, property sheet, save action, and history shortcuts. Each tab subscribes to its store for its title. Switching tabs blurs focused editor controls to finish input sessions and cancels any remaining transaction; canvas and property-sheet components remount for the active tab. Workspace tabs are not part of the saved JSON. Tab closing and session restoration are not implemented.

`EditorStore` owns the document, transient selection ID, and bounded history (100 entries by default). Snapshots are stable between updates and deeply frozen at runtime. React observes them with `useSyncExternalStore`; it never owns a second document copy. Selection resolves from the latest snapshot, including after undo/redo. Deleting a selected shape clears selection; undo restores document data, not selection history.

Use `setTitle`, `addShape`, `updateShape`, `removeShape`, or `edit` for mutations. `edit` recipes receive an Immer draft and must be synchronous. Invalid edits are rejected before publication. Individual edits record Immer patches and inverse patches. For gestures, call `beginTransaction(label)`, perform live updates, then `commitTransaction()` or `cancelTransaction()`. Commit reconciles the starting and ending document, generating patches per changed shape or image-data object, independent of the number of pointer events. No-op gestures and cancellation preserve redo. Transactions cannot nest, and history navigation/loading is rejected while one is active. Keep unrelated operations outside a gesture transaction.

`serialization.ts` validates schema version, discriminants, components, finite geometry, nonnegative dimensions, and unique IDs. Only document data is serialized; callbacks, history, and selection are excluded. Unknown fields/types/versions are rejected rather than silently discarded. Version-0 JSON files gain an empty image collection. Version-1 files gain full-image source rectangles for their existing image shapes, and version-2 files gain a null original filename. Older formats migrate to version 3, the current save format; image IDs, palettes, pixels, and source regions are preserved. Previously imported separate assets stay separate.

Rectangles and circles support creation, movement, and resizing. Oval data/rendering is supported by the union, but oval creation and gestures remain deferred. Rounded-corner metadata remains stored; rectangle rendering retains its existing square-corner appearance. The legacy reducer helpers remain pure for compatibility; the UI uses only the store for edits.

See `plan.md` for the implementation scope.

## Validation and follow-up

The implementation passes 88 automated tests across the legacy document helpers, editor store, and multiple-document isolation. Coverage includes editing a non-first shape, immutable snapshots, subscriptions, add/delete history, grouped updates, cancellation, redo invalidation, invalid operations, bounded history, and JSON round trips for rectangle/circle/oval documents.

Strict TypeScript checking and the production build pass. Browser checks confirmed rectangle creation, property editing, live drag updates, and a single undo restoring the entire drag. No browser warnings or errors were observed. Native file-picker interaction and pointer-cancellation UI paths have not been manually exercised; store cancellation and JSON validation are tested automatically.

Browser checks for document tabs confirmed new-tab creation, preserved contents when switching, independent undo history, and arrow-key navigation. These UI checks are manual. Six model-level tests in `test/multiple-documents.test.ts` verify independent edits, selections, subscriptions, interleaved undo/redo, simultaneous transactions, loading, and opening another copy with the same shape IDs. These test the per-document stores without rendering the GUI; tab routing itself remains manually verified.

Eleven circle tests cover creation and serialization, hit testing, baseline movement, all four resize handles, off-center grabs, zero radius, grouped undo/redo, cancellation, and invalid geometry. Circle geometry helpers are shared by the canvas and tests. The new circle pointer interactions have not yet been manually verified in the browser.

Twenty-eight pixel-image and migration tests cover shared references, independent display bounds, immutable snapshots, document isolation, atomic creation, deletion, stroke grouping/cancellation, undo/redo, pencil interpolation, erasure, flood-fill boundaries, sampling, invalid data, JSON round trips, and version-0 migration. Type checking and production build pass. The user confirmed the pixel editor works in the live preview on 2026-10-04. Agent-driven browser verification was unavailable while the Mac was locked; this is not a full pointer-path UI audit.

Next steps include oval creation/interactions and rounded-corner rendering. Custom palettes, pixel-resolution changes, and unused-image cleanup are outside the current pixel-art scope.

Seven image-resize tests cover free and constrained resizing, shrinking and minimum bounds, modifier changes, zero-size bounds, and undo/redo without changing shared pixels. The creation UI offers square presets; the model still supports existing 1–256 pixel dimensions.
