import {useRef} from 'react';
import type {Draft} from 'immer';
import type {ColorPalette, Shape, ShapeComponent} from '../model/types';
import type {EditorStore} from '../model/EditorStore';
import {NumberInput} from '../ui/NumberInput';
import {normalizeColor} from '../shapes/palettes';

// Property editors shared by the inspector's property sheet and the floating selection panel,
// so both edit the same values the same way (one undo step per focused field, Escape reverts).

export function Field({
    store,
    title,
    value,
    type = 'number',
    nonnegative = false,
    step,
    shiftStep,
    palettes = [],
    update,
}: {
    store: EditorStore;
    title: string;
    value: number | string;
    type?: 'number' | 'color';
    nonnegative?: boolean;
    step?: number;
    shiftStep?: number;
    palettes?: ColorPalette[];
    update: (value: string) => void;
}) {
    // Join a transaction that is already open (such as crop mode) instead of starting
    // one; only the field that started a transaction commits or cancels it.
    const owns = useRef(false);
    const onFocus = () => {
        owns.current = !store.getSnapshot().transactionActive;
        if (owns.current) store.beginTransaction(title);
    };
    const onBlur = () => {
        if (owns.current && store.getSnapshot().transactionActive) store.commitTransaction();
        owns.current = false;
    };
    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            if (owns.current && store.getSnapshot().transactionActive) store.cancelTransaction();
            owns.current = false;
            event.currentTarget.blur();
        }
        if (event.key === 'Enter') event.currentTarget.blur();
    };
    return (
        <div className="number-input">
            <span className="title">{title}</span>
            {value === '' && <small>Mixed</small>}
            {type === 'number' ? (
                <NumberInput
                    label={title}
                    value={value}
                    min={nonnegative ? 0 : undefined}
                    step={step}
                    shiftStep={shiftStep}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    onKeyDown={onKeyDown}
                    onChange={next => update(String(next))}
                />
            ) : (
                <>
                    <input
                        aria-label={title}
                        type="color"
                        value={value}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        onChange={event => update(event.target.value)}
                    />
                    {palettes.length > 0 && (
                        <select
                            aria-label={`${title} palette color`}
                            value=""
                            onChange={event => {
                                if (event.target.value) update(event.target.value);
                            }}
                        >
                            <option value="">Choose from palette…</option>
                            {palettes.map(palette => (
                                <optgroup key={palette.id} label={palette.name}>
                                    {palette.colors.map((color, index) => (
                                        <option key={color.id} value={normalizeColor(color.value)}>
                                            {color.name || `Color ${index + 1}`} · {normalizeColor(color.value)}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    )}
                </>
            )}
        </div>
    );
}

export function componentFor(shape: Draft<Shape>, key: string): Draft<ShapeComponent> {
    const entry = Object.entries(shape.components).find(([name]) => name === key);
    if (!entry) throw new Error('Unknown component');
    return entry[1];
}

type ComponentKey = keyof Shape['components'] & string;
/** Any component of any shape type (wider than ShapeComponent, which leaves out photo references). */
type AnyComponent = Shape extends infer S ? (S extends {components: infer C} ? C[keyof C] : never) : never;

/** The components every shape has under the same key and of the same kind, in the first shape's order. */
export function commonComponents(shapes: readonly Shape[]): [ComponentKey, AnyComponent][] {
    if (!shapes.length) return [];
    return (Object.entries(shapes[0].components) as [ComponentKey, AnyComponent][]).filter(([key, component]) =>
        shapes.every(shape => {
            const entry = Object.entries(shape.components).find(([name]) => name === key);
            return entry?.[1].kind === component.kind;
        }),
    );
}

/** Reads a component value across shapes ('' when they differ) and writes it to all of them. */
export function shapeFieldAccess(store: EditorStore, shapes: readonly Shape[]) {
    const update = (key: string, recipe: (component: Draft<ShapeComponent>) => void) =>
        shapes.forEach(shape => store.updateShape(shape.id, draft => recipe(componentFor(draft, key))));
    const fieldValue = (key: string, read: (component: ShapeComponent) => number | string) => {
        const values = shapes.map(shape => read(shape.components[key as ComponentKey] as ShapeComponent));
        return values.every(value => value === values[0]) ? values[0] : '';
    };
    return {update, fieldValue};
}

interface ComponentFieldsProps {
    store: EditorStore;
    shapes: readonly Shape[];
    /** The key of a component every shape in `shapes` shares. */
    componentKey: string;
}

export function FillFields({store, shapes, componentKey, palettes}: ComponentFieldsProps & {palettes: ColorPalette[]}) {
    const {update, fieldValue} = shapeFieldAccess(store, shapes);
    return (
        <Field
            store={store}
            title="Fill color"
            type="color"
            palettes={palettes}
            value={fieldValue(componentKey, c => (c.kind === 'fill-component' ? c.fill.color : ''))}
            update={value =>
                update(componentKey, c => {
                    if (c.kind === 'fill-component') c.fill.color = value;
                })
            }
        />
    );
}

export function StrokeFields({
    store,
    shapes,
    componentKey,
    palettes,
}: ComponentFieldsProps & {palettes: ColorPalette[]}) {
    const {update, fieldValue} = shapeFieldAccess(store, shapes);
    return (
        <>
            <Field
                store={store}
                title="Stroke color"
                type="color"
                palettes={palettes}
                value={fieldValue(componentKey, c => (c.kind === 'stroke-component' ? c.color : ''))}
                update={value =>
                    update(componentKey, c => {
                        if (c.kind === 'stroke-component') c.color = value;
                    })
                }
            />
            <Field
                store={store}
                title="Stroke width"
                nonnegative
                value={fieldValue(componentKey, c => (c.kind === 'stroke-component' ? c.width : ''))}
                update={value =>
                    update(componentKey, c => {
                        if (c.kind === 'stroke-component') c.width = Number(value);
                    })
                }
            />
        </>
    );
}

/** The corner radius of rectangles or the radius of circles. */
export function RadiusField({store, shapes, componentKey}: ComponentFieldsProps) {
    const {update, fieldValue} = shapeFieldAccess(store, shapes);
    return (
        <Field
            store={store}
            title="radius"
            nonnegative
            value={fieldValue(componentKey, c =>
                c.kind === 'rounded-corner-component' || c.kind === 'circle-like-component' ? c.radius : '',
            )}
            update={value =>
                update(componentKey, c => {
                    if (c.kind === 'rounded-corner-component' || c.kind === 'circle-like-component')
                        c.radius = Number(value);
                })
            }
        />
    );
}
