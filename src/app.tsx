import {useEffect, useRef, useState} from 'react';
import TreeView from './TreeView';
import PropSheet from './PropSheet';
import VisualEditor from './VisualEditor';
import {makeRect} from './reducer';
import {EditorStore, emptyDocument} from './EditorStore';
import {makeExampleDocument} from './exampleDocument';
import {useEditorStore} from './useEditorStore';
import './app.css';

export default function App() {
    const [store] = useState(() => new EditorStore(makeExampleDocument()));
    const state = useEditorStore(store);
    const doc = state.document;
    const selected = doc.shapes.find(shape => shape.id === state.selectedId);
    const file = useRef<HTMLInputElement>(null);
    const [error, setError] = useState('');
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
            <ul><li><button disabled={state.transactionActive} onClick={() => file.current?.click()}>Load file</button></li>
                <li><button disabled={state.transactionActive} onClick={() => store.replaceDocument(emptyDocument())}>New Document</button></li>
                <li><button disabled={state.transactionActive} onClick={() => {
                    const url = URL.createObjectURL(new Blob([store.toJSON()], {type: 'application/json'}));
                    const link = document.createElement('a'); link.href = url; link.download = 'drawing.json'; link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}>Save JSON</button></li></ul>
            <ul><li>{undo}</li><li>{redo}</li></ul>
            <input hidden ref={file} type="file" accept=".json,application/json" onChange={async event => {
                const chosen = event.target.files?.[0]; event.target.value = '';
                if (!chosen) return;
                try { store.loadJSON(await chosen.text()); setError(''); }
                catch (error) { setError(error instanceof Error ? error.message : 'Unable to load document'); }
            }}/>
        </nav>
        <div className="toolbar full-span">
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
        <div className="center scroll-container"><VisualEditor store={store}/></div>
        <div className="right scroll-container"><PropSheet store={store}/></div>
        <div className="statusbar full-span"><span role="alert">{error}</span><span className="spacer"/><label>Drag a rectangle to move; drag its lower-right corner to resize. Escape cancels.</label></div>
    </div>;
}
