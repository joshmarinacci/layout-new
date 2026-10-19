import {
    Maximize2,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
    Redo2,
    SunMoon,
    Trash2,
    Undo2,
    ZoomIn,
    ZoomOut
} from 'lucide-react';
import {type MouseEvent, useEffect, useRef, useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {
    delete_selection,
    duplicate_selection,
    page_menu_actions,
} from "./actions";
import {DropdownMenu} from './DropdownMenu';
import {CommandPalette} from './CommandPalette';
import {keybindings, matchesKeybinding} from './keybindings';
import {EditorDialog} from './EditorDialog';
import {type EditorSnapshot, EditorStore, emptyDocument} from './EditorStore';
import {makeExampleDocument} from './exampleDocument';
import {ImportPixelImage} from './ImportPixelImage';
import {NewPixelImage} from './NewPixelImage';
import {NewRepeatingImage} from './NewRepeatingImage';
import {PixelAssetView} from './PixelAssetView';
import {type PixelEditorController, PixelImageEditor} from './PixelImageEditor';
import PropSheet from './PropSheet';
import {
    readSavedDocuments,
    type SavedDocumentRecord,
    writeSavedDocuments
} from './savedDocuments';
import {SavedDocumentsDialog} from './SavedDocumentsDialog';
import {deserializeDocument} from './serialization';
import {
    type ShapeAlignment,
    shapeAlignmentOffsets,
    translateShape
} from './shapeAlignment';
import TreeView from './TreeView';
import type {
    Bounds,
    Document as DrawingDocument,
    PixelImageData,
    Shape
} from './types';
import {IconButton, MenuItem, ToolbarGroup} from './ui/controls';
import {useTheme} from './ui/theme';
import {useEditorStore} from './useEditorStore';
import {makeVector} from './vectorNetworks';
import VisualEditor from './VisualEditor';
import './app.css';
import {
    type Command,
    NewCircleCommand,
    NewPageCommand,
    NewRectCommand,
    UndoCommand
} from "./commands";

interface DocumentTab {
    id: string;
    store: EditorStore;
    savedDocumentId: string | null;
    savedJson: string | null
}

function makeTab(document: DrawingDocument, savedDocumentId: string | null = null, savedJson: string | null = null): DocumentTab {
    return {
        id: crypto.randomUUID(),
        store: new EditorStore(document),
        savedDocumentId,
        savedJson
    };
}

function DocumentTabButton({tab, active, activate, onContextMenu}: {
    tab: DocumentTab;
    active: boolean;
    activate: () => void
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void
}) {
    const {document} = useEditorStore(tab.store);
    const dirty = tab.savedJson !== tab.store.toJSON();
    return <button role="tab" id={`tab-${tab.id}`} aria-selected={active}
                   aria-controls="document-editor"
                   tabIndex={active ? 0 : -1} onClick={activate}
                   onContextMenu={onContextMenu}
                   title={`${document.title || 'Untitled'}${dirty ? ' — unsaved in browser storage' : ' — saved in browser storage'}`}>
        {document.title || 'Untitled'}{dirty ? ' •' : ''}
    </button>;
}

function StoreActionButton({command, disabled, store, state}: {
    command: Command,
    disabled: boolean,
    store: EditorStore,
    state: EditorSnapshot
}) {
    return <button disabled={disabled}
                   onClick={() => command.run(store, state)}>{command.title}</button>
}

export default function App() {
    const [theme, setTheme] = useTheme();
    const [workspace, setWorkspace] = useState(() => {
        const tab = makeTab(makeExampleDocument());
        return {tabs: [tab], activeId: tab.id};
    });
    const activeTab = workspace.tabs.find(tab => tab.id === workspace.activeId)!;
    const store = activeTab.store;
    const activeStore = useRef(store);
    activeStore.current = store;
    const finishEditing = () => {
        if (document.activeElement instanceof HTMLElement && document.activeElement.closest('#document-editor')) {
            document.activeElement.blur();
        }
        if (activeStore.current.getSnapshot().transactionActive) activeStore.current.cancelTransaction();
    };
    const openDocument = (document: DrawingDocument) => {
        const tab = makeTab(document);
        finishEditing();
        setWorkspace(current => ({
            tabs: [...current.tabs, tab],
            activeId: tab.id
        }));
    };
    const activateTab = (id: string) => {
        if (id === workspace.activeId) return;
        finishEditing();
        setSelectedAssetId(null);
        setWorkspace(current => ({...current, activeId: id}));
    };
    const state = useEditorStore(store);
    const doc = state.document;
    const selected = doc.shapes.find(shape => shape.id === state.selectedId);
    const pageShapes = doc.shapes.filter(shape => shape.pageId === state.selectedPageId);
    const selectedShapes = pageShapes.filter(shape => state.selectedIds.includes(shape.id));
    const file = useRef<HTMLInputElement>(null);
    const [error, setError] = useState('');
    const [canvasZoom, setCanvasZoom] = useState(1);
    const [leftPanelVisible, setLeftPanelVisible] = useState(true);
    const [rightPanelVisible, setRightPanelVisible] = useState(true);
    const [imageDialog, setImageDialog] = useState<{
        kind: 'create' | 'import'
    } | {
        kind: 'edit';
        imageId: string;
        source?: Bounds;
        palettePosition?: { x: number; y: number };
        imageScreenRect?: Bounds
    } | null>(null);
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const [vectorId, setVectorId] = useState<string | null>(null);
    useEffect(() => {
        setVectorId(null);
        setImageDialog(null);
        setPixelEditor(null);
    }, [store, state.selectedPageId]);
    useEffect(() => {
        if (vectorId && (!doc.shapes.some(s => s.id === vectorId) || !state.selectedIds.includes(vectorId) || selectedAssetId)) setVectorId(null);
    }, [doc, state.selectedIds, vectorId, selectedAssetId]);
    const createVector = (pageId = state.selectedPageId) => {
        store.selectPage(pageId);
        const shape = makeVector();
        store.addShape(shape);
        store.select(shape.id);
        setImageDialog(null);
        setPixelEditor(null);
        setVectorId(shape.id);
        setPageMenu(null);
    };
    const [pixelEditor, setPixelEditor] = useState<PixelEditorController | null>(null);
    const [repeatingImageDialog, setRepeatingImageDialog] = useState(false);
    const [clipboard, setClipboard] = useState<{
        shapes: Shape[];
        images: PixelImageData[]
    }>({shapes: [], images: []});
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number
    } | null>(null);
    const [documentMenu, setDocumentMenu] = useState<{
        x: number;
        y: number
    } | null>(null);
    const [pageMenu, setPageMenu] = useState<{
        x: number;
        y: number;
        pageId: string
    } | null>(null);
    const [pagesMenu, setPagesMenu] = useState<{
        x: number;
        y: number
    } | null>(null);
    const [renamePageDialog, setRenamePageDialog] = useState<{
        pageId: string;
        name: string
    } | null>(null);
    const [renameDocumentName, setRenameDocumentName] = useState<string | null>(null);
    const [savedDocumentsOpen, setSavedDocumentsOpen] = useState(false);
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const selectedAsset = doc.images.find(image => image.id === selectedAssetId);
    const saveDocument = () => {
        const url = URL.createObjectURL(new Blob([store.toJSON()], {type: 'application/json'}));
        const safeTitle = doc.title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/\.+$/g, '') || 'Untitled';
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeTitle}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const saveToBrowser = async () => {
        try {
            const json = store.toJSON();
            const records = await readSavedDocuments();
            const id = activeTab.savedDocumentId ?? crypto.randomUUID();
            const prior = records.find(record => record.id === id);
            const record: SavedDocumentRecord = {
                id,
                name: prior?.name ?? (doc.title.trim() || 'Untitled'),
                savedAt: new Date().toISOString(),
                json
            };
            await writeSavedDocuments([...records.filter(item => item.id !== id), record]);
            setWorkspace(current => ({
                ...current,
                tabs: current.tabs.map(tab => tab.id === activeTab.id ? {
                    ...tab,
                    savedDocumentId: id,
                    savedJson: json
                } : tab)
            }));
            setError('');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Unable to save document');
        }
    };
    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            if (matchesKeybinding(event, keybindings.find(binding => binding.commandId === 'open-palette')!)) {
                event.preventDefault();
                setCommandPaletteOpen(value => !value);
                return;
            }
            if (matchesKeybinding(event, keybindings.find(binding => binding.commandId === 'toggle-left-sidebar')!)) {
                event.preventDefault();
                setLeftPanelVisible(value => !value);
                return;
            }
            if (matchesKeybinding(event, keybindings.find(binding => binding.commandId === 'toggle-right-sidebar')!)) {
                event.preventDefault();
                setRightPanelVisible(value => !value);
                return;
            }
            if (commandPaletteOpen) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    setCommandPaletteOpen(false);
                }
                return;
            }
            if (event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable)) return;
            if (imageDialog?.kind === 'edit') {
                const key = event.key.toLowerCase();
                if (key === 'escape') {
                    event.preventDefault();
                    pixelEditor?.cancel();
                    setImageDialog(null);
                    setPixelEditor(null);
                    return;
                }
                const shortcuts = {
                    b: 'pencil',
                    e: 'eraser',
                    g: 'fill',
                    i: 'picker',
                    m: 'move'
                } as const;
                if (key in shortcuts && !event.metaKey && !event.ctrlKey && !event.altKey && !store.getSnapshot().transactionActive) {
                    event.preventDefault();
                    pixelEditor?.setTool(shortcuts[key as keyof typeof shortcuts]);
                    return;
                }
            }
            if (store.getSnapshot().transactionActive) return;
            if (event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable)) return;
            const boundCommand = keybindings.find(binding => binding.commandId !== 'open-palette' && matchesKeybinding(event, binding));
            if (boundCommand) {
                const command = commands.find(item => item.id === boundCommand.commandId);
                if (command && command.enabled && command.enabled(store, state)) {
                    event.preventDefault();
                    command.run(store, state);
                    return;
                }
            }
            const key = event.key.toLowerCase();
            if ((event.metaKey || event.ctrlKey) && !event.altKey && key === 'o') {
                event.preventDefault();
                if (!store.getSnapshot().transactionActive) {
                    if (event.shiftKey) setSavedDocumentsOpen(true);
                    else file.current?.click();
                }
                return;
            }
            if ((event.metaKey || event.ctrlKey) && !event.altKey && key === 's') {
                event.preventDefault();
                if (!store.getSnapshot().transactionActive) saveToBrowser();
                return;
            }
            if (vectorId && (key === 'delete' || key === 'backspace' || ((event.metaKey || event.ctrlKey) && ['d', 'x', 'c', 'v'].includes(key)))) return;
            if (key === 'delete' || key === 'backspace') {
                if (!store.getSnapshot().selectedIds.length || store.getSnapshot().transactionActive) return;
                event.preventDefault();
                delete_selection.perform(store, getSelected())
                return;
            }
            if ((event.metaKey || event.ctrlKey) && !event.altKey && ['d', 'x', 'c', 'v'].includes(key)) {
                event.preventDefault();
                if (key === 'd') duplicate_selection.perform(store, getSelected())
                if (key === 'c') copySelection();
                if (key === 'x') {
                    copySelection();
                    delete_selection.perform(store, getSelected())
                }
                if (key === 'v') pasteSelection();
                return;
            }
            if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
                event.preventDefault();
                if (event.shiftKey || event.key.toLowerCase() === 'y') store.redo(); else store.undo();
            }
        };
        window.addEventListener('keydown', keydown);
        return () => window.removeEventListener('keydown', keydown);
    }, [store, selectedAssetId, state.selectedIds, doc, activeTab, workspace, imageDialog, pixelEditor, vectorId, commandPaletteOpen]);
    useEffect(() => {
        const close = () => {
            setContextMenu(null);
            setDocumentMenu(null);
            setPageMenu(null);
            setPagesMenu(null);
        };
        window.addEventListener('pointerdown', close);
        window.addEventListener('blur', close);
        return () => {
            window.removeEventListener('pointerdown', close);
            window.removeEventListener('blur', close);
        };
    }, []);
    const getSelected = () => store.getSnapshot().document.shapes.filter(shape => store.getSnapshot().selectedIds.includes(shape.id));
    const copySelection = () => {
        const shapes = getSelected();
        const ids = new Set(shapes.filter((shape): shape is Extract<Shape, {
            type: 'pixel-image' | 'repeating-image'
        }> => shape.type === 'pixel-image' || shape.type === 'repeating-image')
            .map(shape => shape.components.image.imageId));
        setClipboard({
            shapes: structuredClone(shapes),
            images: structuredClone(store.getSnapshot().document.images.filter(image => ids.has(image.id)))
        });
    };
    const pasteSelection = () => {
        if (clipboard.shapes.length) store.pasteShapes(clipboard.shapes, clipboard.images);
    };
    const groupSelection = () => {
        const shapes = getSelected();
        if (!shapes.length) return;
        store.createGroup(state.selectedPageId, shapes.map(shape => shape.id), `Group ${doc.pages.flatMap(page => page.groups).length + 1}`);
    };
    const ungroupSelection = () => store.ungroupSelection(getSelected().map(shape => shape.id));
    const selectedUngrouped = selectedShapes.some(shape => !doc.pages.flatMap(page => page.groups)
        .some(group => group.shapeIds.includes(shape.id)));
    const selectedGrouped = selectedShapes.some(shape => doc.pages.flatMap(page => page.groups)
        .some(group => group.shapeIds.includes(shape.id)));
    const showShapeContextMenu = (event: MouseEvent<HTMLElement>, shape: Shape) => {
        event.preventDefault();
        setDocumentMenu(null);
        const snap = store.getSnapshot();
        if (!snap.selectedIds.includes(shape.id)) store.select(shape.id);
        setContextMenu({x: event.clientX, y: event.clientY});
    };
    const showPageContextMenu = (event: MouseEvent<HTMLElement>, pageId: string) => {
        event.preventDefault();
        setDocumentMenu(null);
        store.selectPage(pageId);
        setContextMenu(null);
        setPageMenu({x: event.clientX, y: event.clientY, pageId});
    };
    const renamePage = (pageId: string) => {
        const page = doc.pages.find(item => item.id === pageId);
        if (page) setRenamePageDialog({pageId, name: page.name});
    };
    const applyAlignment = (alignment: ShapeAlignment) => {
        if (selectedShapes.length < 2) return;
        const offsets = shapeAlignmentOffsets(selectedShapes, alignment);
        const selectedIds = new Set(offsets.keys());
        store.edit('Align shapes', draft => {
            for (const shape of draft.shapes) {
                if (!selectedIds.has(shape.id)) continue;
                const offset = offsets.get(shape.id)!;
                if (offset.x || offset.y) translateShape(shape, offset.x, offset.y);
            }
        });
    };
    const commands: Command[] = [
        {
            id: 'save',
            title: isTauri() ? 'Save Document' : 'Save to Browser',
            description: 'Save the current document',
            keywords: ['file'],
            enabled: (_store, state) => !state.transactionActive,
            run: () => {
                void saveToBrowser();
            }
        },
        {
            id: 'export-json',
            title: 'Export JSON',
            description: 'Download the document as a JSON file',
            keywords: ['save', 'download', 'file'],
            run: saveDocument,
            enabled: (store, state) => true
        },
        {
            id: 'new-document',
            title: 'New Document',
            description: 'Create a blank document',
            keywords: ['file', 'create'],
            enabled: (store, state) => !state.transactionActive,
            run: () => openDocument(emptyDocument())
        },
        NewPageCommand,
        NewRectCommand,
        {
            id: 'new-circle',
            title: 'New Circle',
            description: 'Add a circle to the current page',
            keywords: ['shape', 'oval', 'create'],
            enabled: (store, state) => !selectedAssetId && !state.transactionActive,
            run: (store, state) => NewCircleCommand.run(store, state)
        },
        {
            id: 'duplicate',
            title: 'Duplicate Selection',
            description: 'Make a copy of selected shapes',
            keywords: ['copy'],
            enabled: (store, state) => !!state.selectedIds.length && !state.transactionActive,
            run: (store, state) => duplicate_selection.perform(store, getSelected())
        },
        {
            id: 'delete',
            title: 'Delete Selection',
            description: 'Remove selected shapes',
            keywords: ['remove'],
            enabled: (store, state) => !!state.selectedIds.length && !state.transactionActive,
            run: (store, state) => delete_selection.perform(store, getSelected())
        },
        UndoCommand,
        ...([
            ['left', 'Align Left', 'Align selected shapes to their left edges'],
            ['center', 'Align Horizontal Center', 'Align selected shapes by horizontal center'],
            ['right', 'Align Right', 'Align selected shapes to their right edges'],
            ['top', 'Align Top', 'Align selected shapes to their top edges'],
            ['middle', 'Align Vertical Middle', 'Align selected shapes by vertical middle'],
            ['bottom', 'Align Bottom', 'Align selected shapes to their bottom edges'],
            ['distribute-horizontal', 'Distribute Horizontally', 'Space three or more shapes evenly across'],
            ['distribute-vertical', 'Distribute Vertically', 'Space three or more shapes evenly down']
        ] as const).map(([alignment, title, description]) => ({
            id: `align-${alignment}`,
            title,
            description,
            keywords: ['align', 'alignment', 'distribute'],
            enabled: (store: EditorStore, state: EditorSnapshot) => !selectedAssetId && !state.transactionActive && selectedShapes.length >= (alignment.startsWith('distribute') ? 3 : 2),
            run: () => applyAlignment(alignment)
        } as Command))
    ];
    const nativeMenuAction = useRef<(id: string) => void>(() => {
    });
    nativeMenuAction.current = id => {
        if (store.getSnapshot().transactionActive) return;
        switch (id) {
            case 'new-document':
                openDocument(emptyDocument());
                break;
            case 'open-saved':
                setSavedDocumentsOpen(true);
                break;
            case 'load-json':
                file.current?.click();
                break;
            case 'save-document':
                void saveToBrowser();
                break;
            case 'export-json':
                saveDocument();
                break;
            case 'undo':
                store.undo();
                break;
            case 'redo':
                store.redo();
                break;
            case 'duplicate':
                if (store.getSnapshot().selectedIds.length) duplicate_selection.perform(store, getSelected());
                break;
            case 'delete':
                if (store.getSnapshot().selectedIds.length) delete_selection.perform(store, getSelected());
                break;
            case 'cut':
                if (store.getSnapshot().selectedIds.length) {
                    copySelection();
                    delete_selection.perform(store, getSelected());
                }
                break;
            case 'copy':
                copySelection();
                break;
            case 'paste':
                pasteSelection();
                break;
            case 'new-page':
                NewPageCommand.run(store, state);
                break;
            case 'rename-page':
                renamePage(store.getSnapshot().selectedPageId);
                break;
            case 'delete-page':
                if (store.getSnapshot().document.pages.length > 1) store.deletePage(store.getSnapshot().selectedPageId);
                break;
            case 'new-vector':
                if (!selectedAssetId) createVector();
                break;
            case 'new-rectangle':
                if (!selectedAssetId) NewRectCommand.run(store, state)
                break;
            case 'new-circle':
                if (!selectedAssetId) NewCircleCommand.run(store, state);
                break;
            case 'new-pixel-image':
                if (!selectedAssetId) setImageDialog({kind: 'create'});
                break;
            case 'new-repeating-image':
                if (!selectedAssetId && doc.images.length) setRepeatingImageDialog(true);
                break;
            case 'import-png':
                if (!selectedAssetId) setImageDialog({kind: 'import'});
                break;
            case 'theme-system':
                setTheme('system');
                break;
            case 'theme-light':
                setTheme('light');
                break;
            case 'theme-dark':
                setTheme('dark');
                break;
        }
    };
    useEffect(() => {
        if (!isTauri()) return;
        let unlisten: (() => void) | undefined;
        let disposed = false;
        void listen<string>('native-menu-action', event => nativeMenuAction.current(event.payload))
            .then(dispose => {
                if (disposed) dispose();
                else unlisten = dispose;
            })
            .catch(reason => setError(reason instanceof Error ? `Unable to connect native menu: ${reason.message}` : 'Unable to connect native menu'));
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, []);
    const undo = <IconButton label="Undo" icon={Undo2} disabled={!state.canUndo}
                             onClick={() => store.undo()}/>;
    const redo = <IconButton label="Redo" icon={Redo2} disabled={!state.canRedo}
                             onClick={() => store.redo()}/>;
    return <div className={`main-layout${isTauri() ? ' tauri-mode' : ''}`}>
        <nav className="menubar full-span">
            <DropdownMenu title="File">
                <MenuItem disabled={state.transactionActive}
                          onClick={() => openDocument(emptyDocument())}
                          label="New Document"
                          shortcut={keybindings.find(binding => binding.commandId === 'new-document')?.mac ?? '⌘N'}/>
                <hr className="menu-separator" aria-hidden="true"/>
                <MenuItem disabled={state.transactionActive}
                          onClick={() => setSavedDocumentsOpen(true)}
                          label={isTauri() ? 'Open Saved Document' : 'Open from Browser'}
                          shortcut="⌘⇧O / Ctrl+Shift+O"/>
                <button disabled={state.transactionActive}
                        onClick={() => file.current?.click()}>Load JSON file
                </button>
                <hr className="menu-separator" aria-hidden="true"/>
                <MenuItem disabled={state.transactionActive}
                          onClick={() => void saveToBrowser()}
                          label={isTauri() ? 'Save Document' : 'Save to Browser'}
                          shortcut="⌘S / Ctrl+S"/>
                <button disabled={state.transactionActive}
                        onClick={saveDocument}>Export JSON
                </button>
            </DropdownMenu>
            <DropdownMenu title="Edit">
                <MenuItem
                    disabled={!state.selectedIds.length || state.transactionActive}
                    onClick={() => duplicate_selection.perform(store, getSelected())}
                    label={duplicate_selection.title} shortcut="⌘D / Ctrl+D"/>
                <button
                    disabled={!state.selectedIds.length || state.transactionActive}
                    onClick={() => delete_selection.perform(store, getSelected())}
                >{delete_selection.title}</button>
                <MenuItem
                    disabled={!state.selectedIds.length || state.transactionActive}
                    onClick={() => {
                        copySelection();
                        delete_selection.perform(store, getSelected())
                    }} label="Cut" shortcut="⌘X / Ctrl+X"/>
                <MenuItem
                    disabled={!state.selectedIds.length || state.transactionActive}
                    onClick={copySelection} label="Copy"
                    shortcut="⌘C / Ctrl+C"/>
                <MenuItem
                    disabled={!clipboard.shapes.length || state.transactionActive}
                    onClick={pasteSelection} label="Paste"
                    shortcut="⌘V / Ctrl+V"/>
            </DropdownMenu>
            <DropdownMenu title="View">
                <MenuItem label="Show Command Palette"
                          shortcut={keybindings.find(binding => binding.commandId === 'open-palette')?.mac ?? '⌘⇧P'}
                          onClick={() => setCommandPaletteOpen(true)}/>
                <hr className="menu-separator" aria-hidden="true"/>
                <MenuItem
                    label={`${leftPanelVisible ? '✓ Hide' : 'Show'} Left Sidebar`}
                    shortcut={keybindings.find(binding => binding.commandId === 'toggle-left-sidebar')?.mac}
                    onClick={() => setLeftPanelVisible(value => !value)}/>
                <MenuItem
                    label={`${rightPanelVisible ? '✓ Hide' : 'Show'} Right Sidebar`}
                    shortcut={keybindings.find(binding => binding.commandId === 'toggle-right-sidebar')?.mac}
                    onClick={() => setRightPanelVisible(value => !value)}/>
            </DropdownMenu>
            <DropdownMenu title="Page">
                <StoreActionButton command={NewPageCommand}
                                   disabled={state.transactionActive}
                                   state={state}
                                   store={store}/>
                <button disabled={state.transactionActive}
                        onClick={() => renamePage(state.selectedPageId)}>Rename
                    Page
                </button>
                <button
                    disabled={doc.pages.length <= 1 || state.transactionActive}
                    onClick={() => store.deletePage(state.selectedPageId)}>Delete
                    Page
                </button>
            </DropdownMenu>
            {!selectedAsset && <DropdownMenu title="Shape">
                <button disabled={state.transactionActive}
                        onClick={() => createVector()}>New Vector
                    Network
                </button>
                <StoreActionButton command={NewRectCommand}
                                   disabled={state.transactionActive}
                                   state={state}
                                   store={store}/>
                <StoreActionButton command={NewCircleCommand}
                                   disabled={state.transactionActive}
                                   store={store}
                                   state={state}
                />
                <button disabled={state.transactionActive}
                        onClick={() => setImageDialog({kind: 'create'})}>New
                    Pixel Image
                </button>
                <button disabled={state.transactionActive || !doc.images.length}
                        onClick={() => setRepeatingImageDialog(true)}>New
                    Repeating Image
                </button>
                <button disabled={state.transactionActive}
                        onClick={() => setImageDialog({kind: 'import'})}>Import
                    PNG
                </button>
            </DropdownMenu>}
            {!selectedAsset && selectedShapes.length > 1 &&
                <DropdownMenu title="Align">
                    <MenuItem label="Align Left"
                              onClick={() => applyAlignment('left')}/>
                    <MenuItem label="Align Horizontal Center"
                              onClick={() => applyAlignment('center')}/>
                    <MenuItem label="Align Right"
                              onClick={() => applyAlignment('right')}/>
                    <MenuItem label="Align Top"
                              onClick={() => applyAlignment('top')}/>
                    <MenuItem label="Align Vertical Middle"
                              onClick={() => applyAlignment('middle')}/>
                    <MenuItem label="Align Bottom"
                              onClick={() => applyAlignment('bottom')}/>
                    <hr className="menu-separator" aria-hidden="true"/>
                    <MenuItem label="Distribute Horizontally"
                              disabled={selectedShapes.length < 3}
                              onClick={() => applyAlignment('distribute-horizontal')}/>
                    <MenuItem label="Distribute Vertically"
                              disabled={selectedShapes.length < 3}
                              onClick={() => applyAlignment('distribute-vertical')}/>
                </DropdownMenu>}
            <ToolbarGroup label="History">{undo}{redo}</ToolbarGroup>
            <span className="spacer"/>
            <DropdownMenu title="Appearance" icon={SunMoon}>
                {(['system', 'light', 'dark'] as const).map(value => <MenuItem
                    key={value}
                    label={`${theme === value ? '✓ ' : ''}${value === 'system' ? 'System theme' : value === 'light' ? 'Light theme' : 'Dark theme'}`}
                    onClick={() => setTheme(value)}/>)}
            </DropdownMenu>
            <input hidden ref={file} type="file" accept=".json,application/json"
                   onChange={async event => {
                       const chosen = event.target.files?.[0];
                       event.target.value = '';
                       if (!chosen) return;
                       try {
                           openDocument(deserializeDocument(await chosen.text()));
                           setError('');
                       } catch (error) {
                           setError(error instanceof Error ? error.message : 'Unable to load document');
                       }
                   }}/>
        </nav>
        <div className="document-tabs full-span" role="tablist"
             aria-label="Open documents"
             onKeyDown={event => {
                 const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                 if (!offset && event.key !== 'Home' && event.key !== 'End') return;
                 event.preventDefault();
                 const index = workspace.tabs.findIndex(tab => tab.id === workspace.activeId);
                 const next = event.key === 'Home' ? 0 : event.key === 'End' ? workspace.tabs.length - 1
                     : (index + offset + workspace.tabs.length) % workspace.tabs.length;
                 const tab = workspace.tabs[next];
                 activateTab(tab.id);
                 document.getElementById(`tab-${tab.id}`)?.focus();
             }}>
            {workspace.tabs.map(tab => <DocumentTabButton key={tab.id} tab={tab}
                                                          active={tab.id === workspace.activeId}
                                                          activate={() => activateTab(tab.id)}
                                                          onContextMenu={event => {
                                                              event.preventDefault();
                                                              if (tab.id !== workspace.activeId) activateTab(tab.id);
                                                              setContextMenu(null);
                                                              setPageMenu(null);
                                                              setPagesMenu(null);
                                                              setDocumentMenu({
                                                                  x: event.clientX,
                                                                  y: event.clientY
                                                              });
                                                          }}/>)}
        </div>
        <div id="document-editor"
             className={`document-editor full-span${leftPanelVisible ? '' : ' hide-left'}${rightPanelVisible ? '' : ' hide-right'}`}
             role="tabpanel" aria-labelledby={`tab-${activeTab.id}`}>
            <div className="toolbar full-span" key={activeTab.id}>
                {selectedAsset &&
                    <button onClick={() => setSelectedAssetId(null)}>Back to
                        canvas</button>}
                {!selectedAsset &&
                    <div className="canvas-zoom-controls" role="group"
                         aria-label="Canvas zoom controls">
                        <IconButton label="Zoom out" icon={ZoomOut}
                                    disabled={canvasZoom <= 0.25}
                                    onClick={() => setCanvasZoom(value => Math.max(0.25, value / 1.25))}/>
                        <span
                            aria-live="polite">{Math.round(canvasZoom * 100)}%</span>
                        <IconButton label="Zoom in" icon={ZoomIn}
                                    disabled={canvasZoom >= 4}
                                    onClick={() => setCanvasZoom(value => Math.min(4, value * 1.25))}/>
                        <IconButton label="Reset zoom" icon={Maximize2}
                                    onClick={() => setCanvasZoom(1)}/>
                    </div>}
                {!selectedAsset && selectedShapes.length === 1 && selected?.type === 'vector' &&
                    <button disabled={state.transactionActive} onClick={() => {
                        setImageDialog(null);
                        setPixelEditor(null);
                        setVectorId(selected.id);
                    }}>Edit Vector</button>}
                {!selectedAsset && selectedShapes.length === 1 && selected?.type === 'pixel-image' && <>
                    <button disabled={state.transactionActive}
                            onClick={() => setImageDialog({
                                kind: 'edit',
                                imageId: selected.components.image.imageId,
                                source: selected.components.image.source
                            })}>Edit Pixels
                    </button>
                    <button disabled={state.transactionActive}
                            onClick={() => store.select(store.linkImageShape(selected.id))}>Linked
                        Copy
                    </button>
                </>}
                {!selectedAsset &&
                    <IconButton label="Delete selected shapes" icon={Trash2}
                                disabled={!selectedShapes.length || state.transactionActive}
                                onClick={() => delete_selection.perform(store, getSelected())}/>}

            </div>
            <div className="left scroll-container"><h2
                className="panel-heading">Layers &amp; assets</h2><TreeView
                document={doc}
                selectedIds={state.selectedIds}
                selectedAssetId={selectedAssetId}
                onDocumentContextMenu={event => {
                    event.preventDefault();
                    setContextMenu(null);
                    setPageMenu(null);
                    setPagesMenu(null);
                    setDocumentMenu({x: event.clientX, y: event.clientY});
                }}
                onSelect={(shape, additive) => {
                    setSelectedAssetId(null);
                    additive ? store.toggleSelection(shape.id) : store.select(shape.id);
                }}
                onSelectAsset={image => {
                    finishEditing();
                    store.select(null);
                    setSelectedAssetId(image.id);
                }}
                onShapeContextMenu={(event, shape) => showShapeContextMenu(event, shape)}
                selectedPageId={state.selectedPageId}
                onSelectPage={id => store.selectPage(id)}
                onUngroup={id => store.ungroup(id)}
                onRenameGroup={(id, name) => store.renameGroup(id, name)}
                onSelectGroup={ids => store.setSelection(ids)}
                onPageContextMenu={showPageContextMenu}
                onPagesContextMenu={event => {
                    event.preventDefault();
                    setDocumentMenu(null);
                    setContextMenu(null);
                    setPageMenu(null);
                    setPagesMenu({
                        x: event.clientX,
                        y: event.clientY
                    });
                }}
                onReorderPage={(id, targetId, position) => store.reorderPage(id, targetId, position)}
                onReorderShape={(pageId, id, targetId, position) => store.reorderShapes(pageId, id, targetId, position)}/>
            </div>
            {selectedAsset ?
                <div className="asset-center scroll-container"><PixelAssetView
                    store={store}
                    image={selectedAsset}
                    onBack={() => setSelectedAssetId(null)}/>
                </div> : <>
                    <div
                        className={`center${imageDialog?.kind === 'edit' ? ' pixel-edit-active' : ''}`}>
                        <VisualEditor key={activeTab.id} store={store}
                                      zoom={canvasZoom}
                                      onZoomChange={setCanvasZoom}
                                      vectorId={vectorId}
                                      onEditVector={setVectorId}
                                      pixelEditor={pixelEditor}
                                      onEditImage={(reference, palettePosition, imageScreenRect) => {
                                          setVectorId(null);
                                          setImageDialog({
                                              kind: 'edit',
                                              imageId: reference.imageId,
                                              source: reference.source,
                                              palettePosition,
                                              imageScreenRect
                                          });
                                      }}
                                      onShapeContextMenu={showShapeContextMenu}
                                      onCanvasContextMenu={event => {
                                          event.preventDefault();
                                          setContextMenu(null);
                                          setPageMenu({
                                              x: event.clientX,
                                              y: event.clientY,
                                              pageId: state.selectedPageId
                                          });
                                      }}/>{imageDialog?.kind === 'edit' &&
                        <PixelImageEditor key={imageDialog.imageId}
                                          store={store}
                                          imageId={imageDialog.imageId}
                                          source={imageDialog.source}
                                          initialPosition={imageDialog.palettePosition}
                                          imageScreenRect={imageDialog.imageScreenRect}
                                          onController={setPixelEditor}
                                          onClose={() => {
                                              setImageDialog(null);
                                              setPixelEditor(null);
                                          }}/>}</div>
                    <div className="right scroll-container"><h2
                        className="panel-heading">Properties</h2><PropSheet
                        key={activeTab.id}
                        store={store}/></div>
                </>}
        </div>
        <div className="statusbar full-span"><span
            role="alert">{error}</span><span
            className="spacer"/><label>Scroll to pan; Ctrl/⌘+scroll to zoom;
            Space or middle-drag to
            pan. Shift-click toggles selection; drag empty canvas to select.
            Drag selected shapes to
            move; Option/Alt-drag to duplicate. Handles resize. Shift-resize
            images to keep
            proportions. Double-click a pixel image or vector network to
            edit.</label></div>
        <footer className="statusbar full-span">
            <IconButton
                label={leftPanelVisible ? 'Hide tree panel' : 'Show tree panel'}
                icon={leftPanelVisible ? PanelLeftClose : PanelLeftOpen}
                aria-pressed={leftPanelVisible}
                onClick={() => setLeftPanelVisible(value => !value)}/>
            <span role="alert">{error}</span>
            <span className="status-hint"
                  title="Scroll to pan · Ctrl/⌘+scroll to zoom · Space-drag to pan · Shift-click to select multiple · Alt-drag to duplicate · Double-click images to edit pixels">Scroll to pan · Ctrl/⌘+scroll to zoom · Shift-click for multiple selection · Double-click images to edit</span>
            <IconButton
                label={rightPanelVisible ? 'Hide properties panel' : 'Show properties panel'}
                icon={rightPanelVisible ? PanelRightClose : PanelRightOpen}
                aria-pressed={rightPanelVisible}
                onClick={() => setRightPanelVisible(value => !value)}/>
        </footer>
        {contextMenu &&
            <div className="shape-context-menu"
                 style={{left: contextMenu.x, top: contextMenu.y}}
                 role="menu" onContextMenu={event => event.preventDefault()}
                 onPointerDown={event => event.stopPropagation()}>
                {selectedUngrouped && <button role="menuitem" onClick={() => {
                    groupSelection();
                    setContextMenu(null);
                }}>Group</button>}
                {selectedGrouped && <button role="menuitem" onClick={() => {
                    ungroupSelection();
                    setContextMenu(null);
                }}>Ungroup</button>}
                <button role="menuitem" disabled={!state.selectedIds.length}
                        onClick={() => {
                            duplicate_selection.perform(store, getSelected())
                            setContextMenu(null);
                        }}>{duplicate_selection.title}</button>
                <button role="menuitem" disabled={!state.selectedIds.length}
                        onClick={() => {
                            delete_selection.perform(store, getSelected())
                            setContextMenu(null);
                        }}
                >{delete_selection.title}</button>
                <button role="menuitem" disabled={!state.selectedIds.length}
                        onClick={() => {
                            copySelection();
                            delete_selection.perform(store, getSelected())
                            setContextMenu(null);
                        }}
                >Cut
                </button>
                <button role="menuitem" disabled={!state.selectedIds.length}
                        onClick={() => {
                            copySelection();
                            setContextMenu(null);
                        }}>Copy
                </button>
                <button role="menuitem" disabled={!clipboard.shapes.length}
                        onClick={() => {
                            pasteSelection();
                            setContextMenu(null);
                        }}>Paste
                </button>
                {selectedShapes.length > 1 && <>
                    <hr className="menu-separator" aria-hidden="true"/>
                    <button role="menuitem" onClick={() => {
                        applyAlignment('left');
                        setContextMenu(null);
                    }}>Align Left
                    </button>
                    <button role="menuitem" onClick={() => {
                        applyAlignment('center');
                        setContextMenu(null);
                    }}>Align Horizontal Center
                    </button>
                    <button role="menuitem" onClick={() => {
                        applyAlignment('right');
                        setContextMenu(null);
                    }}>Align Right
                    </button>
                    <button role="menuitem" onClick={() => {
                        applyAlignment('top');
                        setContextMenu(null);
                    }}>Align Top
                    </button>
                    <button role="menuitem" onClick={() => {
                        applyAlignment('middle');
                        setContextMenu(null);
                    }}>Align Vertical Middle
                    </button>
                    <button role="menuitem" onClick={() => {
                        applyAlignment('bottom');
                        setContextMenu(null);
                    }}>Align Bottom
                    </button>
                    <hr className="menu-separator" aria-hidden="true"/>
                    <button role="menuitem" disabled={selectedShapes.length < 3}
                            onClick={() => {
                                applyAlignment('distribute-horizontal');
                                setContextMenu(null);
                            }}>Distribute Horizontally
                    </button>
                    <button role="menuitem" disabled={selectedShapes.length < 3}
                            onClick={() => {
                                applyAlignment('distribute-vertical');
                                setContextMenu(null);
                            }}>Distribute Vertically
                    </button>
                </>}
            </div>}
        {documentMenu && <div className="shape-context-menu" style={{
            left: documentMenu.x,
            top: documentMenu.y
        }}
                              role="menu" aria-label="Document actions"
                              onContextMenu={event => event.preventDefault()}
                              onPointerDown={event => event.stopPropagation()}>
            <button role="menuitem" onClick={() => {
                setDocumentMenu(null);
                setRenameDocumentName(doc.title);
            }}>Rename Document
            </button>
            <button role="menuitem" disabled={state.transactionActive}
                    onClick={() => {
                        NewPageCommand.run(store, state);
                        setDocumentMenu(null);
                    }}>New Page
            </button>
        </div>}
        {pageMenu && <div className="shape-context-menu"
                          style={{left: pageMenu.x, top: pageMenu.y}}
                          role="menu" aria-label="Page actions"
                          onContextMenu={event => event.preventDefault()}
                          onPointerDown={event => event.stopPropagation()}>
            <button role="menuitem" onClick={() => {
                renamePage(pageMenu.pageId);
                setPageMenu(null);
            }}>Rename Page
            </button>
            <button role="menuitem" disabled={doc.pages.length <= 1}
                    onClick={() => {
                        store.deletePage(pageMenu.pageId);
                        setPageMenu(null);
                    }}>Delete Page
            </button>
            {page_menu_actions.map((act, index) => {
                return <button key={index} onClick={() => {
                    act.perform(store, pageMenu.pageId)
                    setPageMenu(null)
                }}
                >{act.title}</button>
            })}
            <button role="menuitem"
                    onClick={() => createVector(pageMenu.pageId)}>New Vector
                Network
            </button>
            <button role="menuitem" onClick={() => {
                store.selectPage(pageMenu.pageId);
                setPageMenu(null);
                setImageDialog({kind: 'create'});
            }}>New Pixel Image
            </button>
            <button role="menuitem" disabled={!doc.images.length}
                    onClick={() => {
                        store.selectPage(pageMenu.pageId);
                        setPageMenu(null);
                        setRepeatingImageDialog(true);
                    }}>New Repeating Image
            </button>
            <button role="menuitem" onClick={() => {
                store.selectPage(pageMenu.pageId);
                setPageMenu(null);
                setImageDialog({kind: 'import'});
            }}>Import PNG
            </button>
        </div>}
        {pagesMenu &&
            <div className="shape-context-menu"
                 style={{left: pagesMenu.x, top: pagesMenu.y}}
                 role="menu" aria-label="Pages actions"
                 onContextMenu={event => event.preventDefault()}
                 onPointerDown={event => event.stopPropagation()}>
                <button role="menuitem" onClick={() => {
                    NewPageCommand.run(store, state)
                    setPagesMenu(null);
                }}>{NewPageCommand.title}</button>
            </div>}
        {renamePageDialog && <EditorDialog title="Rename Page"
                                           onClose={() => setRenamePageDialog(null)}>
            <form className="rename-page-form" onSubmit={event => {
                event.preventDefault();
                const name = renamePageDialog.name.trim();
                if (name) store.renamePage(renamePageDialog.pageId, name);
                setRenamePageDialog(null);
            }}>
                <label htmlFor="rename-page-name">Page name</label>
                <input id="rename-page-name" autoFocus data-dialog-autofocus
                       value={renamePageDialog.name}
                       onChange={event => setRenamePageDialog(current => current ? {
                           ...current,
                           name: event.target.value
                       } : current)}/>
                <div className="dialog-actions">
                    <button type="button"
                            onClick={() => setRenamePageDialog(null)}>Cancel
                    </button>
                    <button type="submit"
                            disabled={!renamePageDialog.name.trim()}>Rename
                    </button>
                </div>
            </form>
        </EditorDialog>}
        {renameDocumentName !== null && <EditorDialog title="Rename Document"
                                                      onClose={() => setRenameDocumentName(null)}>
            <form className="rename-page-form" onSubmit={event => {
                event.preventDefault();
                const name = renameDocumentName.trim();
                if (name) store.setTitle(name);
                setRenameDocumentName(null);
            }}>
                <label htmlFor="rename-document-name">Document name</label>
                <input id="rename-document-name" autoFocus data-dialog-autofocus
                       value={renameDocumentName}
                       onChange={event => setRenameDocumentName(event.target.value)}/>
                <div className="dialog-actions">
                    <button type="button"
                            onClick={() => setRenameDocumentName(null)}>Cancel
                    </button>
                    <button type="submit"
                            disabled={!renameDocumentName.trim()}>Rename
                    </button>
                </div>
            </form>
        </EditorDialog>}
        {imageDialog?.kind === 'import' &&
            <ImportPixelImage store={store}
                              onClose={() => setImageDialog(null)}/>}
        {imageDialog?.kind === 'create' &&
            <NewPixelImage store={store} onClose={() => setImageDialog(null)}
                           onCreated={imageId => setImageDialog({
                               kind: 'edit',
                               imageId
                           })}/>}
        {repeatingImageDialog &&
            <NewRepeatingImage store={store}
                               onClose={() => setRepeatingImageDialog(false)}/>}
        {savedDocumentsOpen &&
            <SavedDocumentsDialog onClose={() => setSavedDocumentsOpen(false)}
                                  onChanged={records => {
                                      const remaining = new Set(records.map(record => record.id));
                                      setWorkspace(current => ({
                                          ...current,
                                          tabs: current.tabs.map(tab => tab.savedDocumentId && !remaining.has(tab.savedDocumentId)
                                              ? {
                                                  ...tab,
                                                  savedDocumentId: null,
                                                  savedJson: null
                                              } : tab)
                                      }));
                                      setError('');
                                  }}
                                  onOpen={record => {
                                      try {
                                          const tab = makeTab(deserializeDocument(record.json), record.id, record.json);
                                          finishEditing();
                                          setWorkspace(current => ({
                                              tabs: [...current.tabs, tab],
                                              activeId: tab.id
                                          }));
                                          setSavedDocumentsOpen(false);
                                          setError('');
                                      } catch (reason) {
                                          setError(reason instanceof Error ? reason.message : 'Unable to open saved document');
                                      }
                                  }}/>}
        {commandPaletteOpen && <CommandPalette commands={commands}
                                               store={store}
                                               state={state}
                                               onClose={() => setCommandPaletteOpen(false)}/>}
    </div>;
}
