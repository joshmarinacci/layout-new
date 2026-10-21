import {
    type EditorSnapshot,
    EditorStore,
    emptyDocument
} from "./model/EditorStore";
import {makeCircle, makeRect} from "./model/reducer";


import type {
    Bounds,
    Document as DrawingDocument,
    PixelImageData,
    Shape
} from './model/types';
import {makeVector} from "./shapes/vectorNetworks";
import type {PixelEditorController} from "./shapes/PixelImageEditor";
import {isTauri} from "@tauri-apps/api/core";
import {
    readSavedDocuments,
    type SavedDocumentRecord,
    writeSavedDocuments
} from "./io/savedDocuments";
import {
    type ShapeAlignment,
    shapeAlignmentOffsets,
    translateShape
} from "./model/shapeAlignment";
import {CommandRegistry} from './common/CommandRegistry';
import type {Theme} from './ui/theme';
import {type LucideIcon, Redo2Icon, Undo2Icon} from 'lucide-react';
import {newPalette, pico8Colors} from './shapes/palettes';

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
export type RenamePageState = {
    pageId: string
    name: string
}
export type ImageDialogConfig = {
    kind: 'create' | 'import'
} | {
    kind: 'edit';
    imageId: string;
    source?: Bounds;
    palettePosition?: { x: number; y: number };
    imageScreenRect?: Bounds
} | null


type Setter<W> = (s: W | ((w: W) => W)) => void

export type CommandContext = {
    store: EditorStore,
    state: EditorSnapshot,
    finishEditing: () => void,
    workspace: Workspace,
    setWorkspace: Setter<Workspace>,
    clipboard: ClipboardState,
    setClipboard: Setter<ClipboardState>
    commandPaletteOpen: boolean,
    setCommandPaletteOpen: Setter<boolean>
    setKeyboardShortcutsOpen: Setter<boolean>
    setSavedDocumentsOpen: Setter<boolean>
    leftPanelVisible: boolean
    setLeftPanelVisible: Setter<boolean>
    rightPanelVisible: boolean
    setRightPanelVisible: Setter<boolean>
    setRenamePageDialog: Setter<RenamePageState | null>
    setRenameDocumentName: Setter<string | null>
    setImageDialog: Setter<ImageDialogConfig>
    setRepeatingImageDialog: Setter<boolean>
    setVectorId: Setter<string | null>
    setPixelEditor: Setter<PixelEditorController | null>
    setError: Setter<string>
    setFileDialogOpen: Setter<boolean>
    setTheme: Setter<Theme>
    setSelectedAssetId: Setter<string | null>
    setSelectedPaletteId: Setter<string | null>
    openPaletteImport: () => void
}

export type CommandId =
    | 'undo'
    | 'redo'
    | 'new-document'
    | 'rename-document'
    | 'open-local-document'
    | 'save-local-document'
    | 'open-json-document'
    | 'save-json-document'
    | 'export-json'

    | 'new-page'
    | 'rename-page'
    | 'delete-page'
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

    | 'ui-toggle-right-sidebar'
    | 'ui-toggle-left-sidebar'
    | 'ui-show-command-palette'
    | 'ui-show-keyboard-shortcuts'
    | 'new-vector-network' | 'new-pixelimage' | 'new-repeatingimage'
    | 'new-page-rectangle' | 'new-page-circle'
    | 'import-png'
    | 'new-color-palette' | 'import-color-palette' | 'new-pico8-palette'
    | 'theme-system' | 'theme-light' | 'theme-dark'


export interface Command {
    id: CommandId;
    title: string;
    description: string;
    shortcut?: string;
    keywords?: string[];
    enabled: (ctx: CommandContext) => boolean
    run: (ctx: CommandContext) => void;
    icon?: LucideIcon
}

