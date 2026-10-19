import {type EditorSnapshot, EditorStore} from "./EditorStore";
import {makeCircle, makeRect} from "./reducer";


import type {Document as DrawingDocument} from './types';

export interface DocumentTab {
    id: string;
    store: EditorStore;
    savedDocumentId: string | null;
    savedJson: string | null
}

export type Workspace = {
    tabs: DocumentTab[]
    activeId: string
}

export type CommandContext = {
    store: EditorStore,
    state: EditorSnapshot,
    finishEditing: () => void,
    workspace: Workspace,
    setWorkspace: (workspace: Workspace) => void
}

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
    enabled: (ctx: CommandContext) => boolean
    run: (ctx: CommandContext) => void;
}

export const UndoCommand: Command = {
    id: 'undo',
    title: 'Undo',
    description: 'Undo the last change',
    enabled: (ctx) => ctx.state.canUndo,
    run: ctx => ctx.store.undo()
}
export const RedoCommand: Command = {
    id: 'redo',
    title: 'Redo',
    description: 'Redo the last undone change',
    enabled: ctx => ctx.state.canRedo,
    run: ctx => ctx.store.redo()
}

export const NewRectCommand: Command = {
    id: 'new-rectangle',
    title: 'New Rectangle xx',
    description: 'Add a rectangle to the current page',
    keywords: ['shape', 'rect', 'create'],
    // enabled: ctx => !selectedAssetId && !state.transactionActive,
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => {
        const shape = makeRect('rect', {x: 50, y: 250, width: 50, height: 50});
        ctx.store.addShape(shape);
        ctx.store.select(shape.id);
    }
}

export const NewCircleCommand: Command = {
    id: 'new-circle',
    title: 'New Circle',
    description: 'Add a circle to the current page',
    keywords: ['shape', 'oval', 'create'],
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => {
        const shape = makeCircle('circle', {x: 100, y: 300}, 40);
        ctx.store.addShape(shape);
        ctx.store.select(shape.id);
    }
}
// enabled: ctx => !selectedAssetId && !state.transactionActive,

export const NewPageCommand: Command = {
    id: 'new-page',
    title: 'New Page',
    description: 'add a new page to the current document',
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => {
        ctx.store.createPage();
    }
}


export function makeTab(document: DrawingDocument, savedDocumentId: string | null = null, savedJson: string | null = null): DocumentTab {
    return {
        id: crypto.randomUUID(),
        store: new EditorStore(document),
        savedDocumentId,
        savedJson
    };
}
