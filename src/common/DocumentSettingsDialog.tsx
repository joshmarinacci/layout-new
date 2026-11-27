import {useEffect, useId} from 'react';
import type {EditorStore} from '../model/EditorStore';
import {useEditorStore} from '../model/useEditorStore';
import {isValidGridSize, MAX_GRID_SIZE, MIN_GRID_SIZE} from '../model/grid';
import {GRID_STYLES, type GridSettings, type GridStyle} from '../model/types';
import {NumberInput} from '../ui/NumberInput';
import {SelectControl} from '../ui/controls';
import {EditorDialog} from './EditorDialog';

const STYLE_LABELS: Record<GridStyle, string> = {lines: 'Lines', dots: 'Dots', hidden: 'Invisible'};

/** Size and style inputs for one grid; sizes outside the allowed range are ignored until corrected. */
function GridFields({
    label,
    grid,
    onChange,
}: {
    label: string;
    grid: GridSettings;
    onChange: (grid: GridSettings) => void;
}) {
    const styleId = useId();
    return (
        <>
            <div className="number-input">
                <span className="title">Size</span>
                <NumberInput
                    label={`${label} size`}
                    value={grid.size}
                    min={MIN_GRID_SIZE}
                    onChange={size => {
                        if (isValidGridSize(size)) onChange({...grid, size});
                    }}
                />
            </div>
            <label className="number-input" htmlFor={styleId}>
                <span className="title">Style</span>
                <SelectControl
                    id={styleId}
                    aria-label={`${label} style`}
                    value={grid.style}
                    onChange={event => onChange({...grid, style: event.target.value as GridStyle})}
                >
                    {GRID_STYLES.map(style => (
                        <option key={style} value={style}>
                            {STYLE_LABELS[style]}
                        </option>
                    ))}
                </SelectControl>
            </label>
        </>
    );
}

/**
 * Grid settings for the document and the current page. Changes show on the canvas as they are made,
 * inside one transaction: Done keeps them as a single undo step, Cancel or Escape puts everything back.
 */
export function DocumentSettingsDialog({store, onClose}: {store: EditorStore; onClose: () => void}) {
    const state = useEditorStore(store);
    const page = state.document.pages.find(item => item.id === state.selectedPageId);
    const ownGridId = useId();
    useEffect(() => {
        store.beginTransaction('Document settings');
        return () => {
            // Closing any way other than Done (including the tab or app going away) discards the edits.
            if (store.getSnapshot().transactionActive) store.cancelTransaction();
        };
    }, [store]);
    if (!page) return null;
    return (
        <EditorDialog title="Document Settings" onClose={onClose}>
            <form
                className="document-settings-form"
                onSubmit={event => {
                    event.preventDefault();
                    if (store.getSnapshot().transactionActive) store.commitTransaction();
                    onClose();
                }}
            >
                <fieldset>
                    <legend>Document grid</legend>
                    <GridFields
                        label="Document grid"
                        grid={state.document.settings.grid}
                        onChange={grid => store.setDocumentGrid(grid)}
                    />
                </fieldset>
                <fieldset>
                    <legend>Page “{page.name}”</legend>
                    <div className="number-input">
                        <label className="title" htmlFor={ownGridId}>
                            Own grid
                        </label>
                        <input
                            id={ownGridId}
                            type="checkbox"
                            aria-label="Use a different grid on this page"
                            checked={!!page.grid}
                            onChange={event =>
                                store.setPageGrid(
                                    page.id,
                                    event.target.checked ? {...state.document.settings.grid} : null,
                                )
                            }
                        />
                    </div>
                    {page.grid && (
                        <GridFields
                            label="Page grid"
                            grid={page.grid}
                            onChange={grid => store.setPageGrid(page.id, grid)}
                        />
                    )}
                </fieldset>
                <p className="hint">
                    Sizes run from {MIN_GRID_SIZE} to {MAX_GRID_SIZE}. Turn the grid on with the grid button in the
                    canvas toolbar.
                </p>
                <footer>
                    <button type="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" data-dialog-autofocus>
                        Done
                    </button>
                </footer>
            </form>
        </EditorDialog>
    );
}