export const NewDocumentCommand: Command = {
    id: 'new-document',
    title: 'New Document',
    description: 'Create a blank document',
    keywords: ['file', 'create'],
    enabled: (ctx) => !ctx.state.transactionActive,
    run: (ctx) => openDocument(ctx, emptyDocument())
}
export const RenameDocumentCommand: Command = {
    id: 'rename-document',
    title: 'Rename Document',
    description: 'rename the document',
    enabled: ctx => ctx.state.document !== undefined,
    run: ctx => ctx.setRenameDocumentName(ctx.state.document.title)
}
export const OpenDocumentCommand: Command = {
    id: 'open-local-document',
    title: isTauri() ? 'Open Saved Document' : 'Open from Browser',
    description: 'opens a document from local storage',
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => {
        ctx.setSavedDocumentsOpen(true)
    }
}
export const SaveDocumentCommand: Command = {
    id: 'save-local-document',
    title: isTauri() ? 'Save Document' : 'Save to Browser',
    description: 'Save the current document',
    enabled: ctx => !ctx.state.transactionActive,
    keywords: ['file'],
    run: ctx => saveToBrowser(ctx)
}
export const OpenJsonCommand: Command = {
    id: 'open-json-document',
    title: 'Import JSON',
    description: 'Imports a portable JSON file from disk',
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => ctx.setFileDialogOpen(true)
}
export const SaveJsonCommand: Command = {
    id: 'save-json-document',
    title: 'Export JSON',
    description: 'exports current document as a portable JSON file',
    keywords: ['save', 'download', 'file'],
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => saveDocument(ctx)
}

export const NewPageCommand: Command = {
    id: 'new-page',
    title: 'New Page',
    description: 'add a new page to the current document',
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => ctx.store.createPage()
}
export const RenamePageCommand: Command = {
    id: 'rename-page',
    title: 'Rename page',
    description: 'Rename the selected page',
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => {
        const pageId = ctx.state.selectedPageId
        const page = ctx.state.document.pages.find(item => item.id === pageId);
        if (page) ctx.setRenamePageDialog({pageId, name: page.name});
    }
}
export const DeletePageCommand: Command = {
    id: 'delete-page',
    title: 'Delete page',
    description: 'Delete the selected page',
    enabled: ctx => ctx.state.document.pages.length > 1 && !ctx.state.transactionActive,
    run: ctx => ctx.store.deletePage(ctx.state.selectedPageId)
}


