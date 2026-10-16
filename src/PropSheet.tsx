import type {Draft} from 'immer';
import type {Shape, ShapeComponent} from './types';
import type {EditorStore} from './EditorStore';
import {useEditorStore} from './useEditorStore';
import {NameField} from './NameField';

function Field({store, title, value, type = 'number', nonnegative = false, update}: {
    store: EditorStore; title: string; value: number | string; type?: 'number' | 'color'; nonnegative?: boolean;
    update: (value: string) => void;
}) {
    return <label className="number-input"><span className="title">{title}</span>{value === '' && <small>Mixed</small>}<input aria-label={title} type={type} value={value}
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
    const shapes = state.document.shapes.filter(shape => state.selectedIds.includes(shape.id));
    if (!shapes.length) return <div className="prop-sheet">nothing selected</div>;
    const common = Object.entries(shapes[0].components).filter(([key, component]) => shapes.every(shape => {
        const entry = Object.entries(shape.components).find(([name]) => name === key);
        return entry?.[1].kind === component.kind;
    }));
    const update = (key: string, recipe: (component: Draft<ShapeComponent>) => void) => shapes.forEach(shape =>
        store.updateShape(shape.id, draft => recipe(componentFor(draft, key))));
    const fieldValue = (key: string, read: (component: ShapeComponent) => number | string) => {
        const values = shapes.map(shape => read(shape.components[key as keyof Shape['components']] as ShapeComponent));
        return values.every(value => value === values[0]) ? values[0] : '';
    };
    const field = (key: string, title: string, read: (component: ShapeComponent) => number | string,
        write: (component: Draft<ShapeComponent>, value: string) => void, type: 'number' | 'color' = 'number', nonnegative = false) =>
        <Field key={`${key}.${title}`} store={store} title={title} value={fieldValue(key, read)} type={type} nonnegative={nonnegative}
            update={value => update(key, component => write(component, value))}/>;
    return <div className="prop-sheet">
        <details open><summary>info</summary><div>
            {shapes.length === 1 ? <><NameField store={store} label="Shape name" value={shapes[0].name} rename={name => store.renameShape(shapes[0].id, name)}/>
                <div>{shapes[0].type}</div><small>{shapes[0].id}</small></> : <div>{shapes.length} objects selected</div>}
        </div></details>
        {common.map(([key, comp]) => <details open key={key}><summary>{key}</summary><div className="prop-sheet-panel">
            {comp.kind === 'resizable-bounds-component' && (['x', 'y', 'width', 'height'] as const).map(name => field(key, name,
                c => c.kind === 'resizable-bounds-component' ? c.bounds[name] : '', (c, value) => { if (c.kind === 'resizable-bounds-component') c.bounds[name] = Number(value); }, 'number', name === 'width' || name === 'height'))}
            {comp.kind === 'vector-network' && <p>{comp.points.length} points · {comp.segments.length} segments · {comp.regions.length} regions. Double-click the shape or choose Edit Vector to edit paths and fills.</p>}
            {comp.kind === 'fill-component' && field(key, 'Fill color', c => c.kind === 'fill-component' ? c.fill.color : '',
                (c, value) => { if (c.kind === 'fill-component') c.fill.color = value; }, 'color')}
            {comp.kind === 'stroke-component' && <>
                {field(key, 'Stroke color', c => c.kind === 'stroke-component' ? c.color : '', (c, value) => { if (c.kind === 'stroke-component') c.color = value; }, 'color')}
                {field(key, 'Stroke width', c => c.kind === 'stroke-component' ? c.width : '', (c, value) => { if (c.kind === 'stroke-component') c.width = Number(value); }, 'number', true)}</>}
            {(comp.kind === 'rounded-corner-component' || comp.kind === 'circle-like-component') && field(key, 'radius', c => c.kind === 'rounded-corner-component' || c.kind === 'circle-like-component' ? c.radius : '',
                (c, value) => { if (c.kind === 'rounded-corner-component' || c.kind === 'circle-like-component') c.radius = Number(value); }, 'number', true)}
            {comp.kind === 'circle-like-component' && (['x', 'y'] as const).map(name => field(key, `Center ${name}`, c => c.kind === 'circle-like-component' ? c.center[name] : '',
                (c, value) => { if (c.kind === 'circle-like-component') c.center[name] = Number(value); }))}
            {comp.kind === 'pixel-image-reference' && (['x', 'y', 'width', 'height'] as const).map(name => field(key, `Source ${name}`, c => c.kind === 'pixel-image-reference' ? c.source[name] : '',
                (c, value) => { if (c.kind === 'pixel-image-reference') c.source[name] = Math.round(Number(value)); }, 'number', name === 'width' || name === 'height'))}
            {comp.kind === 'pattern-size-component' && (['width', 'height'] as const).map(name => field(key, `Repeat ${name}`, c => c.kind === 'pattern-size-component' ? c[name] : '',
                (c, value) => { if (c.kind === 'pattern-size-component') c[name] = Math.max(1, Math.round(Number(value))); }, 'number', true))}
        </div></details>)}
    </div>;
}
