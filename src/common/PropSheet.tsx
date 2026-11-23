import {useRef} from 'react';
import {PropertySection} from '../ui/controls';
import type {Draft} from 'immer';
import type {
    Bounds,
    ColorPalette,
    DrawDocument,
    FontAsset,
    PhotoShape,
    Shape,
    ShapeComponent,
    TextComponent,
} from '../model/types';
import {actualSize, cropTo, resetCrop} from '../shapes/photos';
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

function isVerticalAlign(value: string): value is TextComponent['verticalAlign'] {
    return value === 'top' || value === 'middle' || value === 'bottom';
}

function componentFor(shape: Draft<Shape>, key: string): Draft<ShapeComponent> {
    const entry = Object.entries(shape.components).find(([name]) => name === key);
    if (!entry) throw new Error('Unknown component');
    return entry[1];
}

/** Shown when the document row in the tree is the selection. */
function DocumentProperties({
    store,
    document,
    onAddGoogleFont,
}: {
    store: EditorStore;
    document: DrawDocument;
    onAddGoogleFont: () => void;
}) {
    const counts: [string, number][] = [
        ['Pages', document.pages.length],
        ['Shapes', document.shapes.length],
        ['Images', document.images.length],
        ['Palettes', document.palettes.length],
        ['Fonts', document.fonts.length],
    ];
    return (
        <div className="prop-sheet">
            <PropertySection title="Document">
                <NameField store={store} label="Title" value={document.title} rename={name => store.setTitle(name)} />
            </PropertySection>
            <PropertySection title="Contents">
                <dl className="prop-stats">
                    {counts.map(([label, count]) => (
                        <div key={label}>
                            <dt>{label}</dt>
                            <dd>{count}</dd>
                        </div>
                    ))}
                </dl>
            </PropertySection>
            <PropertySection title="Fonts">
                {document.fonts.length ? (
                    <ul className="prop-font-list">
                        {document.fonts.map(font => (
                            <li key={font.id} style={{fontFamily: JSON.stringify(font.family)}}>
                                {font.family}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="prop-note">No fonts saved with this document.</p>
                )}
                <button type="button" onClick={onAddGoogleFont}>
                    Add Google Font…
                </button>
            </PropertySection>
        </div>
    );
}

export default function PropSheet({
    store,
    documentSelected = false,
    onAddGoogleFont,
    photoActions = NO_PHOTO_ACTIONS,
}: {
    store: EditorStore;
    /** The document row is selected: show document properties when no shapes are selected. */
    documentSelected?: boolean;
    onAddGoogleFont: () => void;
    photoActions?: PhotoActions;
}) {
    const state = useEditorStore(store);
    const shapes = state.document.shapes.filter(shape => state.selectedIds.includes(shape.id));
    if (!shapes.length && documentSelected)
        return <DocumentProperties store={store} document={state.document} onAddGoogleFont={onAddGoogleFont} />;
    if (!shapes.length) return <div className="prop-sheet empty-state">Select an object to edit its properties.</div>;
    const common = Object.entries(shapes[0].components).filter(([key, component]) =>
        shapes.every(shape => {
            const entry = Object.entries(shape.components).find(([name]) => name === key);
            return entry?.[1].kind === component.kind;
        }),
    );
    const update = (key: string, recipe: (component: Draft<ShapeComponent>) => void) =>
        shapes.forEach(shape => store.updateShape(shape.id, draft => recipe(componentFor(draft, key))));
    const fieldValue = (key: string, read: (component: ShapeComponent) => number | string) => {
        const values = shapes.map(shape => read(shape.components[key as keyof Shape['components']] as ShapeComponent));
        return values.every(value => value === values[0]) ? values[0] : '';
    };
    const field = (
        key: string,
        title: string,
        read: (component: ShapeComponent) => number | string,
        write: (component: Draft<ShapeComponent>, value: string) => void,
        type: 'number' | 'color' = 'number',
        nonnegative = false,
        steps: {step?: number; shiftStep?: number} = {},
    ) => (
        <Field
            key={`${key}.${title}`}
            store={store}
            title={title}
            value={fieldValue(key, read)}
            type={type}
            nonnegative={nonnegative}
            step={steps.step}
            shiftStep={steps.shiftStep}
            palettes={type === 'color' ? state.document.palettes : []}
            update={value => update(key, component => write(component, value))}
        />
    );
    return (
        <div className="prop-sheet">
            <PropertySection title="General">
                {shapes.length === 1 ? (
                    <>
                        <NameField
                            store={store}
                            label="Shape name"
                            value={shapes[0].name}
                            rename={name => store.renameShape(shapes[0].id, name)}
                        />
                        <div className="shape-type" title={shapes[0].id}>
                            {shapes[0].type}
                        </div>
                    </>
                ) : (
                    <div>{shapes.length} objects selected</div>
                )}
            </PropertySection>
            {common.map(([key, comp]) => (
                <PropertySection
                    key={key}
                    title={
                        (
                            {
                                rect: 'Position & size',
                                oval: 'Position & size',
                                circle: 'Circle',
                                fill: 'Fill',
                                stroke: 'Stroke',
                                cornerRadius: 'Corners',
                                image: 'Image source',
                                photo: 'Image',
                                pattern: 'Pattern',
                                text: 'Text',
                            } as Record<string, string>
                        )[key] ?? key
                    }
                >
                    {comp.kind === 'resizable-bounds-component' &&
                        (['x', 'y', 'width', 'height'] as const).map(name =>
                            field(
                                key,
                                name,
                                c => (c.kind === 'resizable-bounds-component' ? c.bounds[name] : ''),
                                (c, value) => {
                                    if (c.kind === 'resizable-bounds-component') c.bounds[name] = Number(value);
                                },
                                'number',
                                name === 'width' || name === 'height',
                            ),
                        )}
                    {comp.kind === 'vector-network' && (
                        <p>
                            {comp.points.length} points · {comp.segments.length} segments · {comp.regions.length}{' '}
                            regions. Double-click the shape or choose Edit Vector to edit paths and fills.
                        </p>
                    )}
                    {comp.kind === 'fill-component' &&
                        field(
                            key,
                            'Fill color',
                            c => (c.kind === 'fill-component' ? c.fill.color : ''),
                            (c, value) => {
                                if (c.kind === 'fill-component') c.fill.color = value;
                            },
                            'color',
                        )}
                    {comp.kind === 'stroke-component' && (
                        <>
                            {field(
                                key,
                                'Stroke color',
                                c => (c.kind === 'stroke-component' ? c.color : ''),
                                (c, value) => {
                                    if (c.kind === 'stroke-component') c.color = value;
                                },
                                'color',
                            )}
                            {field(
                                key,
                                'Stroke width',
                                c => (c.kind === 'stroke-component' ? c.width : ''),
                                (c, value) => {
                                    if (c.kind === 'stroke-component') c.width = Number(value);
                                },
                                'number',
                                true,
                            )}
                        </>
                    )}
                    {(comp.kind === 'rounded-corner-component' || comp.kind === 'circle-like-component') &&
                        field(
                            key,
                            'radius',
                            c =>
                                c.kind === 'rounded-corner-component' || c.kind === 'circle-like-component'
                                    ? c.radius
                                    : '',
                            (c, value) => {
                                if (c.kind === 'rounded-corner-component' || c.kind === 'circle-like-component')
                                    c.radius = Number(value);
                            },
                            'number',
                            true,
                        )}
                    {comp.kind === 'circle-like-component' &&
                        (['x', 'y'] as const).map(name =>
                            field(
                                key,
                                `Center ${name}`,
                                c => (c.kind === 'circle-like-component' ? c.center[name] : ''),
                                (c, value) => {
                                    if (c.kind === 'circle-like-component') c.center[name] = Number(value);
                                },
                            ),
                        )}
                    {comp.kind === 'pixel-image-reference' &&
                        (['x', 'y', 'width', 'height'] as const).map(name =>
                            field(
                                key,
                                `Source ${name}`,
                                c => (c.kind === 'pixel-image-reference' ? c.source[name] : ''),
                                (c, value) => {
                                    if (c.kind === 'pixel-image-reference') c.source[name] = Math.round(Number(value));
                                },
                                'number',
                                name === 'width' || name === 'height',
                            ),
                        )}
                    {comp.kind === 'photo-reference' && shapes.length === 1 && shapes[0].type === 'photo' && (
                        <PhotoSection store={store} shape={shapes[0]} actions={photoActions} />
                    )}
                    {comp.kind === 'pattern-size-component' &&
                        (['width', 'height'] as const).map(name =>
                            field(
                                key,
                                `Repeat ${name}`,
                                c => (c.kind === 'pattern-size-component' ? c[name] : ''),
                                (c, value) => {
                                    if (c.kind === 'pattern-size-component')
                                        c[name] = Math.max(1, Math.round(Number(value)));
                                },
                                'number',
                                true,
                            ),
                        )}
                    {comp.kind === 'text-component' && (
                        <>
                            <label className="number-input text-content-field">
                                <span className="title">Text</span>
                                <textarea
                                    aria-label="Text content"
                                    value={fieldValue(key, c => (c.kind === 'text-component' ? c.text : '')) as string}
                                    onFocus={() => store.beginTransaction('Edit text')}
                                    onBlur={() => {
                                        if (store.getSnapshot().transactionActive) store.commitTransaction();
                                    }}
                                    onKeyDown={event => {
                                        if (event.key === 'Escape') {
                                            store.cancelTransaction();
                                            event.currentTarget.blur();
                                        }
                                    }}
                                    onChange={event =>
                                        update(key, c => {
                                            if (c.kind === 'text-component') c.text = event.target.value;
                                        })
                                    }
                                />
                            </label>
                            <label className="number-input">
                                <span className="title">Font family</span>
                                <select
                                    aria-label="Font family"
                                    value={
                                        fieldValue(key, c =>
                                            c.kind === 'text-component' ? (c.fontId ?? '') : '',
                                        ) as string
                                    }
                                    onChange={event =>
                                        update(key, c => {
                                            if (c.kind === 'text-component') c.fontId = event.target.value || null;
                                        })
                                    }
                                >
                                    <option value="">System Sans-serif</option>
                                    {state.document.fonts.map((font: FontAsset) => (
                                        <option key={font.id} value={font.id}>
                                            {font.family}
                                        </option>
                                    ))}
                                </select>
                                <button type="button" onClick={onAddGoogleFont}>
                                    Add Google Font…
                                </button>
                            </label>
                            {field(
                                key,
                                'Font size',
                                c => (c.kind === 'text-component' ? c.fontSize : ''),
                                (c, value) => {
                                    if (c.kind === 'text-component') c.fontSize = Math.max(1, Number(value));
                                },
                                'number',
                                true,
                            )}
                            <label className="number-input">
                                <span className="title">Font weight</span>
                                <select
                                    aria-label="Font weight"
                                    value={
                                        fieldValue(key, c => (c.kind === 'text-component' ? c.fontWeight : '')) as
                                            number | ''
                                    }
                                    onChange={event =>
                                        update(key, c => {
                                            if (c.kind === 'text-component') c.fontWeight = Number(event.target.value);
                                        })
                                    }
                                >
                                    {[100, 200, 300, 400, 500, 600, 700, 800, 900].map(weight => (
                                        <option key={weight} value={weight}>
                                            {weight}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {field(
                                key,
                                'Text color',
                                c => (c.kind === 'text-component' ? c.color : ''),
                                (c, value) => {
                                    if (c.kind === 'text-component') c.color = value;
                                },
                                'color',
                            )}
                            {field(
                                key,
                                'Line spacing',
                                c => (c.kind === 'text-component' ? c.lineHeight : ''),
                                (c, value) => {
                                    if (c.kind === 'text-component') c.lineHeight = Math.max(0.1, Number(value));
                                },
                                'number',
                                true,
                                {step: 0.1, shiftStep: 1},
                            )}
                            <label className="number-input">
                                <span className="title">Alignment</span>
                                <select
                                    aria-label="Text alignment"
                                    value={fieldValue(key, c => (c.kind === 'text-component' ? c.align : '')) as string}
                                    onChange={event =>
                                        update(key, c => {
                                            if (
                                                c.kind === 'text-component' &&
                                                ['left', 'center', 'right'].includes(event.target.value)
                                            )
                                                c.align = event.target.value as 'left' | 'center' | 'right';
                                        })
                                    }
                                >
                                    <option value="left">Left</option>
                                    <option value="center">Center</option>
                                    <option value="right">Right</option>
                                </select>
                            </label>
                            <label className="number-input">
                                <span className="title">Vertical</span>
                                <select
                                    aria-label="Vertical alignment"
                                    value={
                                        fieldValue(key, c =>
                                            c.kind === 'text-component' ? c.verticalAlign : '',
                                        ) as string
                                    }
                                    onChange={event => {
                                        const value = event.target.value;
                                        update(key, c => {
                                            if (c.kind === 'text-component' && isVerticalAlign(value))
                                                c.verticalAlign = value;
                                        });
                                    }}
                                >
                                    <option value="top">Top</option>
                                    <option value="middle">Middle</option>
                                    <option value="bottom">Bottom</option>
                                </select>
                            </label>
                            <label className="number-input">
                                <span className="title">Italic</span>
                                <input
                                    aria-label="Italic"
                                    type="checkbox"
                                    checked={
                                        fieldValue(key, c =>
                                            c.kind === 'text-component' ? (c.italic ? 1 : 0) : '',
                                        ) === 1
                                    }
                                    onChange={event =>
                                        update(key, c => {
                                            if (c.kind === 'text-component') c.italic = event.target.checked;
                                        })
                                    }
                                />
                            </label>
                        </>
                    )}
                </PropertySection>
            ))}
        </div>
    );
}

export interface PhotoActions {
    /** The photo shape in crop mode, if any. */
    cropId: string | null;
    onStartCrop: (id: string) => void;
    onFinishCrop: (commit: boolean) => void;
    onReplace: (id: string) => void;
}

const NO_PHOTO_ACTIONS: PhotoActions = {
    cropId: null,
    onStartCrop: () => {},
    onFinishCrop: () => {},
    onReplace: () => {},
};

/** Crop and image controls for one photo shape. Crop values are in the photo's own pixels. */
function PhotoSection({store, shape, actions}: {store: EditorStore; shape: PhotoShape; actions: PhotoActions}) {
    const state = useEditorStore(store);
    const photo = state.document.photos.find(item => item.id === shape.components.photo.photoId);
    if (!photo) return <p>This image's data is missing.</p>;
    const placement = {rect: shape.components.rect.bounds, crop: shape.components.photo.crop};
    const place = (label: string, next: {rect: Bounds; crop: Bounds}) => {
        const apply = () =>
            store.updateShape(shape.id, draft => {
                if (draft.type !== 'photo') return;
                draft.components.rect.bounds = next.rect;
                draft.components.photo.crop = next.crop;
            });
        // Inside crop mode the edit joins the crop session; otherwise it is its own undo step.
        if (store.getSnapshot().transactionActive) apply();
        else {
            store.beginTransaction(label);
            apply();
            store.commitTransaction();
        }
    };
    const cropping = actions.cropId === shape.id;
    const round = (value: number) => Math.round(value * 100) / 100;
    return (
        <>
            <p className="photo-info">
                {photo.name} · {photo.width} × {photo.height} px
            </p>
            {(['x', 'y', 'width', 'height'] as const).map(name => (
                <Field
                    key={name}
                    store={store}
                    title={`Crop ${name}`}
                    value={round(placement.crop[name])}
                    nonnegative
                    update={value =>
                        place('Crop image', cropTo(placement, photo, {...placement.crop, [name]: Number(value)}))
                    }
                />
            ))}
            <div className="photo-actions">
                {cropping ? (
                    <>
                        <button onClick={() => actions.onFinishCrop(true)}>Apply Crop</button>
                        <button onClick={() => actions.onFinishCrop(false)}>Cancel</button>
                    </>
                ) : (
                    <button disabled={state.transactionActive} onClick={() => actions.onStartCrop(shape.id)}>
                        Crop…
                    </button>
                )}
                <button onClick={() => place('Reset crop', resetCrop(placement, photo))}>Reset Crop</button>
                <button onClick={() => place('Actual size', actualSize(placement))}>Actual Size</button>
                <button disabled={state.transactionActive} onClick={() => actions.onReplace(shape.id)}>
                    Replace Image…
                </button>
            </div>
        </>
    );
}
