import {useEffect, useRef, useState} from 'react';
import {Copy, GripVertical, Plus, Trash2, Upload} from 'lucide-react';
import type {PointerEvent as ReactPointerEvent, CSSProperties} from 'react';
import type {ColorPalette, PaletteColor} from '../model/types';
import type {EditorStore} from '../model/EditorStore';
import {convertColor, newPalette, normalizeColor, parsePalette, pico8Colors} from './palettes';
import {NameField} from '../common/NameField';

function PaletteColorFields({
    color,
    index,
    space,
    update,
    rename,
}: {
    color: PaletteColor;
    index: number;
    space: 'rgb' | 'hsl' | 'oklch' | 'oklab';
    update: (value: string) => void;
    rename: (value: string) => void;
}) {
    const [colorSpaceText, setColorSpaceText] = useState(() => convertColor(color.value, space));
    const [nameText, setNameText] = useState(color.name ?? '');
    // Re-sync the editable text when the color changes from outside (undo, import, another field).
    const colorKey = `${color.value}|${color.space}|${space}`,
        nameKey = `${color.id}|${color.name ?? ''}`;
    const [syncedColorKey, setSyncedColorKey] = useState(colorKey);
    const [syncedNameKey, setSyncedNameKey] = useState(nameKey);
    if (syncedColorKey !== colorKey) {
        setSyncedColorKey(colorKey);
        setColorSpaceText(convertColor(color.value, space));
    }
    if (syncedNameKey !== nameKey) {
        setSyncedNameKey(nameKey);
        setNameText(color.name ?? '');
    }
    return (
        <div className="palette-color-fields">
            <label>
                Name
                <input
                    value={nameText}
                    placeholder={`Color ${index + 1}`}
                    onChange={event => setNameText(event.target.value)}
                    onBlur={() => {
                        if (nameText !== (color.name ?? '')) rename(nameText);
                    }}
                />
            </label>
            <label>
                Hex
                <input
                    type="color"
                    value={normalizeColor(color.value)}
                    onChange={event => update(event.target.value)}
                />
                <code>{normalizeColor(color.value)}</code>
            </label>
            <label>
                {space.toUpperCase()}
                <input
                    value={colorSpaceText}
                    onChange={event => setColorSpaceText(event.target.value)}
                    onBlur={() => {
                        try {
                            normalizeColor(colorSpaceText);
                            update(colorSpaceText);
                        } catch {
                            setColorSpaceText(convertColor(color.value, space));
                        }
                    }}
                />
            </label>
        </div>
    );
}