export const UndoCommand: Command = {
    id: 'undo',
    title: 'Undo',
    description: 'Undo the last change',
    keywords: ['history', 'edit'],
    enabled: (ctx) => ctx.state.canUndo,
    run: ctx => ctx.store.undo(),
    icon: Undo2Icon,
}
export const RedoCommand: Command = {
    id: 'redo',
    title: 'Redo',
    description: 'Redo the last undone change',
    keywords: ['history', 'edit'],
    enabled: ctx => ctx.state.canRedo,
    run: ctx => ctx.store.redo(),
    icon: Redo2Icon
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

export const NewPageRectangleCommand: Command = {
    id: 'new-page-rectangle',
    title: 'New Rectangle',
    description: 'create a new rectangle o the page',
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => {
        ctx.store.selectPage(ctx.state.selectedPageId);
        const shape = makeRect('Rectangle', {
            x: 50,
            y: 50,
            width: 100,
            height: 80
        });
        ctx.store.addShape(shape);
        ctx.store.select(shape.id);
    }
}
export const NewPageCircleCommand: Command = {
    id: 'new-page-circle',
    title: 'New Circle',
    enabled: ctx => !ctx.state.transactionActive,
    description: 'Create a new circle on the page',
    run: ctx => {
        ctx.store.selectPage(ctx.state.selectedPageId);
        const shape = makeCircle('Circle', {x: 100, y: 100}, 40);
        ctx.store.addShape(shape);
        ctx.store.select(shape.id);
    }
}
export const NewVectorNetworkCommand: Command = {
    id: 'new-vector-network',
    title: 'New Vector Network',
    description: 'create a new vector network shape',
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => createVector(ctx)
}
export const NewPixelImageCommand: Command = {
    id: 'new-pixelimage',
    title: 'New Pixel Image',
    description: 'create a new pixel art image',
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => {
        ctx.setImageDialog({kind: 'create'});
    }
}
export const NewRepeatingImageCommand: Command = {
    id: 'new-repeatingimage',
    title: 'New Repeating Image',
    description: 'create a repeating image',
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => {
        ctx.setRepeatingImageDialog(true);
    }
}
export const ImportPNGCommand: Command = {
    id: 'import-png',
    title: 'Import PNG',
    description: 'import a png into pixel art',
    enabled: () => true,
    run: ctx => ctx.setImageDialog({kind: 'import'})
}

export const NewColorPaletteCommand: Command = {
    id: 'new-color-palette', title: 'New Color Palette', description: 'Create a new editable color palette',
    keywords: ['asset', 'palette', 'colors', 'create'],
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => {
        try {
            const palette = newPalette();
            ctx.store.edit('Create palette', draft => {draft.palettes.push(palette);});
            ctx.store.select(null);
            ctx.setSelectedAssetId(null);
            ctx.setSelectedPaletteId(palette.id);
            ctx.setError('');
        } catch (error) { ctx.setError(error instanceof Error ? error.message : 'Unable to create palette'); }
    }
};
export const ImportColorPaletteCommand: Command = {
    id: 'import-color-palette', title: 'Import Color Palette', description: 'Import a GIMP, JSON, or hex-list palette',
    keywords: ['asset', 'palette', 'colors', 'gpl', 'json', 'import'],
    enabled: ctx => !ctx.state.transactionActive,
    run: ctx => ctx.openPaletteImport()
};
export const NewPico8PaletteCommand: Command = {
    id: 'new-pico8-palette', title: 'Add PICO-8 Palette', description: 'Add the PICO-8 color palette to Assets',
    keywords: ['asset', 'palette', 'colors', 'preset'], enabled: ctx => !ctx.state.transactionActive,
    run: ctx => {const palette = newPalette('PICO-8', pico8Colors); ctx.store.edit('Create PICO-8 palette', draft => { draft.palettes.push(palette); }); ctx.setSelectedAssetId(null); ctx.setSelectedPaletteId(palette.id); ctx.store.select(null);}
};

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
    keywords: ['selection', 'remove', 'edit'],
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
    enabled: ctx => ctx.clipboard.shapes.length > 0 && !ctx.state.transactionActive,
    run: ctx => {
        if (ctx.clipboard.shapes.length) ctx.store.pasteShapes(ctx.clipboard.shapes, ctx.clipboard.images);
    }
}

export const ShowCommandPaletteCommand: Command = {
    id: 'ui-show-command-palette',
    title: 'Show Command Palette',
    description: 'show the command palette',
    keywords: ['view', 'commands'],
    enabled: () => true,
    run: ctx => {
        ctx.setCommandPaletteOpen(true)
    }
}

export const ShowKeyboardShortcutsCommand: Command = {
    id: 'ui-show-keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    description: 'Show all keyboard shortcuts grouped by command keywords',
    keywords: ['help', 'keyboard', 'shortcuts'],
    enabled: () => true,
    run: ctx => ctx.setKeyboardShortcutsOpen(true)
}

export const ToggleLeftSidebar: Command = {
    id: 'ui-toggle-left-sidebar',
    title: 'Toggle Left Sidebar',
    description: 'Toggle the left sidebar',
    keywords: ['view', 'panels'],
    enabled: () => true,
    run: ctx => ctx.setLeftPanelVisible(!ctx.leftPanelVisible)
}
export const ToggleRightSidebar: Command = {
    id: 'ui-toggle-right-sidebar',
    title: 'Toggle Right Sidebar',
    description: 'Toggle the right sidebar',
    keywords: ['view', 'panels'],
    enabled: () => true,
    run: ctx => ctx.setRightPanelVisible(!ctx.rightPanelVisible)
}

