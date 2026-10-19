import type {EditorSnapshot, EditorStore} from "./EditorStore";
import {makeCircle, makeRect} from "./reducer";

export type CommandId =
    | 'undo' | 'redo'
    | 'new-document' | 'save' | 'export-json'
    | 'new-page'
    | 'new-rectangle' | 'new-circle'
    | 'align-left' | 'align-center' | 'align-right'
    | 'align-top' | 'align-middle' | 'align-bottom'
    | 'align-distribute-vertical' | 'align-distribute-horizontal'
    | 'duplicate' | 'delete'
    | 'open-palette'
    | 'toggle-right-sidebar' | 'toggle-left-sidebar'

export interface Command {
    id: CommandId;
    title: string;
    description: string;
    shortcut?: string;
    keywords?: string[];
    enabled: (store: EditorStore, state: EditorSnapshot) => boolean
    run: (store: EditorStore, state: EditorSnapshot) => void;
}

export const UndoCommand: Command = {
    id: 'undo',
    title: 'Undo',
    description: 'Undo the last change',
    enabled: (store, state) => state.canUndo,
    run: (store, state) => store.undo()
}
export const RedoCommand: Command = {
    id: 'redo',
    title: 'Redo',
    description: 'Redo the last undone change',
    enabled: (store, state) => state.canRedo,
    run: (store, state) => store.redo()
}


export const NewRectCommand: Command = {
    id: 'new-rectangle',
    title: 'New Rectangle xx',
    description: 'Add a rectangle to the current page',
    keywords: ['shape', 'rect', 'create'],
    // enabled: (store, state) => !selectedAssetId && !state.transactionActive,
    enabled: (store, state) => !state.transactionActive,
    run: store => {
        const shape = makeRect('rect', {x: 50, y: 250, width: 50, height: 50});
        store.addShape(shape);
        store.select(shape.id);
    }
}

export const NewPageCommand: Command = {
    id: 'new-page',
    title: 'New Page',
    description: 'add a new page to the current document',
    enabled: (store, state) => !state.transactionActive,
    run: (store: EditorStore) => {
        store.createPage();
    }
}

export const NewCircleCommand: Command = {
    id: 'new-circle',
    title: 'New Circle x',
    description: 'Create a new circle',
    enabled: (store, state) => !state.transactionActive,
    run: store => {
        const shape = makeCircle('circle', {x: 100, y: 300}, 40);
        store.addShape(shape);
        store.select(shape.id);
    }
}
