# Layout drawing tool

Run `npm install`, then `npm run dev`. Validate with `npm test` and `npm run build` (includes strict TypeScript checking).

## Editing

Create rectangles with **New Rect**. Select shapes in the tree or canvas. Edit position, size, fill, and stroke in the property sheet. Drag rectangles to move them, or drag inside their lower-right corner to resize. One gesture or focused property-editing session creates one undo entry. Enter or blur commits an input session; Escape cancels. Pointer cancellation or loss of capture cancels an unfinished gesture.

Use Undo/Redo or Command/Control-Z, Shift-Command/Control-Z, and Control-Y outside text inputs. Text fields retain native text-edit shortcuts while focused.

The **File** dropdown contains Load file, New Document, and Save JSON. It closes after choosing an action, clicking outside, moving focus outside, or pressing Escape. Load file validates JSON before opening a document; invalid files leave existing tabs intact. New Document and successful loads open a new tab below the menu bar. Each tab retains its own document, selection, and undo/redo history. Save JSON saves the active document. Tab titles follow document titles; use Left/Right arrows or Home/End while focused on the tab bar to switch documents. Open tabs live in memory; save each document before refreshing or leaving the page.

## Architecture

`types.ts` contains only serializable data. `Document` version 0 retains the ordered `shapes` array; IDs are unique and drawing order is array order. `Shape` and `ShapeComponent` are discriminated unions. `editorTypes.ts` holds extension/UI contracts separately.

`App` maintains an ordered list of tabs with stable IDs and one `EditorStore` per tab. The active tab supplies the editor, property sheet, save action, and history shortcuts. Each tab subscribes to its store for its title. Switching tabs blurs focused editor controls to finish input sessions and cancels any remaining transaction; canvas and property-sheet components remount for the active tab. Workspace tabs are not part of the saved JSON. Tab closing and session restoration are not implemented.

`EditorStore` owns the document, transient selection ID, and bounded history (100 entries by default). Snapshots are stable between updates and deeply frozen at runtime. React observes them with `useSyncExternalStore`; it never owns a second document copy. Selection resolves from the latest snapshot, including after undo/redo. Deleting a selected shape clears selection; undo restores document data, not selection history.

Use `setTitle`, `addShape`, `updateShape`, `removeShape`, or `edit` for mutations. `edit` recipes receive an Immer draft and must be synchronous. Invalid edits are rejected before publication. Individual edits record Immer patches and inverse patches. For gestures, call `beginTransaction(label)`, perform live updates, then `commitTransaction()` or `cancelTransaction()`. Commit reconciles the starting and ending document, generating patches per changed shape, independent of the number of pointer events. No-op gestures and cancellation preserve redo. Transactions cannot nest, and history navigation/loading is rejected while one is active. Keep unrelated operations outside a gesture transaction.

`serialization.ts` validates schema version, discriminants, components, finite geometry, nonnegative dimensions, and unique IDs. Only document data is serialized; callbacks, history, and selection are excluded. Unknown fields/types/versions are rejected rather than silently discarded. No migrations are implemented yet.

Rectangles and the existing circle remain rendered. Oval data/rendering is supported by the union, but new shape tools are intentionally deferred. Rounded-corner metadata remains stored; rectangle rendering retains its existing square-corner appearance. The legacy reducer helpers remain pure for compatibility; the UI uses only the store for edits.

See `plan.md` for the implementation scope.

## Validation and follow-up

The implementation passes 18 automated tests across the legacy document helpers and the editor store. Coverage includes editing a non-first shape, immutable snapshots, subscriptions, add/delete history, grouped updates, cancellation, redo invalidation, invalid operations, bounded history, and JSON round trips for rectangle/circle/oval documents.

Strict TypeScript checking and the production build pass. Browser checks confirmed rectangle creation, property editing, live drag updates, and a single undo restoring the entire drag. No browser warnings or errors were observed. Native file-picker interaction and pointer-cancellation UI paths have not been manually exercised; store cancellation and JSON validation are tested automatically.

Browser checks for document tabs confirmed new-tab creation, preserved contents when switching, independent undo history, and arrow-key navigation. These UI checks are manual; the 18 automated tests cover the existing model and store.

Next steps are adding shape-specific creation tools and interactions, implementing rounded-corner rendering, and defining schema migrations before changing the saved-document format.
