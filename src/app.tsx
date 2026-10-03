import {useEffect, useRef, useState} from 'react';
import TreeView from './TreeView';
import PropSheet from './PropSheet';
import VisualEditor from './VisualEditor';
import {makeRect} from './reducer';
import {EditorStore, emptyDocument} from './EditorStore';
import {makeExampleDocument} from './exampleDocument';
import {useEditorStore} from './useEditorStore';
import {deserializeDocument} from './serialization';
import type {Document as DrawingDocument} from './types';
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
        setWorkspace(current => ({...current, activeId: id}));
    };
    const state = useEditorStore(store);
    const doc = state.document;
    const selected = doc.shapes.find(shape => shape.id === state.selectedId);
    const file = useRef<HTMLInputElement>(null);
    const fileMenu = useRef<HTMLDivElement>(null);
    const fileMenuButton = useRef<HTMLButtonElement>(null);
    const [fileMenuOpen, setFileMenuOpen] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!fileMenuOpen) return;
        const dismiss = (event: globalThis.PointerEvent) => {
            if (event.target instanceof Node && !fileMenu.current?.contains(event.target)) setFileMenuOpen(false);
        };
        document.addEventListener('pointerdown', dismiss);
        return () => document.removeEventListener('pointerdown', dismiss);
    }, [fileMenuOpen]);
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
    }, [store]);
    const undo = <button disabled={!state.canUndo} onClick={() => store.undo()}>Undo</button>;
    const redo = <button disabled={!state.canRedo} onClick={() => store.redo()}>Redo</button>;
    return <div className="main-layout">
        <nav className="menubar full-span">
            <div className="file-menu" ref={fileMenu}
                onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFileMenuOpen(false); }}
                onKeyDown={event => {
                    if (event.key === 'Escape') {
                        event.preventDefault(); setFileMenuOpen(false); fileMenuButton.current?.focus();
                    }
                }}>
                <button ref={fileMenuButton} aria-expanded={fileMenuOpen} aria-controls="file-actions"
                    onClick={() => setFileMenuOpen(open => !open)}>File <span aria-hidden="true">▾</span></button>
                {fileMenuOpen && <div id="file-actions" className="file-menu-actions" onClick={event => {
                    if (event.target instanceof HTMLButtonElement && !event.target.disabled) {
                        setFileMenuOpen(false); fileMenuButton.current?.focus();
                    }
                }}>
                <button disabled={state.transactionActive} onClick={() => file.current?.click()}>Load file</button>
                <button disabled={state.transactionActive} onClick={() => openDocument(emptyDocument())}>New Document</button>
                <button disabled={state.transactionActive} onClick={() => {
                    const url = URL.createObjectURL(new Blob([store.toJSON()], {type: 'application/json'}));
                    const link = document.createElement('a'); link.href = url; link.download = 'drawing.json'; link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}>Save JSON</button>
                </div>}
            </div>
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
            <button disabled={state.transactionActive} onClick={() => {
                const shape = makeRect('rect', {x: 50, y: 250, width: 50, height: 50});
                store.addShape(shape); store.select(shape.id);
            }}>New Rect</button>
            <button disabled={!selected || state.transactionActive} onClick={() => { if (selected) store.removeShape(selected.id); }}>Delete</button>
            {undo}{redo}
        </div>
        <div className="left scroll-container"><TreeView document={doc} selected={selected} onSelect={shape => store.select(shape.id)}/></div>
        <div className="center scroll-container"><VisualEditor key={activeTab.id} store={store}/></div>
        <div className="right scroll-container"><PropSheet key={activeTab.id} store={store}/></div>
        </div>
        <div className="statusbar full-span"><span role="alert">{error}</span><span className="spacer"/><label>Drag a rectangle to move; drag its lower-right corner to resize. Escape cancels.</label></div>
    </div>;
}
