import {useEffect, useRef, useState, type MouseEvent} from 'react';
import TreeView from './TreeView';
import PropSheet from './PropSheet';
import VisualEditor from './VisualEditor';
import {makeCircle, makeRect} from './reducer';
import {EditorStore, emptyDocument} from './EditorStore';
import {makeExampleDocument} from './exampleDocument';
import {useEditorStore} from './useEditorStore';
import {deserializeDocument} from './serialization';
import type {Document as DrawingDocument, Bounds, Shape, PixelImageData} from './types';
import {ImportPixelImage} from './ImportPixelImage';
import {NewPixelImage} from './NewPixelImage';
import {PixelImageEditor} from './PixelImageEditor';
import {DropdownMenu} from './DropdownMenu';
import {PixelAssetView} from './PixelAssetView';
import './app.css';

interface DocumentTab { id: string; store: EditorStore }
function makeTab(document: DrawingDocument): DocumentTab {
    return {id: crypto.randomUUID(), store: new EditorStore(document)};
}
function DocumentTabButton({tab, active, activate}: {tab: DocumentTab; active: boolean; activate: () => void}) {
    const {document} = useEditorStore(tab.store);
    return <button role="tab" id={`tab-${tab.id}`} aria-selected={active} aria-controls="document-editor"
        tabIndex={active ? 0 : -1} onClick={activate} title={document.title || 'Untitled'}>
        {document.title || 'Untitled'}
    </button>;
}