export const SystemThemeCommand: Command = {
    id: 'theme-system',
    title: 'System Theme',
    description: 'Use the system appearance preference',
    enabled: () => true,
    run: ctx => ctx.setTheme('system')
};
export const LightThemeCommand: Command = {
    id: 'theme-light',
    title: 'Light Theme',
    description: 'Use the light appearance',
    enabled: () => true,
    run: ctx => ctx.setTheme('light')
};
export const DarkThemeCommand: Command = {
    id: 'theme-dark',
    title: 'Dark Theme',
    description: 'Use the dark appearance',
    enabled: () => true,
    run: ctx => ctx.setTheme('dark')
};


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

const createVector = (ctx: CommandContext) => {
    ctx.store.selectPage(ctx.state.selectedPageId);
    const shape = makeVector();
    ctx.store.addShape(shape);
    ctx.store.select(shape.id);
    ctx.setImageDialog(null)
    ctx.setPixelEditor(null);
    ctx.setVectorId(shape.id);
    // setPageMenu(null);
};


const saveDocument = (ctx: CommandContext) => {
    const url = URL.createObjectURL(new Blob([ctx.store.toJSON()], {type: 'application/json'}));
    const safeTitle = ctx.state.document.title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/\.+$/g, '') || 'Untitled';
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeTitle}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const saveToBrowser = async (ctx: CommandContext) => {
    try {
        const json = ctx.store.toJSON();
        const records = await readSavedDocuments();
        const activeTab = ctx.workspace.tabs.find(tab => tab.id === ctx.workspace.activeId)!;

        const id = activeTab.savedDocumentId ?? crypto.randomUUID();
        const prior = records.find(record => record.id === id);
        const record: SavedDocumentRecord = {
            id,
            name: prior?.name ?? (ctx.state.document.title.trim() || 'Untitled'),
            savedAt: new Date().toISOString(),
            json
        };
        await writeSavedDocuments([...records.filter(item => item.id !== id), record]);
        ctx.setWorkspace(current => ({
            ...current,
            tabs: current.tabs.map(tab => tab.id === activeTab.id ? {
                ...tab,
                savedDocumentId: id,
                savedJson: json
            } : tab)
        }));
        ctx.setError('');
    } catch (reason) {
        ctx.setError(reason instanceof Error ? reason.message : 'Unable to save document');
    }
};


export const AlignLeftCommand: Command = {
    id: 'align-left',
    title: 'Align Left',
    description: 'Align selected shapes to their left edges',
    keywords: ['align', 'alignment', 'distribute'],
    run: ctx => applyAlignment(ctx, 'left'),
    enabled: ctx => getSelectedShapes(ctx).length >= 2,
}

export const AlignCenterCommand: Command = {
    id: 'align-center',
    title: 'Align Horizontal Center',
    description: 'Align selected shapes by horizontal center',
    keywords: ['align', 'alignment', 'distribute'],
    run: ctx => applyAlignment(ctx, 'center'),
    enabled: ctx => getSelectedShapes(ctx).length >= 2,
}
export const AlignRightCommand: Command = {
    id: 'align-right',
    title: 'Align Right',
    description: 'Align selected shapes to their right edges',
    keywords: ['align', 'alignment', 'distribute'],
    run: ctx => applyAlignment(ctx, 'right'),
    enabled: ctx => getSelectedShapes(ctx).length >= 2,
}
export const AlignTopCommand: Command = {
    id: 'align-top',
    title: 'Align Top',
    description: 'Align selected shapes to their top edges',
    keywords: ['align', 'alignment', 'distribute'],
    run: ctx => applyAlignment(ctx, 'top'),
    enabled: ctx => getSelectedShapes(ctx).length >= 2,
}
export const AlignMiddleCommand: Command = {
    id: 'align-middle',
    title: 'Align Vertical Middle',
    description: 'Align selected shapes by vertical middle',
    keywords: ['align', 'alignment', 'distribute'],
    run: ctx => applyAlignment(ctx, 'middle'),
    enabled: ctx => getSelectedShapes(ctx).length >= 2,
}
export const AlignBottomCommand: Command = {
    id: 'align-bottom',
    title: 'Align Bottom',
    description: 'Align selected shapes to their bottom edges',
    keywords: ['align', 'alignment', 'distribute'],
    run: ctx => applyAlignment(ctx, 'bottom'),
    enabled: ctx => getSelectedShapes(ctx).length >= 2,
}
export const AlignDistributeHorizontalCommand: Command = {
    id: 'align-distribute-horizontal',
    title: 'Distribute Horizontally',
    description: 'Space three or more shapes evenly across',
    keywords: ['align', 'alignment', 'distribute'],
    run: ctx => applyAlignment(ctx, 'distribute-horizontal'),
    enabled: ctx => getSelectedShapes(ctx).length >= 3
}
export const AlignDistributeVerticalCommand: Command = {
    id: 'align-distribute-vertical',
    title: 'Distribute Vertically',
    description: 'Space three or more shapes evenly down',
    keywords: ['align', 'alignment', 'distribute'],
    run: ctx => applyAlignment(ctx, 'distribute-vertical'),
    enabled: ctx => getSelectedShapes(ctx).length >= 3
}

