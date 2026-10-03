import type {Draft} from 'immer';
import type {Shape, ShapeComponent} from './types';
import type {EditorStore} from './EditorStore';
import {useEditorStore} from './useEditorStore';

function Field({store, title, value, type = 'number', nonnegative = false, update}: {
    store: EditorStore; title: string; value: number | string; type?: 'number' | 'color'; nonnegative?: boolean;
    update: (value: string) => void;
}) {
    return <label className="number-input"><span className="title">{title}</span><input aria-label={title} type={type} value={value}
        min={nonnegative ? 0 : undefined} step="any"
        onFocus={() => store.beginTransaction(title)}
        onBlur={() => { if (store.getSnapshot().transactionActive) store.commitTransaction(); }}
        onKeyDown={event => {
            if (event.key === 'Escape') { store.cancelTransaction(); event.currentTarget.blur(); }
            if (event.key === 'Enter') event.currentTarget.blur();
        }}
        onChange={event => {
            if (type === 'number' && (event.target.value === '' || !Number.isFinite(event.target.valueAsNumber) || (nonnegative && event.target.valueAsNumber < 0))) return;
            update(event.target.value);
        }}/></label>;
}
function componentFor(shape: Draft<Shape>, key: string): Draft<ShapeComponent> {
    const entry = Object.entries(shape.components).find(([name]) => name === key);
    if (!entry) throw new Error('Unknown component');
    return entry[1];
}
export default function PropSheet({store}: {store: EditorStore}) {
    const state = useEditorStore(store);
    const shape = state.document.shapes.find(s => s.id === state.selectedId);
    if (!shape) return <div className="prop-sheet">nothing selected</div>;
    const update = (key: string, recipe: (component: Draft<ShapeComponent>) => void) => store.updateShape(shape.id, draft => recipe(componentFor(draft, key)));
    return <div className="prop-sheet">
        <details open><summary>info</summary><div>{shape.name} ({shape.type})</div><small>{shape.id}</small></details>
        {Object.entries(shape.components).map(([key, comp]) => <details open key={key}><summary>{key}</summary><div className="prop-sheet-panel">
            {comp.kind === 'resizable-bounds-component' && (['x', 'y', 'width', 'height'] as const).map(field =>
                <Field key={field} store={store} title={field} value={comp.bounds[field]} nonnegative={field === 'width' || field === 'height'} update={value => update(key, c => { if (c.kind === 'resizable-bounds-component') c.bounds[field] = Number(value); })}/>)}
            {comp.kind === 'fill-component' && <Field store={store} title="Fill color" type="color" value={comp.fill.color} update={value => update(key, c => { if (c.kind === 'fill-component') c.fill.color = value; })}/>}
            {comp.kind === 'stroke-component' && <>
                <Field store={store} title="Stroke color" type="color" value={comp.color} update={value => update(key, c => { if (c.kind === 'stroke-component') c.color = value; })}/>
                <Field store={store} title="Stroke width" value={comp.width} nonnegative update={value => update(key, c => { if (c.kind === 'stroke-component') c.width = Number(value); })}/></>}
            {(comp.kind === 'rounded-corner-component' || comp.kind === 'circle-like-component') && <Field store={store} title="radius" value={comp.radius} nonnegative update={value => update(key, c => { if (c.kind === 'rounded-corner-component' || c.kind === 'circle-like-component') c.radius = Number(value); })}/>}
            {comp.kind === 'circle-like-component' && (['x', 'y'] as const).map(field => <Field key={field} store={store} title={`Center ${field}`} value={comp.center[field]} update={value => update(key, c => { if (c.kind === 'circle-like-component') c.center[field] = Number(value); })}/>)}
        </div></details>)}
    </div>;
}
