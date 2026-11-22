import {
    Maximize2,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
    SunMoon,
    Trash2,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import {type CSSProperties, type MouseEvent, useEffect, useEffectEvent, useLayoutEffect, useRef, useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {DropdownMenu, Separator} from './ui/DropdownMenu';
import {CommandPalette} from './common/CommandPalette';
import {keybindings, matchesKeybinding} from './common/keybindings';
import {ContextMenu} from './ui/ContextMenu';
import {PanelResizer} from './ui/PanelResizer';
import {Toolbar} from './ui/Toolbar';
import {usePanelWidths} from './ui/usePanelWidths';
import {EditorDialog} from './common/EditorDialog';
import {KeyboardShortcutsDialog} from './common/KeyboardShortcutsDialog';
import {makeExampleDocument} from './model/exampleDocument';
import {ImportPixelImage} from './shapes/ImportPixelImage';
import {NewPixelImage} from './shapes/NewPixelImage';
import {NewRepeatingImage} from './shapes/NewRepeatingImage';
import {PixelAssetView} from './shapes/PixelAssetView';
import {PaletteAssetView} from './shapes/PaletteAssetView';
import {parsePalette} from './shapes/palettes';
import {type PixelEditorController, PixelImageEditor} from './shapes/PixelImageEditor';
import PropSheet from './common/PropSheet';
import {SavedDocumentsDialog} from './io/SavedDocumentsDialog';
import {deserializeDocument} from './io/serialization';
import {decodeDocumentPng} from './io/pngDocument';
import {importSvg} from './io/svgImport';
import {fetchGoogleFont, installDocumentFonts} from './shapes/googleFonts';
import TreeView from './common/TreeView';
import type {FontAsset, Shape} from './model/types';
import {IconButton, MenuItem, ToolbarGroup} from './ui/controls';
import {useThemeSettings} from './ui/theme';
import '@joshmarinacci/tooltheme/react';
import {useEditorStore} from './model/useEditorStore';
import VisualEditor from './editor/VisualEditor';
import './app.css';
import {
    type ClipboardState,
    type CommandContext,
    commandRegistry,
    type ImageDialogConfig,
    makeTab,
    openDocument,
    SaveDocumentCommand,
    SelectionCopyCommand,
    SelectionCutCommand,
    SelectionDeleteCommand,
    SelectionDuplicateCommand,
    SelectionPasteCommand,
    type Workspace,
} from './commands';
import {CommandIconButton, CommandMenuItem, DocumentTabButton} from './common/common';

export default function App() {
    const theme = useThemeSettings();
    const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
    const [workspace, setWorkspace] = useState<Workspace>(() => {
        const tab = makeTab(makeExampleDocument());
        return {tabs: [tab], activeId: tab.id};
    });
    const activeTab = workspace.tabs.find(tab => tab.id === workspace.activeId)!;
    const store = activeTab.store;
    const activeStore = useRef(store);
    useLayoutEffect(() => {
        activeStore.current = store;
    }, [store]);
    const finishEditing = () => {
        if (document.activeElement instanceof HTMLElement && document.activeElement.closest('#document-editor')) {
            document.activeElement.blur();
        }
        if (activeStore.current.getSnapshot().transactionActive) activeStore.current.cancelTransaction();
    };
    const activateTab = (id: string) => {
        if (id === workspace.activeId) return;
        finishEditing();
        setSelectedAssetId(null);
        setSelectedPaletteId(null);
        setWorkspace(current => ({...current, activeId: id}));
    };
    const state = useEditorStore(store);
    const doc = state.document;
    const selected = doc.shapes.find(shape => shape.id === state.selectedId);
    const pageShapes = doc.shapes.filter(shape => shape.pageId === state.selectedPageId);
    const selectedShapes = pageShapes.filter(shape => state.selectedIds.includes(shape.id));
    const file = useRef<HTMLInputElement>(null);
    const [fileKind, setFileKind] = useState<'json' | 'png' | 'svg'>('json');
    const paletteFile = useRef<HTMLInputElement>(null);
    const [error, setError] = useState('');
    const [canvasZoom, setCanvasZoom] = useState(1);
    const [leftPanelVisible, setLeftPanelVisible] = useState(true);
    const [rightPanelVisible, setRightPanelVisible] = useState(true);
    const [panelWidths, setPanelWidth] = usePanelWidths();
    const documentEditor = useRef<HTMLDivElement>(null);
    const [imageDialog, setImageDialog] = useState<ImageDialogConfig>(null);
    const [googleFontDialog, setGoogleFontDialog] = useState(false);
    const [googleFontName, setGoogleFontName] = useState('');
    const [googleFontError, setGoogleFontError] = useState('');
    const [googleFontLoading, setGoogleFontLoading] = useState(false);
    const [googleFontPreview, setGoogleFontPreview] = useState<FontAsset | null>(null);
    useEffect(() => {
        installDocumentFonts(googleFontPreview ? [...doc.fonts, googleFontPreview] : doc.fonts);
    }, [doc.fonts, googleFontPreview]);
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const [selectedPaletteId, setSelectedPaletteId] = useState<string | null>(null);
    const [vectorId, setVectorId] = useState<string | null>(null);
    const [pixelEditor, setPixelEditor] = useState<PixelEditorController | null>(null);
    // Leave image and vector editing when the active document or page changes.
    const [editingScope, setEditingScope] = useState({store, pageId: state.selectedPageId});
    // True only after the document row is clicked; any other selection replaces it.
    const [documentSelected, setDocumentSelected] = useState(false);
    if (editingScope.store !== store || editingScope.pageId !== state.selectedPageId) {
        setEditingScope({store, pageId: state.selectedPageId});
        setDocumentSelected(false);
        setVectorId(null);
        setImageDialog(null);
        setPixelEditor(null);
    }
    // Stop vector editing once its shape is deleted or deselected, or an asset is opened.
    if (documentSelected && (state.selectedIds.length || selectedAssetId || selectedPaletteId))
        setDocumentSelected(false);
    if (
        vectorId &&
        (!doc.shapes.some(s => s.id === vectorId) || !state.selectedIds.includes(vectorId) || selectedAssetId)
    )
        setVectorId(null);
    const [repeatingImageDialog, setRepeatingImageDialog] = useState(false);
    const [clipboard, setClipboard] = useState<ClipboardState>({
        shapes: [],
        images: [],
        fonts: [],
    });
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [documentMenu, setDocumentMenu] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [pageMenu, setPageMenu] = useState<{
        x: number;
        y: number;
        pageId: string;
    } | null>(null);
    const [pagesMenu, setPagesMenu] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [assetsMenu, setAssetsMenu] = useState<{x: number; y: number} | null>(null);
    const [paletteMenu, setPaletteMenu] = useState<{x: number; y: number; paletteId: string} | null>(null);
    const [renamePageDialog, setRenamePageDialog] = useState<{
        pageId: string;
        name: string;
    } | null>(null);
    const [renameDocumentName, setRenameDocumentName] = useState<string | null>(null);
    const [savedDocumentsOpen, setSavedDocumentsOpen] = useState(false);
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
    const selectedAsset = doc.images.find(image => image.id === selectedAssetId);
    const selectedPalette = doc.palettes.find(palette => palette.id === selectedPaletteId);
    const ctx: CommandContext = {
        store,
        state,
        workspace,
        setWorkspace,
        finishEditing,
        clipboard,
        setClipboard,
        commandPaletteOpen,
        setCommandPaletteOpen,
        setKeyboardShortcutsOpen,
        setSavedDocumentsOpen,
        leftPanelVisible,
        setLeftPanelVisible,
        rightPanelVisible,
        setRightPanelVisible,
        setRenamePageDialog,
        setRenameDocumentName,
        setImageDialog,
        setRepeatingImageDialog,
        setVectorId,
        setPixelEditor,
        setError,
        setFileDialogOpen: (open, kind = 'json') => {
            setFileKind(kind);
            if (file.current)
                file.current.accept =
                    kind === 'png'
                        ? '.png,image/png'
                        : kind === 'svg'
                          ? '.svg,image/svg+xml'
                          : '.json,application/json';
            file.current?.click();
        },
        setTheme: theme.setMode,
        setThemeSettingsOpen,
        setSelectedAssetId,
        setSelectedPaletteId,
        openPaletteImport: () => paletteFile.current?.click(),
    };
    const onWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
        if (
            matchesKeybinding(
                event,
                keybindings.find(binding => binding.commandId === 'ui-show-command-palette')!,
            )
        ) {
            event.preventDefault();
            commandRegistry.require('ui-show-command-palette').run(ctx);
            return;
        }
        if (
            matchesKeybinding(
                event,
                keybindings.find(binding => binding.commandId === 'ui-toggle-left-sidebar')!,
            )
        ) {
            event.preventDefault();
            commandRegistry.require('ui-toggle-left-sidebar').run(ctx);
            return;
        }
        if (
            matchesKeybinding(
                event,
                keybindings.find(binding => binding.commandId === 'ui-toggle-right-sidebar')!,
            )
        ) {
            event.preventDefault();
            commandRegistry.require('ui-toggle-right-sidebar').run(ctx);
            return;
        }
        if (commandPaletteOpen) {
            if (event.key === 'Escape') {
                event.preventDefault();
                setCommandPaletteOpen(false);
            }
            return;
        }
        if (
            event.target instanceof HTMLElement &&
            (event.target.matches('input, textarea, select') || event.target.isContentEditable)
        )
            return;
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
                m: 'move',
            } as const;
            if (
                key in shortcuts &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.altKey &&
                !store.getSnapshot().transactionActive
            ) {
                event.preventDefault();
                pixelEditor?.setTool(shortcuts[key as keyof typeof shortcuts]);
                return;
            }
        }
        if (store.getSnapshot().transactionActive) return;
        if (
            event.target instanceof HTMLElement &&
            (event.target.matches('input, textarea, select') || event.target.isContentEditable)
        )
            return;
        const boundCommand = keybindings.find(
            binding => binding.commandId !== 'ui-show-command-palette' && matchesKeybinding(event, binding),
        );
        if (boundCommand) {
            const command = commandRegistry.get(boundCommand.commandId);
            if (command && command.enabled && command.enabled(ctx)) {
                event.preventDefault();
                command.run(ctx);
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
            if (!store.getSnapshot().transactionActive) SaveDocumentCommand.run(ctx);
            return;
        }
        if (
            vectorId &&
            (key === 'delete' ||
                key === 'backspace' ||
                ((event.metaKey || event.ctrlKey) && ['d', 'x', 'c', 'v'].includes(key)))
        )
            return;
        if (key === 'delete' || key === 'backspace') {
            if (!store.getSnapshot().selectedIds.length || store.getSnapshot().transactionActive) return;
            event.preventDefault();
            SelectionDeleteCommand.run(ctx);
            return;
        }
        if ((event.metaKey || event.ctrlKey) && !event.altKey && ['d', 'x', 'c', 'v'].includes(key)) {
            event.preventDefault();
            if (key === 'd') SelectionDuplicateCommand.run(ctx);
            if (key === 'c') SelectionCopyCommand.run(ctx);
            if (key === 'x') SelectionCutCommand.run(ctx);
            if (key === 'v') SelectionPasteCommand.run(ctx);
            return;
        }
        if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
            event.preventDefault();
            if (event.shiftKey || event.key.toLowerCase() === 'y') store.redo();
            else store.undo();
        }
    });
    useEffect(() => {
        const keydown = (event: KeyboardEvent) => onWindowKeyDown(event);
        window.addEventListener('keydown', keydown);
        return () => window.removeEventListener('keydown', keydown);
    }, []);
    useEffect(() => {
        const close = () => {
            setContextMenu(null);
            setDocumentMenu(null);
            setPageMenu(null);
            setPagesMenu(null);
            setAssetsMenu(null);
            setPaletteMenu(null);
        };
        window.addEventListener('pointerdown', close);
        window.addEventListener('blur', close);
        return () => {
            window.removeEventListener('pointerdown', close);
            window.removeEventListener('blur', close);
        };
    }, []);
    const selectedUngrouped = selectedShapes.some(
        shape => !doc.pages.flatMap(page => page.groups).some(group => group.shapeIds.includes(shape.id)),
    );
    const selectedGrouped = selectedShapes.some(shape =>
        doc.pages.flatMap(page => page.groups).some(group => group.shapeIds.includes(shape.id)),
    );
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
    const commands = commandRegistry.getAll();
    const onNativeMenuAction = useEffectEvent((id: string) => {
        if (store.getSnapshot().transactionActive) return;
        if (
            (selectedAssetId || selectedPaletteId) &&
            [
                'new-vector-network',
                'new-rectangle',
                'new-circle',
                'new-text',
                'new-pixelimage',
                'new-repeatingimage',
                'import-png',
            ].includes(id)
        )
            return;
        if (id === 'new-repeatingimage' && !doc.images.length) return;
        const command = commandRegistry.get(id);
        if (command?.enabled(ctx)) command.run(ctx);
    });
    useEffect(() => {
        if (!isTauri()) return;
        let unlisten: (() => void) | undefined;
        let disposed = false;
        void listen<string>('native-menu-action', event => onNativeMenuAction(event.payload))
            .then(dispose => {
                if (disposed) dispose();
                else unlisten = dispose;
            })
            .catch(reason =>
                setError(
                    reason instanceof Error
                        ? `Unable to connect native menu: ${reason.message}`
                        : 'Unable to connect native menu',
                ),
            );
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, []);
    const undo = <CommandIconButton commandId={'undo'} ctx={ctx} />;
    const redo = <CommandIconButton commandId={'redo'} ctx={ctx} />;
    const shellClass = [
        'app-shell',
        isTauri() && 'tauri-mode',
        !leftPanelVisible && 'hide-left',
        !rightPanelVisible && 'hide-right',
        (selectedAsset || selectedPalette) && 'asset-mode',
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <div
            className={shellClass}
            data-shell
            ref={documentEditor}
            style={
                {'--left-width': `${panelWidths.left}px`, '--right-width': `${panelWidths.right}px`} as CSSProperties
            }
        >
            <header>
                <div className="menubar">
                    <DropdownMenu title="File">
                        <CommandMenuItem ctx={ctx} commandId="new-document" />
                        <Separator />
                        <CommandMenuItem ctx={ctx} commandId="open-local-document" />
                        <CommandMenuItem ctx={ctx} commandId="open-json-document" />
                        <CommandMenuItem ctx={ctx} commandId="import-svg" />
                        <CommandMenuItem ctx={ctx} commandId="open-png-document" />
                        <Separator />
                        <CommandMenuItem ctx={ctx} commandId="save-json-document" />
                        <CommandMenuItem ctx={ctx} commandId="save-png-document" />
                    </DropdownMenu>
                    <DropdownMenu title="Edit">
                        <CommandMenuItem ctx={ctx} commandId="selection-duplicate" />
                        <CommandMenuItem ctx={ctx} commandId="selection-delete" />
                        <CommandMenuItem ctx={ctx} commandId="selection-cut" />
                        <CommandMenuItem ctx={ctx} commandId="selection-copy" />
                        <CommandMenuItem ctx={ctx} commandId="selection-paste" />
                    </DropdownMenu>
                    <DropdownMenu title="View">
                        <CommandMenuItem ctx={ctx} commandId="ui-show-command-palette" />
                        <Separator />
                        <CommandMenuItem ctx={ctx} commandId="ui-toggle-left-sidebar" />
                        <CommandMenuItem ctx={ctx} commandId="ui-toggle-right-sidebar" />
                    </DropdownMenu>
                    <DropdownMenu title="Page">
                        <CommandMenuItem ctx={ctx} commandId="new-page" />
                        <CommandMenuItem ctx={ctx} commandId="rename-page" />
                        <CommandMenuItem ctx={ctx} commandId="delete-page" />
                    </DropdownMenu>
                    {!selectedAsset && !selectedPalette && (
                        <DropdownMenu title="Shape">
                            <CommandMenuItem ctx={ctx} commandId="new-vector-network" />
                            <CommandMenuItem ctx={ctx} commandId="new-rectangle" />
                            <CommandMenuItem ctx={ctx} commandId="new-circle" />
                            <CommandMenuItem ctx={ctx} commandId="new-text" />
                            <CommandMenuItem ctx={ctx} commandId="new-pixelimage" />
                            <CommandMenuItem ctx={ctx} commandId="new-repeatingimage" />
                            <CommandMenuItem ctx={ctx} commandId="import-png" />
                        </DropdownMenu>
                    )}
                    <DropdownMenu title="Assets">
                        <CommandMenuItem ctx={ctx} commandId="new-color-palette" />
                        <CommandMenuItem ctx={ctx} commandId="import-color-palette" />
                        <Separator />
                        <MenuItem
                            label="Add Google Font…"
                            onClick={() => {
                                setGoogleFontName('');
                                setGoogleFontError('');
                                setGoogleFontDialog(true);
                            }}
                        />
                        <Separator />
                        <CommandMenuItem ctx={ctx} commandId="new-pico8-palette" />
                    </DropdownMenu>
                    {!selectedAsset && !selectedPalette && selectedShapes.length > 1 && (
                        <DropdownMenu title="Align">
                            <CommandMenuItem ctx={ctx} commandId="align-left" />
                            <CommandMenuItem ctx={ctx} commandId="align-center" />
                            <CommandMenuItem ctx={ctx} commandId="align-right" />

                            <CommandMenuItem ctx={ctx} commandId="align-top" />
                            <CommandMenuItem ctx={ctx} commandId="align-middle" />
                            <CommandMenuItem ctx={ctx} commandId="align-bottom" />
                            <Separator />
                            <CommandMenuItem ctx={ctx} commandId="align-distribute-horizontal" />
                            <CommandMenuItem ctx={ctx} commandId="align-distribute-vertical" />
                        </DropdownMenu>
                    )}
                    <ToolbarGroup label="History">
                        {undo}
                        {redo}
                    </ToolbarGroup>
                    <span className="spacer" />
                    <DropdownMenu title="Appearance" icon={SunMoon}>
                        <CommandMenuItem ctx={ctx} commandId="theme-system" />
                        <CommandMenuItem ctx={ctx} commandId="theme-light" />
                        <CommandMenuItem ctx={ctx} commandId="theme-dark" />
                        <Separator />
                        <CommandMenuItem ctx={ctx} commandId="theme-settings" />
                    </DropdownMenu>
                    <DropdownMenu title="Help">
                        <CommandMenuItem ctx={ctx} commandId="ui-show-keyboard-shortcuts" />
                    </DropdownMenu>
                    <input
                        hidden
                        ref={file}
                        type="file"
                        accept={
                            fileKind === 'png'
                                ? '.png,image/png'
                                : fileKind === 'svg'
                                  ? '.svg,image/svg+xml'
                                  : '.json,application/json'
                        }
                        onChange={async event => {
                            const chosen = event.target.files?.[0];
                            event.target.value = '';
                            if (!chosen) return;
                            try {
                                if (fileKind === 'svg') {
                                    const result = importSvg(await chosen.text());
                                    store.importVectorNetworks(
                                        result.shapes,
                                        state.selectedPageId,
                                        chosen.name.replace(/\.svg$/i, '') || 'Imported SVG',
                                    );
                                    setError(result.warnings.join(' · '));
                                } else {
                                    const loaded =
                                        fileKind === 'png'
                                            ? decodeDocumentPng(new Uint8Array(await chosen.arrayBuffer()))
                                            : deserializeDocument(await chosen.text());
                                    openDocument(ctx, loaded);
                                }
                                setError('');
                            } catch (error) {
                                setError(error instanceof Error ? error.message : 'Unable to load document');
                            }
                        }}
                    />
                </div>
            </header>
            <div
                className="document-tabs"
                role="tablist"
                aria-label="Open documents"
                onKeyDown={event => {
                    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                    if (!offset && event.key !== 'Home' && event.key !== 'End') return;
                    event.preventDefault();
                    const index = workspace.tabs.findIndex(tab => tab.id === workspace.activeId);
                    const next =
                        event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? workspace.tabs.length - 1
                              : (index + offset + workspace.tabs.length) % workspace.tabs.length;
                    const tab = workspace.tabs[next];
                    activateTab(tab.id);
                    document.getElementById(`tab-${tab.id}`)?.focus();
                }}
            >
                {workspace.tabs.map(tab => (
                    <DocumentTabButton
                        key={tab.id}
                        tab={tab}
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
                                y: event.clientY,
                            });
                        }}
                    />
                ))}
            </div>
            {leftPanelVisible && (
                <PanelResizer
                    side="left"
                    label="Resize layers panel"
                    width={panelWidths.left}
                    target={documentEditor}
                    onCommit={width => setPanelWidth('left', width)}
                />
            )}
            <aside className="layers-panel" aria-labelledby="layers-heading">
                <h2 id="layers-heading" className="panel-heading">
                    Layers &amp; assets
                </h2>
                <input
                    ref={paletteFile}
                    hidden
                    type="file"
                    accept=".gpl,.json,.txt,.hex"
                    onChange={async event => {
                        const chosen = event.target.files?.[0];
                        event.target.value = '';
                        if (!chosen) return;
                        try {
                            const palette = parsePalette(await chosen.text(), chosen.name);
                            store.edit('Import palette', draft => {
                                draft.palettes.push(palette);
                            });
                            store.select(null);
                            setSelectedAssetId(null);
                            setSelectedPaletteId(palette.id);
                            setError('');
                        } catch (error) {
                            setError(error instanceof Error ? error.message : 'Unable to import palette');
                        }
                    }}
                />
                <TreeView
                    document={doc}
                    selectedIds={state.selectedIds}
                    selectedAssetId={selectedAssetId}
                    selectedPaletteId={selectedPaletteId}
                    onDocumentContextMenu={event => {
                        event.preventDefault();
                        setContextMenu(null);
                        setPageMenu(null);
                        setPagesMenu(null);
                        setDocumentMenu({x: event.clientX, y: event.clientY});
                    }}
                    documentSelected={documentSelected}
                    onSelectDocument={() => {
                        finishEditing();
                        store.select(null);
                        setSelectedAssetId(null);
                        setSelectedPaletteId(null);
                        setDocumentSelected(true);
                    }}
                    onRenameDocument={name => store.setTitle(name)}
                    onRenamePage={(id, name) => store.renamePage(id, name)}
                    onRenameShape={(id, name) => store.renameShape(id, name)}
                    onRenamePalette={(id, name) =>
                        store.edit('Rename palette', draft => {
                            const item = draft.palettes.find(value => value.id === id);
                            if (item) item.name = name;
                        })
                    }
                    onRenameImage={(id, name) => store.renamePixelImage(id, name)}
                    onSelect={(shape, additive) => {
                        setSelectedAssetId(null);
                        setSelectedPaletteId(null);
                        if (additive) store.toggleSelection(shape.id);
                        else store.select(shape.id);
                    }}
                    onSelectAsset={image => {
                        finishEditing();
                        store.select(null);
                        setSelectedAssetId(image.id);
                        setSelectedPaletteId(null);
                    }}
                    onSelectPalette={palette => {
                        finishEditing();
                        store.select(null);
                        setSelectedAssetId(null);
                        setSelectedPaletteId(palette.id);
                    }}
                    onPaletteContextMenu={(event, palette) => {
                        event.preventDefault();
                        setContextMenu(null);
                        setDocumentMenu(null);
                        setPageMenu(null);
                        setPagesMenu(null);
                        setAssetsMenu(null);
                        setPaletteMenu({x: event.clientX, y: event.clientY, paletteId: palette.id});
                    }}
                    onShapeContextMenu={(event, shape) => showShapeContextMenu(event, shape)}
                    selectedPageId={state.selectedPageId}
                    onSelectPage={id => {
                        setSelectedAssetId(null);
                        setSelectedPaletteId(null);
                        setDocumentSelected(false);
                        store.selectPage(id);
                    }}
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
                            y: event.clientY,
                        });
                    }}
                    onAssetsContextMenu={event => {
                        event.preventDefault();
                        setContextMenu(null);
                        setDocumentMenu(null);
                        setPageMenu(null);
                        setPagesMenu(null);
                        setAssetsMenu({x: event.clientX, y: event.clientY});
                    }}
                    onReorderPage={(id, targetId, position) => store.reorderPage(id, targetId, position)}
                    onReorderShape={(pageId, id, targetId, position, sourceGroupId, targetGroupId) =>
                        store.reorderShapes(pageId, id, targetId, position, sourceGroupId, targetGroupId)
                    }
                />
            </aside>
            <main id="document-editor" data-canvas role="tabpanel" aria-labelledby={`tab-${activeTab.id}`}>
                <Toolbar className="canvas-toolbar" label="Canvas tools" key={activeTab.id}>
                    {(selectedAsset || selectedPalette) && (
                        <button
                            onClick={() => {
                                setSelectedAssetId(null);
                                setSelectedPaletteId(null);
                            }}
                        >
                            Back to canvas
                        </button>
                    )}
                    {!selectedAsset && !selectedPalette && (
                        <div className="canvas-zoom-controls" role="group" aria-label="Canvas zoom controls">
                            <IconButton
                                label="Zoom out"
                                icon={ZoomOut}
                                disabled={canvasZoom <= 0.25}
                                onClick={() => setCanvasZoom(value => Math.max(0.25, value / 1.25))}
                            />
                            <span aria-live="polite">{Math.round(canvasZoom * 100)}%</span>
                            <IconButton
                                label="Zoom in"
                                icon={ZoomIn}
                                disabled={canvasZoom >= 4}
                                onClick={() => setCanvasZoom(value => Math.min(4, value * 1.25))}
                            />
                            <IconButton label="Reset zoom" icon={Maximize2} onClick={() => setCanvasZoom(1)} />
                        </div>
                    )}
                    {!selectedAsset &&
                        !selectedPalette &&
                        selectedShapes.length === 1 &&
                        selected?.type === 'vector' && (
                            <button
                                disabled={state.transactionActive}
                                onClick={() => {
                                    setImageDialog(null);
                                    setPixelEditor(null);
                                    setVectorId(selected.id);
                                }}
                            >
                                Edit Vector
                            </button>
                        )}
                    {!selectedAsset &&
                        !selectedPalette &&
                        selectedShapes.length === 1 &&
                        selected?.type === 'pixel-image' && (
                            <>
                                <button
                                    disabled={state.transactionActive}
                                    onClick={() =>
                                        setImageDialog({
                                            kind: 'edit',
                                            imageId: selected.components.image.imageId,
                                            source: selected.components.image.source,
                                        })
                                    }
                                >
                                    Edit Pixels
                                </button>
                                <button
                                    disabled={state.transactionActive}
                                    onClick={() => store.select(store.linkImageShape(selected.id))}
                                >
                                    Linked Copy
                                </button>
                            </>
                        )}
                    {!selectedAsset && !selectedPalette && (
                        <IconButton
                            label="Delete selected shapes"
                            icon={Trash2}
                            disabled={!selectedShapes.length || state.transactionActive}
                            onClick={() => SelectionDeleteCommand.run(ctx)}
                        />
                    )}
                </Toolbar>
                {selectedPalette ? (
                    <div className="asset-center">
                        <PaletteAssetView
                            store={store}
                            palette={selectedPalette}
                            onBack={() => setSelectedPaletteId(null)}
                        />
                    </div>
                ) : selectedAsset ? (
                    <div className="asset-center">
                        <PixelAssetView store={store} image={selectedAsset} onBack={() => setSelectedAssetId(null)} />
                    </div>
                ) : (
                    <>
                        <div className={`center${imageDialog?.kind === 'edit' ? ' pixel-edit-active' : ''}`}>
                            <VisualEditor
                                key={activeTab.id}
                                store={store}
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
                                        imageScreenRect,
                                    });
                                }}
                                onShapeContextMenu={showShapeContextMenu}
                                onCanvasContextMenu={event => {
                                    event.preventDefault();
                                    setContextMenu(null);
                                    setPageMenu({
                                        x: event.clientX,
                                        y: event.clientY,
                                        pageId: state.selectedPageId,
                                    });
                                }}
                            />
                            {imageDialog?.kind === 'edit' && (
                                <PixelImageEditor
                                    key={imageDialog.imageId}
                                    store={store}
                                    imageId={imageDialog.imageId}
                                    source={imageDialog.source}
                                    initialPosition={imageDialog.palettePosition}
                                    imageScreenRect={imageDialog.imageScreenRect}
                                    onController={setPixelEditor}
                                    onClose={() => {
                                        setImageDialog(null);
                                        setPixelEditor(null);
                                    }}
                                />
                            )}
                        </div>
                    </>
                )}
            </main>
            {!selectedAsset && !selectedPalette && (
                <>
                    {rightPanelVisible && (
                        <PanelResizer
                            side="right"
                            label="Resize properties panel"
                            width={panelWidths.right}
                            target={documentEditor}
                            onCommit={width => setPanelWidth('right', width)}
                        />
                    )}
                    <aside className="inspector" aria-labelledby="inspector-heading">
                        <h2 id="inspector-heading" className="panel-heading">
                            Properties
                        </h2>
                        <PropSheet
                            key={activeTab.id}
                            store={store}
                            documentSelected={documentSelected}
                            onAddGoogleFont={() => {
                                setGoogleFontName('');
                                setGoogleFontError('');
                                setGoogleFontDialog(true);
                            }}
                        />
                    </aside>
                </>
            )}
            <footer className="statusbar">
                <IconButton
                    label={leftPanelVisible ? 'Hide tree panel' : 'Show tree panel'}
                    icon={leftPanelVisible ? PanelLeftClose : PanelLeftOpen}
                    aria-pressed={leftPanelVisible}
                    onClick={() => setLeftPanelVisible(value => !value)}
                />
                <span role="alert">{error}</span>
                <span
                    className="status-hint"
                    title="Scroll to pan · Ctrl/⌘+scroll to zoom · Space-drag to pan · Shift-click to select multiple · Alt-drag to duplicate · Double-click images to edit pixels"
                >
                    Scroll to pan · Ctrl/⌘+scroll to zoom · Shift-click for multiple selection · Double-click images to
                    edit
                </span>
                <IconButton
                    label={rightPanelVisible ? 'Hide properties panel' : 'Show properties panel'}
                    icon={rightPanelVisible ? PanelRightClose : PanelRightOpen}
                    aria-pressed={rightPanelVisible}
                    onClick={() => setRightPanelVisible(value => !value)}
                />
            </footer>
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    label="Shape actions"
                    onClose={() => setContextMenu(null)}
                >
                    {selectedUngrouped && <CommandMenuItem ctx={ctx} commandId="selection-group" />}
                    {selectedGrouped && <CommandMenuItem ctx={ctx} commandId="selection-ungroup" />}
                    <CommandMenuItem ctx={ctx} commandId="selection-duplicate" />
                    <CommandMenuItem ctx={ctx} commandId="selection-delete" />
                    <CommandMenuItem ctx={ctx} commandId="selection-cut" />
                    <CommandMenuItem ctx={ctx} commandId="selection-copy" />
                    <CommandMenuItem ctx={ctx} commandId="selection-paste" />
                    <Separator />
                    <CommandMenuItem ctx={ctx} commandId="export-selection-png" />
                    <CommandMenuItem ctx={ctx} commandId="export-selection-svg" />
                    {selectedShapes.length > 1 && (
                        <>
                            <Separator />
                            <CommandMenuItem ctx={ctx} commandId="align-left" />
                            <CommandMenuItem ctx={ctx} commandId="align-right" />
                            <CommandMenuItem ctx={ctx} commandId="align-center" />

                            <CommandMenuItem ctx={ctx} commandId="align-top" />
                            <CommandMenuItem ctx={ctx} commandId="align-middle" />
                            <CommandMenuItem ctx={ctx} commandId="align-bottom" />

                            <Separator />
                            <CommandMenuItem ctx={ctx} commandId="align-distribute-horizontal" />
                            <CommandMenuItem ctx={ctx} commandId="align-distribute-vertical" />
                        </>
                    )}
                </ContextMenu>
            )}
            {documentMenu && (
                <ContextMenu
                    x={documentMenu.x}
                    y={documentMenu.y}
                    label="Document actions"
                    onClose={() => setDocumentMenu(null)}
                >
                    <CommandMenuItem ctx={ctx} commandId="rename-document" />
                    <CommandMenuItem ctx={ctx} commandId="new-page" />
                </ContextMenu>
            )}
            {pageMenu && (
                <ContextMenu x={pageMenu.x} y={pageMenu.y} label="Page actions" onClose={() => setPageMenu(null)}>
                    <CommandMenuItem ctx={ctx} commandId="rename-page" />
                    <CommandMenuItem ctx={ctx} commandId="delete-page" />
                    <Separator />
                    <CommandMenuItem ctx={ctx} commandId="export-page-png" />
                    <CommandMenuItem ctx={ctx} commandId="export-page-svg" />
                    <Separator />
                    <CommandMenuItem ctx={ctx} commandId="new-rectangle" />
                    <CommandMenuItem ctx={ctx} commandId="new-circle" />
                    <CommandMenuItem ctx={ctx} commandId="new-text" />
                    <CommandMenuItem ctx={ctx} commandId="new-vector-network" />
                    <CommandMenuItem ctx={ctx} commandId="new-pixelimage" />
                    <CommandMenuItem ctx={ctx} commandId="new-repeatingimage" />
                    <CommandMenuItem ctx={ctx} commandId="import-png" />
                </ContextMenu>
            )}
            {pagesMenu && (
                <ContextMenu x={pagesMenu.x} y={pagesMenu.y} label="Pages actions" onClose={() => setPagesMenu(null)}>
                    <CommandMenuItem ctx={ctx} commandId="new-page" />
                </ContextMenu>
            )}
            {assetsMenu && (
                <ContextMenu
                    x={assetsMenu.x}
                    y={assetsMenu.y}
                    label="Assets actions"
                    onClose={() => setAssetsMenu(null)}
                >
                    <CommandMenuItem ctx={ctx} commandId="new-color-palette" />
                    <CommandMenuItem ctx={ctx} commandId="import-color-palette" />
                    <Separator />
                    <MenuItem
                        label="Add Google Font…"
                        onClick={() => {
                            setGoogleFontName('');
                            setGoogleFontError('');
                            setGoogleFontDialog(true);
                        }}
                    />
                    <Separator />
                    <CommandMenuItem ctx={ctx} commandId="new-pico8-palette" />
                </ContextMenu>
            )}
            {paletteMenu &&
                (() => {
                    const palette = doc.palettes.find(item => item.id === paletteMenu.paletteId);
                    if (!palette) return null;
                    return (
                        <ContextMenu
                            x={paletteMenu.x}
                            y={paletteMenu.y}
                            label={`${palette.name} palette actions`}
                            onClose={() => setPaletteMenu(null)}
                        >
                            <MenuItem
                                label="Rename"
                                onClick={() => {
                                    const name = window.prompt('Palette name', palette.name)?.trim();
                                    if (name)
                                        store.edit('Rename palette', draft => {
                                            const item = draft.palettes.find(value => value.id === palette.id);
                                            if (item) item.name = name;
                                        });
                                }}
                            />
                            <MenuItem
                                label="Duplicate"
                                onClick={() => {
                                    const copy = structuredClone(palette);
                                    copy.id = crypto.randomUUID();
                                    copy.name += ' copy';
                                    copy.colors.forEach(color => (color.id = crypto.randomUUID()));
                                    store.edit('Duplicate palette', draft => {
                                        draft.palettes.push(copy);
                                    });
                                }}
                            />
                            <MenuItem
                                label="Delete"
                                data-variant="danger"
                                onClick={() => {
                                    if (window.confirm(`Delete palette “${palette.name}”?`)) {
                                        store.edit('Delete palette', draft => {
                                            draft.palettes = draft.palettes.filter(item => item.id !== palette.id);
                                        });
                                        if (selectedPaletteId === palette.id) setSelectedPaletteId(null);
                                    }
                                }}
                            />
                        </ContextMenu>
                    );
                })()}
            {renamePageDialog && (
                <EditorDialog title="Rename Page" onClose={() => setRenamePageDialog(null)}>
                    <form
                        className="rename-page-form"
                        onSubmit={event => {
                            event.preventDefault();
                            const name = renamePageDialog.name.trim();
                            if (name) store.renamePage(renamePageDialog.pageId, name);
                            setRenamePageDialog(null);
                        }}
                    >
                        <label>
                            Page name
                            <input
                                autoFocus
                                data-dialog-autofocus
                                value={renamePageDialog.name}
                                onChange={event =>
                                    setRenamePageDialog(current =>
                                        current
                                            ? {
                                                  ...current,
                                                  name: event.target.value,
                                              }
                                            : current,
                                    )
                                }
                            />
                        </label>
                        <footer>
                            <button type="button" onClick={() => setRenamePageDialog(null)}>
                                Cancel
                            </button>
                            <button type="submit" disabled={!renamePageDialog.name.trim()}>
                                Rename
                            </button>
                        </footer>
                    </form>
                </EditorDialog>
            )}
            {renameDocumentName !== null && (
                <EditorDialog title="Rename Document" onClose={() => setRenameDocumentName(null)}>
                    <form
                        className="rename-page-form"
                        onSubmit={event => {
                            event.preventDefault();
                            const name = renameDocumentName.trim();
                            if (name) store.setTitle(name);
                            setRenameDocumentName(null);
                        }}
                    >
                        <label>
                            Document name
                            <input
                                autoFocus
                                data-dialog-autofocus
                                value={renameDocumentName}
                                onChange={event => setRenameDocumentName(event.target.value)}
                            />
                        </label>
                        <footer>
                            <button type="button" onClick={() => setRenameDocumentName(null)}>
                                Cancel
                            </button>
                            <button type="submit" disabled={!renameDocumentName.trim()}>
                                Rename
                            </button>
                        </footer>
                    </form>
                </EditorDialog>
            )}
            {googleFontDialog && (
                <EditorDialog
                    title="Add Google Font"
                    onClose={() => {
                        setGoogleFontDialog(false);
                        setGoogleFontPreview(null);
                    }}
                >
                    <form
                        className="rename-page-form"
                        onSubmit={async event => {
                            event.preventDefault();
                            setGoogleFontLoading(true);
                            setGoogleFontError('');
                            try {
                                const font =
                                    googleFontPreview?.family.toLocaleLowerCase() ===
                                    googleFontName.trim().toLocaleLowerCase()
                                        ? googleFontPreview
                                        : await fetchGoogleFont(googleFontName);
                                store.addFontAsset(font);
                                setGoogleFontPreview(null);
                                setGoogleFontDialog(false);
                            } catch (reason) {
                                setGoogleFontError(
                                    reason instanceof Error ? reason.message : 'Unable to add this Google Font',
                                );
                            } finally {
                                setGoogleFontLoading(false);
                            }
                        }}
                    >
                        <label>
                            Family name
                            <input
                                autoFocus
                                data-dialog-autofocus
                                value={googleFontName}
                                onChange={event => {
                                    setGoogleFontName(event.target.value);
                                    setGoogleFontPreview(null);
                                }}
                                placeholder="e.g. Roboto"
                            />
                        </label>
                        <p>Enter a family name from Google Fonts. The font files are saved with this document.</p>
                        <button
                            type="button"
                            disabled={!googleFontName.trim() || googleFontLoading}
                            onClick={async () => {
                                setGoogleFontLoading(true);
                                setGoogleFontError('');
                                try {
                                    const font = await fetchGoogleFont(googleFontName);
                                    setGoogleFontPreview(font);
                                    installDocumentFonts([...doc.fonts, font]);
                                    await document.fonts.load(`24px ${JSON.stringify(font.family)}`);
                                } catch (reason) {
                                    setGoogleFontError(
                                        reason instanceof Error ? reason.message : 'Unable to preview this Google Font',
                                    );
                                } finally {
                                    setGoogleFontLoading(false);
                                }
                            }}
                        >
                            Preview family
                        </button>
                        {googleFontPreview && (
                            <p
                                className="google-font-preview"
                                style={{fontFamily: JSON.stringify(googleFontPreview.family)}}
                            >
                                The quick brown fox jumps over the lazy dog
                            </p>
                        )}
                        {googleFontError && <p role="alert">{googleFontError}</p>}
                        <footer>
                            <button
                                type="button"
                                onClick={() => {
                                    setGoogleFontDialog(false);
                                    setGoogleFontPreview(null);
                                }}
                            >
                                Cancel
                            </button>
                            <button type="submit" disabled={!googleFontName.trim() || googleFontLoading}>
                                {googleFontLoading ? 'Loading…' : 'Add font'}
                            </button>
                        </footer>
                    </form>
                </EditorDialog>
            )}
            {imageDialog?.kind === 'import' && <ImportPixelImage store={store} onClose={() => setImageDialog(null)} />}
            {imageDialog?.kind === 'create' && (
                <NewPixelImage
                    store={store}
                    onClose={() => setImageDialog(null)}
                    onCreated={imageId =>
                        setImageDialog({
                            kind: 'edit',
                            imageId,
                        })
                    }
                />
            )}
            {repeatingImageDialog && <NewRepeatingImage store={store} onClose={() => setRepeatingImageDialog(false)} />}
            {savedDocumentsOpen && (
                <SavedDocumentsDialog
                    onClose={() => setSavedDocumentsOpen(false)}
                    onChanged={records => {
                        const remaining = new Set(records.map(record => record.id));
                        setWorkspace(current => ({
                            ...current,
                            tabs: current.tabs.map(tab =>
                                tab.savedDocumentId && !remaining.has(tab.savedDocumentId)
                                    ? {
                                          ...tab,
                                          savedDocumentId: null,
                                          savedJson: null,
                                      }
                                    : tab,
                            ),
                        }));
                        setError('');
                    }}
                    onOpen={record => {
                        try {
                            const tab = makeTab(deserializeDocument(record.json), record.id, record.json);
                            finishEditing();
                            setWorkspace(current => ({
                                tabs: [...current.tabs, tab],
                                activeId: tab.id,
                            }));
                            setSavedDocumentsOpen(false);
                            setError('');
                        } catch (reason) {
                            setError(reason instanceof Error ? reason.message : 'Unable to open saved document');
                        }
                    }}
                />
            )}
            {commandPaletteOpen && (
                <CommandPalette commands={commands} ctx={ctx} onClose={() => setCommandPaletteOpen(false)} />
            )}
            {keyboardShortcutsOpen && <KeyboardShortcutsDialog onClose={() => setKeyboardShortcutsOpen(false)} />}
            {themeSettingsOpen && (
                <EditorDialog title="Theme Settings" onClose={() => setThemeSettingsOpen(false)}>
                    <theme-tuner
                        settings={theme.settings}
                        show-css
                        onchange={event => theme.setSettings(event.detail)}
                    />
                </EditorDialog>
            )}
        </div>
    );
}