/** Canonical command definitions used by the palette, shortcuts, menus, and native menu events. */
export const allCommands: Command[] = [
    NewDocumentCommand, RenameDocumentCommand, OpenDocumentCommand, SaveDocumentCommand,
    OpenJsonCommand, SaveJsonCommand, NewPageCommand, RenamePageCommand, DeletePageCommand,
    UndoCommand, RedoCommand, NewRectCommand, NewCircleCommand, NewPageRectangleCommand,
    NewPageCircleCommand, NewVectorNetworkCommand, NewPixelImageCommand, NewRepeatingImageCommand,
    ImportPNGCommand, NewColorPaletteCommand, ImportColorPaletteCommand, NewPico8PaletteCommand,
    SelectionGroupCommand, SelectionUngroupCommand, SelectionDuplicateCommand,
    SelectionDeleteCommand, SelectionCopyCommand, SelectionCutCommand, SelectionPasteCommand,
    ShowCommandPaletteCommand, ShowKeyboardShortcutsCommand, ToggleLeftSidebar, ToggleRightSidebar, SystemThemeCommand,
    LightThemeCommand, DarkThemeCommand, AlignLeftCommand,
    AlignCenterCommand, AlignRightCommand, AlignTopCommand, AlignMiddleCommand,
    AlignBottomCommand, AlignDistributeHorizontalCommand, AlignDistributeVerticalCommand
];

export const commandRegistry = new CommandRegistry(allCommands);


// enabled: (ctx) => {
// const pageShapes = ctx.state.document.shapes.filter(shape => shape.pageId === ctx.state.selectedPageId);
// const selectedShapes = pageShapes.filter(shape => ctx.state.selectedIds.includes(shape.id));
// return !ctx.state.transactionActive && selectedShapes.length >= (alignment.startsWith('distribute') ? 3 : 2)
// },
// run: (ctx) => applyAlignment(ctx,alignment)

function getSelectedShapes(ctx: CommandContext): Array<Shape> {
    const pageShapes = ctx.state.document.shapes.filter(shape => shape.pageId === ctx.state.selectedPageId);
    const selectedShapes = pageShapes.filter(shape => ctx.state.selectedIds.includes(shape.id));
    return selectedShapes
}

const applyAlignment = (ctx: CommandContext, alignment: ShapeAlignment) => {
    const pageShapes = ctx.state.document.shapes.filter(shape => shape.pageId === ctx.state.selectedPageId);
    const selectedShapes = pageShapes.filter(shape => ctx.state.selectedIds.includes(shape.id));
    if (selectedShapes.length < 2) return;
    const offsets = shapeAlignmentOffsets(selectedShapes, alignment);
    const selectedIds = new Set(offsets.keys());
    ctx.store.edit('Align shapes', draft => {
        for (const shape of draft.shapes) {
            if (!selectedIds.has(shape.id)) continue;
            const offset = offsets.get(shape.id)!;
            if (offset.x || offset.y) translateShape(shape, offset.x, offset.y);
        }
    });
};
