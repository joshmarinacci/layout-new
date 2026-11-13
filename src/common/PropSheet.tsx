import {PropertySection} from '../ui/controls';
import type {Draft} from 'immer';
import type {ColorPalette, FontAsset, Shape, ShapeComponent} from '../model/types';
import type {EditorStore} from '../model/EditorStore';
import {useEditorStore} from '../model/useEditorStore';
import {NameField} from './NameField';
import {NumberInput} from '../ui/NumberInput';
import {normalizeColor} from '../shapes/palettes';

function Field({
                   store,
                   title,
                   value,
                   type = 'number',
                   nonnegative = false,
                   palettes = [],
                   update
               }: {
    store: EditorStore;
    title: string;
    value: number | string;
    type?: 'number' | 'color';
    nonnegative?: boolean;
    palettes?: ColorPalette[];
    update: (value: string) => void;
}) {
    const onFocus = () => store.beginTransaction(title);
    const onBlur = () => {
        if (store.getSnapshot().transactionActive) store.commitTransaction();
    };
    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            store.cancelTransaction();
            event.currentTarget.blur();
        }
        if (event.key === 'Enter') event.currentTarget.blur();
    };
    return <div className="number-input"><span
        className="title">{title}</span>{value === '' && <small>Mixed</small>}
        {type === 'number' ? <NumberInput label={title} value={value}
                                          min={nonnegative ? 0 : undefined}
                                          onFocus={onFocus} onBlur={onBlur}
                                          onKeyDown={onKeyDown}
                                          onChange={next => update(String(next))}/> :
            <><input aria-label={title} type="color" value={value}
                   onFocus={onFocus} onBlur={onBlur}
                   onChange={event => update(event.target.value)}/>
                {palettes.length > 0 && <select aria-label={`${title} palette color`} value="" onChange={event => {if (event.target.value) update(event.target.value);}}><option value="">Choose from palette…</option>{palettes.map(palette => <optgroup key={palette.id} label={palette.name}>{palette.colors.map((color, index) => <option key={color.id} value={normalizeColor(color.value)}>{color.name || `Color ${index+1}`} · {normalizeColor(color.value)}</option>)}</optgroup>)}</select>}</>}</div>;
}

function componentFor(shape: Draft<Shape>, key: string): Draft<ShapeComponent> {
    const entry = Object.entries(shape.components).find(([name]) => name === key);
    if (!entry) throw new Error('Unknown component');
    return entry[1];
}

