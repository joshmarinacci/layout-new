import {type EditorSnapshot, EditorStore, emptyDocument} from "./EditorStore";
import {makeCircle, makeRect} from "./reducer";


import type {Document as DrawingDocument, PixelImageData, Shape} from './types';

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
export type ClipboardState = {
    shapes: Shape[]
    images: PixelImageData[]
}

type Setter<W> = (w: W) => W

export type CommandContext = {
    store: EditorStore,
    state: EditorSnapshot,
    finishEditing: () => void,
    workspace: Workspace,
    setWorkspace: (s: Workspace | Setter<Workspace>) => void,
    clipboard: ClipboardState,
    setClipboard: (s: ClipboardState | Setter<ClipboardState>) => void
}

export type CommandId =
    | 'undo'
    | 'redo'
    | 'new-document'
    | 'save'
    | 'export-json'
    | 'new-page'
    | 'new-rectangle'
    | 'new-circle'

    | 'selection-group'
    | 'selection-ungroup'
    | 'selection-duplicate'
    | 'selection-delete'
    | 'selection-copy'
    | 'selection-cut'
    | 'selection-paste'

    | 'align-left'
    | 'align-center'
    | 'align-right'
    | 'align-top'
    | 'align-middle'
    | 'align-bottom'
    | 'align-distribute-vertical'
    | 'align-distribute-horizontal'

    | 'open-palette'
    | 'toggle-right-sidebar'
    | 'toggle-left-sidebar'

export interface Command {
    id: CommandId;
    title: string;
    description: string;
    shortcut?: string;
    keywords?: string[];
    enabled: (ctx: CommandContext) => boolean
    run: (ctx: CommandContext) => void;
}

export const NewDocumentCommand: Command = {
    id: 'new-document',
    title: 'New Document',
    description: 'Create a blank document',
    keywords: ['file', 'create'],
    enabled: (ctx) => !ctx.state.transactionActive,
    run: (ctx) => openDocument(ctx, emptyDocument())
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
export const NewPageCommand: Command = {
    id: 'new-page',
    title: 'New Page',
    description: 'add a new page to the current document',
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => {
        ctx.store.createPage();
    }
}

export const SelectionGroupCommand: Command = {
    id: 'selection-group',
    title: 'group selection',
    description: 'group the selection',
    enabled: () => true,
    run: ctx => {
        const shapes = getSelected(ctx.store);
        if (!shapes.length) return;
        ctx.store.createGroup(ctx.state.selectedPageId, shapes.map(shape => shape.id), `Group ${ctx.state.document.pages.flatMap(page => page.groups).length + 1}`);
    }
}
export const SelectionUngroupCommand: Command = {
    id: 'selection-ungroup',
    title: 'Ungroup selection',
    description: 'ungroup the selection',
    enabled: () => true,
    run: ctx => {
        ctx.store.ungroupSelection(getSelected(ctx.store).map(shape => shape.id));
    }
}
export const SelectionDuplicateCommand: Command = {
    id: 'selection-duplicate',
    title: 'Duplicate Selection',
    description: 'Make a copy of selected shapes',
    keywords: ['copy'],
    enabled: ctx => !!ctx.state.selectedIds.length && !ctx.state.transactionActive,
    run: (ctx) => {
        let shapes = getSelected(ctx.store)
        if (shapes.length) {
            ctx.store.duplicateShapes(shapes.map(shape => shape.id))
        }
    }
}
export const SelectionDeleteCommand: Command = {
    id: 'selection-delete',
    title: 'Delete',
    description: 'Remove selected shapes',
    keywords: ['remove'],
    enabled: ctx => !!ctx.state.selectedIds.length && !ctx.state.transactionActive,
    run: (ctx) => {
        let shapes = getSelected(ctx.store)
        if (!shapes.length) return;
        ctx.store.beginTransaction('Delete selection');
        shapes.forEach(shape => ctx.store.removeShape(shape.id));
        ctx.store.commitTransaction();
        ctx.store.select(null);
    }
}

export const SelectionCopyCommand: Command = {
    id: 'selection-copy',
    title: 'Copy',
    description: 'Copy Selected shapes',
    enabled: (ctx) => ctx.store.getSnapshot().selectedIds.length > 0,
    run: (ctx) => {
        const shapes = getSelected(ctx.store);
        const ids = new Set(shapes.filter((shape): shape is Extract<Shape, {
            type: 'pixel-image' | 'repeating-image'
        }> => shape.type === 'pixel-image' || shape.type === 'repeating-image')
            .map(shape => shape.components.image.imageId));
        ctx.setClipboard({
            shapes: structuredClone(shapes),
            images: structuredClone(ctx.store.getSnapshot().document.images.filter(image => ids.has(image.id)))
        });
    }
}
export const SelectionCutCommand: Command = {
    id: 'selection-cut',
    title: 'Cut',
    description: 'Cut selected shapes',
    enabled: ctx => ctx.store.getSnapshot().selectedIds.length > 0 && !ctx.state.transactionActive,
    run: ctx => {
        SelectionCopyCommand.run(ctx)
        SelectionDeleteCommand.run(ctx)
    }
}

export const SelectionPasteCommand: Command = {
    id: 'selection-paste',
    title: 'Paste',
    description: 'Paste shapes from clipboard',
    enabled: ctx => ctx.clipboard.shapes.length>0 && !ctx.state.transactionActive,
    run: ctx => {
        if (ctx.clipboard.shapes.length) ctx.store.pasteShapes(ctx.clipboard.shapes, ctx.clipboard.images);
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

export const openDocument = (ctx: CommandContext, document: DrawingDocument) => {
    const tab = makeTab(document);
    ctx.finishEditing();
    ctx.setWorkspace((current: Workspace) => ({
        tabs: [...current.tabs, tab],
        activeId: tab.id
    }));
};

const getSelected = (store: EditorStore) => store.getSnapshot().document.shapes.filter(shape => store.getSnapshot().selectedIds.includes(shape.id));
