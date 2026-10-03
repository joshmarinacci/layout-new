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