export default function PropSheet({store, onAddGoogleFont}: { store: EditorStore; onAddGoogleFont: () => void }) {
    const state = useEditorStore(store);
    const shapes = state.document.shapes.filter(shape => state.selectedIds.includes(shape.id));
    if (!shapes.length) return <div className="prop-sheet empty-state">Select an
        object to edit its properties.</div>;
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
        <Field key={`${key}.${title}`} store={store} title={title}
               value={fieldValue(key, read)} type={type}
               nonnegative={nonnegative}
               palettes={type === 'color' ? state.document.palettes : []}
               update={value => update(key, component => write(component, value))}/>;
    return <div className="prop-sheet">
        <PropertySection title="General">
            {shapes.length === 1 ? <><NameField store={store} label="Shape name"
                                                value={shapes[0].name}
                                                rename={name => store.renameShape(shapes[0].id, name)}/>
                <div className="shape-type"
                     title={shapes[0].id}>{shapes[0].type}</div>
            </> : <div>{shapes.length} objects selected</div>}
        </PropertySection>
        {common.map(([key, comp]) => <PropertySection key={key} title={({
            rect: "Position & size",
            oval: "Position & size",
            circle: "Circle",
            fill: "Fill",
            stroke: "Stroke",
            cornerRadius: "Corners",
            image: "Image source",
            pattern: "Pattern",
            text: "Text"
        } as Record<string, string>)[key] ?? key}>
            {comp.kind === 'resizable-bounds-component' && (['x', 'y', 'width', 'height'] as const).map(name => field(key, name,
                c => c.kind === 'resizable-bounds-component' ? c.bounds[name] : '', (c, value) => {
                    if (c.kind === 'resizable-bounds-component') c.bounds[name] = Number(value);
                }, 'number', name === 'width' || name === 'height'))}
            {comp.kind === 'vector-network' &&
                <p>{comp.points.length} points · {comp.segments.length} segments
                    · {comp.regions.length} regions. Double-click the shape or
                    choose Edit Vector to edit paths and fills.</p>}
            {comp.kind === 'fill-component' && field(key, 'Fill color', c => c.kind === 'fill-component' ? c.fill.color : '',
                (c, value) => {
                    if (c.kind === 'fill-component') c.fill.color = value;
                }, 'color')}
            {comp.kind === 'stroke-component' && <>
                {field(key, 'Stroke color', c => c.kind === 'stroke-component' ? c.color : '', (c, value) => {
                    if (c.kind === 'stroke-component') c.color = value;
                }, 'color')}
                {field(key, 'Stroke width', c => c.kind === 'stroke-component' ? c.width : '', (c, value) => {
                    if (c.kind === 'stroke-component') c.width = Number(value);
                }, 'number', true)}</>}
            {(comp.kind === 'rounded-corner-component' || comp.kind === 'circle-like-component') && field(key, 'radius', c => c.kind === 'rounded-corner-component' || c.kind === 'circle-like-component' ? c.radius : '',
                (c, value) => {
                    if (c.kind === 'rounded-corner-component' || c.kind === 'circle-like-component') c.radius = Number(value);
                }, 'number', true)}
            {comp.kind === 'circle-like-component' && (['x', 'y'] as const).map(name => field(key, `Center ${name}`, c => c.kind === 'circle-like-component' ? c.center[name] : '',
                (c, value) => {
                    if (c.kind === 'circle-like-component') c.center[name] = Number(value);
                }))}
            {comp.kind === 'pixel-image-reference' && (['x', 'y', 'width', 'height'] as const).map(name => field(key, `Source ${name}`, c => c.kind === 'pixel-image-reference' ? c.source[name] : '',
                (c, value) => {
                    if (c.kind === 'pixel-image-reference') c.source[name] = Math.round(Number(value));
                }, 'number', name === 'width' || name === 'height'))}
            {comp.kind === 'pattern-size-component' && (['width', 'height'] as const).map(name => field(key, `Repeat ${name}`, c => c.kind === 'pattern-size-component' ? c[name] : '',
                (c, value) => {
                    if (c.kind === 'pattern-size-component') c[name] = Math.max(1, Math.round(Number(value)));
                }, 'number', true))}
            {comp.kind === 'text-component' && <>
                <label className="number-input text-content-field"><span className="title">Text</span><textarea aria-label="Text content" value={fieldValue(key, c => c.kind === 'text-component' ? c.text : '') as string}
                    onFocus={() => store.beginTransaction('Edit text')}
                    onBlur={() => {if (store.getSnapshot().transactionActive) store.commitTransaction();}}
                    onKeyDown={event => {if (event.key === 'Escape') {store.cancelTransaction(); event.currentTarget.blur();}}}
                    onChange={event => update(key, c => {if (c.kind === 'text-component') c.text = event.target.value;})}/></label>
                <label className="number-input"><span className="title">Font family</span><select aria-label="Font family" value={fieldValue(key, c => c.kind === 'text-component' ? c.fontId ?? '' : '') as string}
                    onChange={event => update(key, c => {if (c.kind === 'text-component') c.fontId = event.target.value || null;})}>
                    <option value="">System Sans-serif</option>{state.document.fonts.map((font: FontAsset) => <option key={font.id} value={font.id}>{font.family}</option>)}
                </select><button type="button" onClick={onAddGoogleFont}>Add Google Font…</button></label>
                {field(key, 'Font size', c => c.kind === 'text-component' ? c.fontSize : '', (c, value) => {if (c.kind === 'text-component') c.fontSize = Math.max(1, Number(value));}, 'number', true)}
                <label className="number-input"><span className="title">Font weight</span><select aria-label="Font weight" value={fieldValue(key, c => c.kind === 'text-component' ? c.fontWeight : '') as number | ''}
                    onChange={event => update(key, c => {if (c.kind === 'text-component') c.fontWeight = Number(event.target.value);})}>
                    {[100, 200, 300, 400, 500, 600, 700, 800, 900].map(weight => <option key={weight} value={weight}>{weight}</option>)}
                </select></label>
                {field(key, 'Text color', c => c.kind === 'text-component' ? c.color : '', (c, value) => {if (c.kind === 'text-component') c.color = value;}, 'color')}
                {field(key, 'Line spacing', c => c.kind === 'text-component' ? c.lineHeight : '', (c, value) => {if (c.kind === 'text-component') c.lineHeight = Math.max(0.1, Number(value));}, 'number', true)}
                <label className="number-input"><span className="title">Alignment</span><select aria-label="Text alignment" value={fieldValue(key, c => c.kind === 'text-component' ? c.align : '') as string}
                    onChange={event => update(key, c => {if (c.kind === 'text-component' && ['left', 'center', 'right'].includes(event.target.value)) c.align = event.target.value as 'left' | 'center' | 'right';})}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select></label>
                <label className="number-input"><span className="title">Italic</span><input aria-label="Italic" type="checkbox" checked={fieldValue(key, c => c.kind === 'text-component' ? (c.italic ? 1 : 0) : '') === 1}
                    onChange={event => update(key, c => {if (c.kind === 'text-component') c.italic = event.target.checked;})}/></label>
            </>}
        </PropertySection>)}
    </div>;
}