export function PaletteAssetView({
    store,
    palette,
    onBack,
}: {
    store: EditorStore;
    palette: ColorPalette;
    onBack: () => void;
}) {
    const [space, setSpace] = useState<'rgb' | 'hsl' | 'oklch' | 'oklab'>('rgb');
    const [dragPosition, setDragPosition] = useState<{
        id: string;
        left: number;
        top: number;
        width: number;
        height: number;
    } | null>(null);
    const pointerDrag = useRef<{
        id: string;
        pointerId: number;
        startX: number;
        startY: number;
        offsetX: number;
        offsetY: number;
        left: number;
        top: number;
        width: number;
        height: number;
        active: boolean;
    } | null>(null);
    const picker = useRef<HTMLInputElement>(null);
    const colorsInUse = palette.colors.filter(color =>
        store.getSnapshot().document.shapes.some(shape => {
            const components = shape.components;
            return (
                ('fill' in components &&
                    components.fill.fill.color.toLowerCase() === normalizeColor(color.value).toLowerCase()) ||
                ('stroke' in components &&
                    components.stroke.color.toLowerCase() === normalizeColor(color.value).toLowerCase())
            );
        }),
    ).length;
    const editColor = (id: string, recipe: (color: PaletteColor) => void) =>
        store.edit('Edit palette color', draft => {
            const target = draft.palettes.find(item => item.id === palette.id)?.colors.find(item => item.id === id);
            if (target) recipe(target);
        });
    const addColor = (value = '#808080', name = `Color ${palette.colors.length + 1}`) =>
        store.edit('Add palette color', draft => {
            draft.palettes
                .find(item => item.id === palette.id)
                ?.colors.push({id: crypto.randomUUID(), name, space: 'srgb', value});
        });
    const beginColorDrag = (event: ReactPointerEvent<HTMLButtonElement>, colorId: string) => {
        if (event.button !== 0 || store.getSnapshot().transactionActive) return;
        const row = event.currentTarget.closest<HTMLElement>('[data-palette-color-row]');
        if (!row) return;
        const rect = row.getBoundingClientRect();
        pointerDrag.current = {
            id: colorId,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            active: false,
        };
        event.preventDefault();
    };
    useEffect(() => {
        const onPointerMove = (event: PointerEvent) => {
            const drag = pointerDrag.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            if (!drag.active) {
                if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
                drag.active = true;
                store.beginTransaction('Reorder palette colors');
            }
            event.preventDefault();
            drag.left = event.clientX - drag.offsetX;
            drag.top = event.clientY - drag.offsetY;
            setDragPosition({id: drag.id, left: drag.left, top: drag.top, width: drag.width, height: drag.height});

            const rows = [...document.querySelectorAll<HTMLElement>('[data-palette-color-row]')].filter(
                row => row.dataset.paletteColorRow !== drag.id,
            );
            let destination = rows.length;
            for (let index = 0; index < rows.length; index++) {
                const rect = rows[index].getBoundingClientRect();
                if (event.clientY < rect.top + rect.height / 2) {
                    destination = index;
                    break;
                }
            }
            const current = store.getSnapshot().document.palettes.find(item => item.id === palette.id);
            if (!current) return;
            const from = current.colors.findIndex(color => color.id === drag.id);
            if (from < 0) return;
            destination = Math.max(0, Math.min(destination, current.colors.length - 1));
            if (destination !== from)
                store.edit('Move palette color', draft => {
                    const item = draft.palettes.find(value => value.id === palette.id);
                    if (!item) return;
                    const sourceIndex = item.colors.findIndex(color => color.id === drag.id);
                    if (sourceIndex < 0) return;
                    const [color] = item.colors.splice(sourceIndex, 1);
                    item.colors.splice(destination, 0, color);
                });
        };
        const finish = (event: PointerEvent, cancelled = false) => {
            const drag = pointerDrag.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            if (drag.active && store.getSnapshot().transactionActive) {
                if (cancelled) store.cancelTransaction();
                else store.commitTransaction();
            }
            pointerDrag.current = null;
            setDragPosition(null);
        };
        const onPointerUp = (event: PointerEvent) => finish(event);
        const onPointerCancel = (event: PointerEvent) => finish(event, true);
        window.addEventListener('pointermove', onPointerMove, {passive: false});
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerCancel);
        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerCancel);
        };
    }, [palette.id, store]);
    const importFile = async (file: File) => {
        try {
            const imported = parsePalette(await file.text(), file.name);
            store.edit('Import palette', draft => {
                draft.palettes.push(imported);
            });
        } catch (error) {
            window.alert(error instanceof Error ? error.message : String(error));
        }
    };
    return (
        <section className="palette-view">
            <header className="palette-view-header">
                <button onClick={onBack}>Back to canvas</button>
                <h2>Color palette</h2>
                <NameField
                    store={store}
                    label="Palette name"
                    value={palette.name}
                    rename={name =>
                        store.edit('Rename palette', draft => {
                            const item = draft.palettes.find(value => value.id === palette.id);
                            if (item) item.name = name;
                        })
                    }
                />
                <label>
                    Color space{' '}
                    <select value={space} onChange={event => setSpace(event.target.value as typeof space)}>
                        <option value="rgb">RGB</option>
                        <option value="hsl">HSL</option>
                        <option value="oklab">OKLab</option>
                        <option value="oklch">OKLCH</option>
                    </select>
                </label>
                <span>
                    {palette.colors.length} colors{colorsInUse ? ` · ${colorsInUse} in use` : ''}
                </span>
                {colorsInUse > 0 && (
                    <small role="status">
                        Some palette colors match shape fills or strokes. Editing them updates this palette only;
                        deleting it will leave those shapes unchanged.
                    </small>
                )}
                <div className="palette-actions">
                    <button onClick={() => addColor()}>
                        <Plus />
                        Add color
                    </button>
                    <button
                        onClick={() => {
                            const copy = structuredClone(palette);
                            copy.id = crypto.randomUUID();
                            copy.name += ' copy';
                            copy.colors.forEach(color => (color.id = crypto.randomUUID()));
                            store.edit('Duplicate palette', draft => {
                                draft.palettes.push(copy);
                            });
                        }}
                    >
                        <Copy />
                        Duplicate
                    </button>
                    <button onClick={() => picker.current?.click()}>
                        <Upload />
                        Import
                    </button>
                    <button
                        onClick={() =>
                            store.edit('Create PICO-8 palette', draft => {
                                draft.palettes.push(newPalette('PICO-8', pico8Colors));
                            })
                        }
                    >
                        PICO-8
                    </button>
                    <button
                        data-variant="danger"
                        title="Delete palette"
                        onClick={() => {
                            if (
                                (!colorsInUse ||
                                    window.confirm(
                                        'Some colors match shape fills or strokes. Delete this palette? Shapes will keep their current colors.',
                                    )) &&
                                window.confirm(`Delete palette “${palette.name}”?`)
                            )
                                store.edit('Delete palette', draft => {
                                    draft.palettes = draft.palettes.filter(item => item.id !== palette.id);
                                });
                        }}
                    >
                        <Trash2 />
                        Delete
                    </button>
                    <input
                        ref={picker}
                        hidden
                        type="file"
                        accept=".gpl,.json,.txt,.hex"
                        onChange={event => {
                            const file = event.target.files?.[0];
                            if (file) void importFile(file);
                            event.target.value = '';
                        }}
                    />
                </div>
            </header>
            <div className="palette-colors">
                {palette.colors.map((color, index) => {
                    // dragPosition is only set once a pointer drag passes its movement threshold.
                    const isDragged = dragPosition?.id === color.id;
                    const style: CSSProperties | undefined =
                        isDragged && dragPosition
                            ? {
                                  position: 'fixed',
                                  left: dragPosition.left,
                                  top: dragPosition.top,
                                  width: dragPosition.width,
                                  height: dragPosition.height,
                                  zIndex: 1000,
                                  pointerEvents: 'none',
                              }
                            : undefined;
                    return (
                        <div className="palette-color-slot" key={color.id}>
                            {isDragged && (
                                <div
                                    className="palette-color-placeholder"
                                    style={{height: dragPosition.height}}
                                    aria-hidden="true"
                                />
                            )}
                            <article
                                className={`palette-color${isDragged ? ' dragging' : ''}`}
                                data-palette-color-row={color.id}
                                style={style}
                            >
                                <button
                                    className="palette-drag-handle"
                                    type="button"
                                    aria-label={`Drag ${color.name || `color ${index + 1}`} to reorder`}
                                    title="Drag to reorder"
                                    onPointerDown={event => beginColorDrag(event, color.id)}
                                >
                                    <GripVertical />
                                </button>
                                <div
                                    className="palette-swatch"
                                    style={{background: normalizeColor(color.value)}}
                                    aria-label={`Color ${index + 1}: ${normalizeColor(color.value)}`}
                                />
                                <PaletteColorFields
                                    color={color}
                                    index={index}
                                    space={space}
                                    update={value =>
                                        editColor(color.id, item => {
                                            item.space = space;
                                            item.value = value;
                                        })
                                    }
                                    rename={value =>
                                        editColor(color.id, item => {
                                            item.name = value;
                                        })
                                    }
                                />
                                <button
                                    aria-label={`Duplicate ${color.name || `color ${index + 1}`}`}
                                    title="Duplicate color"
                                    onClick={() =>
                                        store.edit('Duplicate palette color', draft => {
                                            const item = draft.palettes.find(value => value.id === palette.id);
                                            const source = item?.colors.find(entry => entry.id === color.id);
                                            if (item && source)
                                                item.colors.splice(index + 1, 0, {
                                                    ...structuredClone(source),
                                                    id: crypto.randomUUID(),
                                                    name: `${source.name || `Color ${index + 1}`} copy`,
                                                });
                                        })
                                    }
                                >
                                    <Copy />
                                </button>
                                <button
                                    aria-label={`Delete ${color.name || `color ${index + 1}`}`}
                                    title="Delete color"
                                    onClick={() => {
                                        const hex = normalizeColor(color.value);
                                        const inUse = store
                                            .getSnapshot()
                                            .document.shapes.some(
                                                shape =>
                                                    ('fill' in shape.components &&
                                                        shape.components.fill.fill.color.toLowerCase() === hex) ||
                                                    ('stroke' in shape.components &&
                                                        shape.components.stroke.color.toLowerCase() === hex),
                                            );
                                        const message = inUse
                                            ? `${color.name || `Color ${index + 1}`} matches shape fills or strokes. Delete it from this palette? Shapes will keep their current colors.`
                                            : `Delete ${color.name || `Color ${index + 1}`}?`;
                                        if (window.confirm(message))
                                            store.edit('Delete palette color', draft => {
                                                const item = draft.palettes.find(value => value.id === palette.id);
                                                if (item)
                                                    item.colors = item.colors.filter(entry => entry.id !== color.id);
                                            });
                                    }}
                                >
                                    <Trash2 />
                                </button>
                            </article>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
