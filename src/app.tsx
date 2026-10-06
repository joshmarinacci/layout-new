import {useEffect, useRef, useState} from 'react';
import TreeView from './TreeView';
import PropSheet from './PropSheet';
import VisualEditor from './VisualEditor';
import {makeCircle, makeRect} from './reducer';
import {EditorStore, emptyDocument} from './EditorStore';
import {makeExampleDocument} from './exampleDocument';
import {useEditorStore} from './useEditorStore';
import {deserializeDocument} from './serialization';
import type {Document as DrawingDocument, Bounds} from './types';
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
    const selectedShapes = doc.shapes.filter(shape => state.selectedIds.includes(shape.id));
    const file = useRef<HTMLInputElement>(null);
    const [error, setError] = useState('');
    const [canvasZoom, setCanvasZoom] = useState(1);
    const [imageDialog, setImageDialog] = useState<{kind: 'create' | 'import'} | {kind: 'edit'; imageId: string; source?: Bounds} | null>(null);
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const selectedAsset = doc.images.find(image => image.id === selectedAssetId);
    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable)) return;
            if (store.getSnapshot().transactionActive) return;
            if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
                event.preventDefault();
                if (event.shiftKey || event.key.toLowerCase() === 'y') store.redo(); else store.undo();
            }
        };
        window.addEventListener('keydown', keydown);
        return () => window.removeEventListener('keydown', keydown);
    }, [store, selectedAssetId]);
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
            {!selectedAsset && <button disabled={!selectedShapes.length || state.transactionActive} onClick={() => {
                store.beginTransaction('Delete selection');
                selectedShapes.forEach(shape => store.removeShape(shape.id));
                store.commitTransaction(); store.select(null);
            }}>Delete</button>}
            {undo}{redo}
        </div>
        <div className="left scroll-container"><TreeView document={doc} selectedIds={state.selectedIds} selectedAssetId={selectedAssetId}
            onSelect={(shape, additive) => { setSelectedAssetId(null); additive ? store.toggleSelection(shape.id) : store.select(shape.id); }}
            onSelectAsset={image => { finishEditing(); store.select(null); setSelectedAssetId(image.id); }}/></div>
        {selectedAsset ? <div className="asset-center scroll-container"><PixelAssetView store={store} image={selectedAsset} onBack={() => setSelectedAssetId(null)}/></div> : <>
            <div className="center"><VisualEditor key={activeTab.id} store={store} zoom={canvasZoom} onZoomChange={setCanvasZoom} onEditImage={reference => setImageDialog({kind: 'edit', imageId: reference.imageId, source: reference.source})}/></div>
            <div className="right scroll-container"><PropSheet key={activeTab.id} store={store}/></div>
        </>}
        </div>
        <div className="statusbar full-span"><span role="alert">{error}</span><span className="spacer"/><label>Scroll to pan; Ctrl/⌘+scroll to zoom; Space or middle-drag to pan. Shift-click toggles selection; drag empty canvas to select. Drag selected shapes to move; handles resize. Shift-resize images to keep proportions. Double-click a pixel image to edit.</label></div>
        {imageDialog?.kind === 'import' && <ImportPixelImage store={store} onClose={() => setImageDialog(null)}/>}
        {imageDialog?.kind === 'create' && <NewPixelImage store={store} onClose={() => setImageDialog(null)} onCreated={imageId => setImageDialog({kind: 'edit', imageId})}/>}
        {imageDialog?.kind === 'edit' && <PixelImageEditor key={imageDialog.imageId} store={store} imageId={imageDialog.imageId} source={imageDialog.source} onClose={() => setImageDialog(null)}/>}
    </div>;
}