export default function App() {
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
        setWorkspace(current => ({tabs: [...current.tabs, tab], activeId: tab.id}));
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
    const [imageDialog, setImageDialog] = useState<{kind: 'create' | 'import'} | {kind: 'edit'; imageId: string; source?: Bounds} | null>(null);
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const [clipboard, setClipboard] = useState<{shapes: Shape[]; images: PixelImageData[]}>({shapes: [], images: []});
    const [contextMenu, setContextMenu] = useState<{x: number; y: number} | null>(null);
    const [pageMenu, setPageMenu] = useState<{x: number; y: number; pageId: string} | null>(null);
    const [pagesMenu, setPagesMenu] = useState<{x: number; y: number} | null>(null);
    const selectedAsset = doc.images.find(image => image.id === selectedAssetId);
    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable)) return;
            if (store.getSnapshot().transactionActive) return;
            const key = event.key.toLowerCase();
            if (key === 'delete' || key === 'backspace') {
                if (!store.getSnapshot().selectedIds.length || store.getSnapshot().transactionActive) return;
                event.preventDefault();
                deleteSelection();
                return;
            }
            if ((event.metaKey || event.ctrlKey) && !event.altKey && ['d', 'x', 'c', 'v'].includes(key)) {
                event.preventDefault();
                if (key === 'd') duplicateSelection();
                if (key === 'c') copySelection();
                if (key === 'x') { copySelection(); deleteSelection(); }
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
    }, [store, selectedAssetId, state.selectedIds, doc]);
    useEffect(() => {
        const close = () => { setContextMenu(null); setPageMenu(null); setPagesMenu(null); };
        window.addEventListener('pointerdown', close);
        window.addEventListener('blur', close);
        return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('blur', close); };
    }, []);
    const getSelected = () => store.getSnapshot().document.shapes.filter(shape => store.getSnapshot().selectedIds.includes(shape.id));
    const copySelection = () => {
        const shapes = getSelected();
        const ids = new Set(shapes.filter(shape => shape.type === 'pixel-image').map(shape => shape.components.image.imageId));
        setClipboard({shapes: structuredClone(shapes), images: structuredClone(store.getSnapshot().document.images.filter(image => ids.has(image.id)))});
    };
    const deleteSelection = () => {
        const shapes = getSelected(); if (!shapes.length) return;
        store.beginTransaction('Delete selection'); shapes.forEach(shape => store.removeShape(shape.id)); store.commitTransaction(); store.select(null);
    };
    const duplicateSelection = () => { const shapes = getSelected(); if (shapes.length) store.duplicateShapes(shapes.map(shape => shape.id)); };
    const pasteSelection = () => { if (clipboard.shapes.length) store.pasteShapes(clipboard.shapes, clipboard.images); };
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
        const snap = store.getSnapshot();
        if (!snap.selectedIds.includes(shape.id)) store.select(shape.id);
        setContextMenu({x: event.clientX, y: event.clientY});
    };
    const showPageContextMenu = (event: MouseEvent<HTMLElement>, pageId: string) => {
        event.preventDefault();
        store.selectPage(pageId);
        setContextMenu(null);
        setPageMenu({x: event.clientX, y: event.clientY, pageId});
    };
    const renamePage = (pageId: string) => {
        const page = doc.pages.find(item => item.id === pageId);
        const name = window.prompt('Page name', page?.name ?? 'Page');
        if (name?.trim()) store.renamePage(pageId, name.trim());
    };
    const createPageRect = (pageId: string) => {
        store.selectPage(pageId);
        const shape = makeRect('Rectangle', {x: 50, y: 50, width: 100, height: 80});
        store.addShape(shape); store.select(shape.id); setPageMenu(null);
    };
    const createPageCircle = (pageId: string) => {
        store.selectPage(pageId);
        const shape = makeCircle('Circle', {x: 100, y: 100}, 40);
        store.addShape(shape); store.select(shape.id); setPageMenu(null);
    };
    const undo = <button disabled={!state.canUndo} onClick={() => store.undo()}>Undo</button>;
    const redo = <button disabled={!state.canRedo} onClick={() => store.redo()}>Redo</button>;
    return <div className="main-layout">
        <nav className="menubar full-span">
            <DropdownMenu title="File">
                <button disabled={state.transactionActive} onClick={() => file.current?.click()}>Load file</button>
                <button disabled={state.transactionActive} onClick={() => openDocument(emptyDocument())}>New Document</button>
                <button disabled={state.transactionActive} onClick={() => {
                    const url = URL.createObjectURL(new Blob([store.toJSON()], {type: 'application/json'}));
                    const safeTitle = doc.title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/\.+$/g, '') || 'Untitled';
                    const link = document.createElement('a'); link.href = url; link.download = `${safeTitle}.json`; link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}>Save JSON</button>
            </DropdownMenu>
            <DropdownMenu title="Edit">
                <button disabled={!state.selectedIds.length || state.transactionActive} onClick={duplicateSelection}>Duplicate <span className="menu-shortcut">⌘D / Ctrl+D</span></button>
                <button disabled={!state.selectedIds.length || state.transactionActive} onClick={deleteSelection}>Delete</button>
                <button disabled={!state.selectedIds.length || state.transactionActive} onClick={() => { copySelection(); deleteSelection(); }}>Cut <span className="menu-shortcut">⌘X / Ctrl+X</span></button>
                <button disabled={!state.selectedIds.length || state.transactionActive} onClick={copySelection}>Copy <span className="menu-shortcut">⌘C / Ctrl+C</span></button>
                <button disabled={!clipboard.shapes.length || state.transactionActive} onClick={pasteSelection}>Paste <span className="menu-shortcut">⌘V / Ctrl+V</span></button>
            </DropdownMenu>
            <DropdownMenu title="Page">
                <button disabled={state.transactionActive} onClick={() => store.createPage()}>New Page</button>
                <button disabled={state.transactionActive} onClick={() => renamePage(state.selectedPageId)}>Rename Page</button>
                <button disabled={doc.pages.length <= 1 || state.transactionActive} onClick={() => store.deletePage(state.selectedPageId)}>Delete Page</button>
            </DropdownMenu>
            {!selectedAsset && <DropdownMenu title="Shape">
            <button disabled={state.transactionActive} onClick={() => {
                const shape = makeRect('rect', {x: 50, y: 250, width: 50, height: 50});
                store.addShape(shape); store.select(shape.id);
            }}>New Rect</button>
            <button disabled={state.transactionActive} onClick={() => {
                const shape = makeCircle('circle', {x: 100, y: 300}, 40);
                store.addShape(shape); store.select(shape.id);
            }}>New Circle</button>
            <button disabled={state.transactionActive} onClick={() => setImageDialog({kind: 'create'})}>New Pixel Image</button>
            <button disabled={state.transactionActive} onClick={() => setImageDialog({kind: 'import'})}>Import PNG</button>
            </DropdownMenu>}
            <ul><li>{undo}</li><li>{redo}</li></ul>
            <input hidden ref={file} type="file" accept=".json,application/json" onChange={async event => {
                const chosen = event.target.files?.[0]; event.target.value = '';
                if (!chosen) return;
                try { openDocument(deserializeDocument(await chosen.text())); setError(''); }
                catch (error) { setError(error instanceof Error ? error.message : 'Unable to load document'); }
            }}/>
        </nav>
        <div className="document-tabs full-span" role="tablist" aria-label="Open documents"
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
                active={tab.id === workspace.activeId} activate={() => activateTab(tab.id)}/>)}
        </div>
        <div id="document-editor" className="document-editor full-span" role="tabpanel" aria-labelledby={`tab-${activeTab.id}`}>
        <div className="toolbar full-span" key={activeTab.id}>
            <input aria-label="Document title" value={doc.title}
                onFocus={() => store.beginTransaction('Document title')}
                onBlur={() => { if (store.getSnapshot().transactionActive) store.commitTransaction(); }}
                onKeyDown={event => { if (event.key === 'Escape') { store.cancelTransaction(); event.currentTarget.blur(); } if (event.key === 'Enter') event.currentTarget.blur(); }}
                onChange={event => store.setTitle(event.target.value)}/>
            <label className="page-picker">Page <select aria-label="Current page" value={state.selectedPageId} onChange={event => store.selectPage(event.target.value)}>
                {doc.pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}
            </select></label>
            {selectedAsset && <button onClick={() => setSelectedAssetId(null)}>Back to canvas</button>}
            {!selectedAsset && <div className="canvas-zoom-controls" role="group" aria-label="Canvas zoom controls">
                <button aria-label="Zoom out" title="Zoom out" disabled={canvasZoom <= 0.25} onClick={() => setCanvasZoom(value => Math.max(0.25, value / 1.25))}>−</button>
                <span aria-live="polite">{Math.round(canvasZoom * 100)}%</span>
                <button aria-label="Zoom in" title="Zoom in" disabled={canvasZoom >= 4} onClick={() => setCanvasZoom(value => Math.min(4, value * 1.25))}>+</button>
                <button onClick={() => setCanvasZoom(1)}>Reset zoom</button>
            </div>}
            {!selectedAsset && selectedShapes.length === 1 && selected?.type === 'pixel-image' && <>
                <button disabled={state.transactionActive} onClick={() => setImageDialog({kind: 'edit', imageId: selected.components.image.imageId, source: selected.components.image.source})}>Edit Pixels</button>
                <button disabled={state.transactionActive} onClick={() => store.select(store.linkImageShape(selected.id))}>Linked Copy</button>
            </>}
            {!selectedAsset && <button disabled={!selectedShapes.length || state.transactionActive} onClick={deleteSelection}>Delete</button>}
            {undo}{redo}
        </div>
        <div className="left scroll-container"><TreeView document={doc} selectedIds={state.selectedIds} selectedAssetId={selectedAssetId}
            onSelect={(shape, additive) => { setSelectedAssetId(null); additive ? store.toggleSelection(shape.id) : store.select(shape.id); }}
            onSelectAsset={image => { finishEditing(); store.select(null); setSelectedAssetId(image.id); }}
            onShapeContextMenu={(event, shape) => showShapeContextMenu(event, shape)} selectedPageId={state.selectedPageId}
            onSelectPage={id => store.selectPage(id)}
            onUngroup={id => store.ungroup(id)} onRenameGroup={(id, name) => store.renameGroup(id, name)}
            onSelectGroup={ids => store.setSelection(ids)} onPageContextMenu={showPageContextMenu}
            onPagesContextMenu={event => { event.preventDefault(); setContextMenu(null); setPageMenu(null); setPagesMenu({x: event.clientX, y: event.clientY}); }}
            onReorderPage={(id, targetId, position) => store.reorderPage(id, targetId, position)}
            onReorderShape={(pageId, id, targetId, position) => store.reorderShapes(pageId, id, targetId, position)}/></div>
        {selectedAsset ? <div className="asset-center scroll-container"><PixelAssetView store={store} image={selectedAsset} onBack={() => setSelectedAssetId(null)}/></div> : <>
            <div className="center"><VisualEditor key={activeTab.id} store={store} zoom={canvasZoom} onZoomChange={setCanvasZoom} onEditImage={reference => setImageDialog({kind: 'edit', imageId: reference.imageId, source: reference.source})} onShapeContextMenu={showShapeContextMenu} onCanvasContextMenu={event => {
                event.preventDefault();
                setContextMenu(null);
                setPageMenu({x: event.clientX, y: event.clientY, pageId: state.selectedPageId});
            }}/></div>
            <div className="right scroll-container"><PropSheet key={activeTab.id} store={store}/></div>
        </>}
        </div>
        <div className="statusbar full-span"><span role="alert">{error}</span><span className="spacer"/><label>Scroll to pan; Ctrl/⌘+scroll to zoom; Space or middle-drag to pan. Shift-click toggles selection; drag empty canvas to select. Drag selected shapes to move; handles resize. Shift-resize images to keep proportions. Double-click a pixel image to edit.</label></div>
        {contextMenu && <div className="shape-context-menu" style={{left: contextMenu.x, top: contextMenu.y}} role="menu" onContextMenu={event => event.preventDefault()} onPointerDown={event => event.stopPropagation()}>
            {selectedUngrouped && <button role="menuitem" onClick={() => { groupSelection(); setContextMenu(null); }}>Group</button>}
            {selectedGrouped && <button role="menuitem" onClick={() => { ungroupSelection(); setContextMenu(null); }}>Ungroup</button>}
            <button role="menuitem" disabled={!state.selectedIds.length} onClick={() => { duplicateSelection(); setContextMenu(null); }}>Duplicate</button>
            <button role="menuitem" disabled={!state.selectedIds.length} onClick={() => { deleteSelection(); setContextMenu(null); }}>Delete</button>
            <button role="menuitem" disabled={!state.selectedIds.length} onClick={() => { copySelection(); deleteSelection(); setContextMenu(null); }}>Cut</button>
            <button role="menuitem" disabled={!state.selectedIds.length} onClick={() => { copySelection(); setContextMenu(null); }}>Copy</button>
            <button role="menuitem" disabled={!clipboard.shapes.length} onClick={() => { pasteSelection(); setContextMenu(null); }}>Paste</button>
        </div>}
        {pageMenu && <div className="shape-context-menu" style={{left: pageMenu.x, top: pageMenu.y}} role="menu" aria-label="Page actions" onContextMenu={event => event.preventDefault()} onPointerDown={event => event.stopPropagation()}>
            <button role="menuitem" onClick={() => { renamePage(pageMenu.pageId); setPageMenu(null); }}>Rename Page</button>
            <button role="menuitem" disabled={doc.pages.length <= 1} onClick={() => { store.deletePage(pageMenu.pageId); setPageMenu(null); }}>Delete Page</button>
            <button role="menuitem" onClick={() => createPageRect(pageMenu.pageId)}>New Rectangle</button>
            <button role="menuitem" onClick={() => createPageCircle(pageMenu.pageId)}>New Circle</button>
            <button role="menuitem" onClick={() => { store.selectPage(pageMenu.pageId); setPageMenu(null); setImageDialog({kind: 'create'}); }}>New Pixel Image</button>
            <button role="menuitem" onClick={() => { store.selectPage(pageMenu.pageId); setPageMenu(null); setImageDialog({kind: 'import'}); }}>Import PNG</button>
        </div>}
        {pagesMenu && <div className="shape-context-menu" style={{left: pagesMenu.x, top: pagesMenu.y}} role="menu" aria-label="Pages actions" onContextMenu={event => event.preventDefault()} onPointerDown={event => event.stopPropagation()}>
            <button role="menuitem" onClick={() => { store.createPage(); setPagesMenu(null); }}>New Page</button>
        </div>}
        {imageDialog?.kind === 'import' && <ImportPixelImage store={store} onClose={() => setImageDialog(null)}/>}
        {imageDialog?.kind === 'create' && <NewPixelImage store={store} onClose={() => setImageDialog(null)} onCreated={imageId => setImageDialog({kind: 'edit', imageId})}/>}
        {imageDialog?.kind === 'edit' && <PixelImageEditor key={imageDialog.imageId} store={store} imageId={imageDialog.imageId} source={imageDialog.source} onClose={() => setImageDialog(null)}/>}
    </div>;
}
