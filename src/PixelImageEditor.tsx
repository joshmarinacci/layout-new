import {useEffect, useMemo, useRef, useState, type PointerEvent} from 'react';
import type {EditorStore} from './EditorStore';
import type {Bounds, Point} from './types';
import {useEditorStore} from './useEditorStore';
import {fillImageRegion, paintImageRegion, readImageRegion, samplePixel} from './pixelImages';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'move';
function shiftImageRegion(image: import('./types').PixelImageData, region: Bounds, pixels: number[], dx: number, dy: number) {
    const width = region.width, height = region.height;
    const shiftX = ((dx % width) + width) % width, shiftY = ((dy % height) + height) % height;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const source = ((y - shiftY + height) % height) * width + ((x - shiftX + width) % width);
        image.pixels[(region.y + y) * image.width + region.x + x] = pixels[source];
    }
}
export interface PixelEditorController {
    imageId: string;
    image: ReturnType<typeof readImageRegion>;
    grid: boolean;
    pointerDown: (point: Point, pointer: number) => void;
    pointerMove: (point: Point, pointer: number) => void;
    pointerUp: (point: Point, pointer: number) => void;
    cancel: () => void;
    isActive: (pointer: number) => boolean;
    sample: (point: Point) => void;
    setTool: (tool: Tool) => void;
}

export function PixelImageEditor({store, imageId, source, initialPosition, imageScreenRect, onController, onClose}: {store: EditorStore; imageId: string; source?: Bounds; initialPosition?: Point; imageScreenRect?: Bounds; onController: (controller: PixelEditorController | null) => void; onClose: () => void}) {
    const state = useEditorStore(store);
    const asset = state.document.images.find(item => item.id === imageId);
    const region = useMemo(() => source ?? {x: 0, y: 0, width: asset?.width ?? 1, height: asset?.height ?? 1}, [source, asset?.width, asset?.height]);
    const image = useMemo(() => asset ? readImageRegion(asset, region) : undefined, [asset, region]);
    const [tool, setTool] = useState<Tool>('pencil');
    const [color, setColor] = useState(0);
    const [palettePosition, setPalettePosition] = useState(() => initialPosition ?? {x: 12, y: 12});
    const stroke = useRef<{pointer: number; tool: 'pencil' | 'eraser'; last: Point; color: number} | {pointer: number; tool: 'move'; origin: Point; pixels: number[]} | null>(null);
    const paletteDrag = useRef<{pointer: number; x: number; y: number; left: number; top: number} | null>(null);
    const palette = useRef<HTMLDivElement>(null);
    const options = useRef({tool, color, image, region});
    options.current = {tool, color, image, region};
    const controller = useRef<PixelEditorController | null>(null);
    if (!controller.current) controller.current = {
        imageId,
        get image() { return options.current.image!; },
        get grid() { return true; },
        pointerDown: (point, pointer) => {
            const current = options.current;
            if (!current.image || stroke.current || store.getSnapshot().transactionActive) return;
            const p = {x: Math.max(0, Math.min(current.image.width - 1, Math.floor(point.x))), y: Math.max(0, Math.min(current.image.height - 1, Math.floor(point.y)))};
            if (current.tool === 'picker') { setColor(samplePixel(current.image, p)!); setTool('pencil'); return; }
            if (current.tool === 'fill') { store.updatePixelImage(imageId, draft => fillImageRegion(draft, current.region, p, current.color)); return; }
            if (current.tool === 'move') {
                store.beginTransaction('Move pixels');
                stroke.current = {pointer, tool: 'move', origin: point, pixels: [...current.image.pixels]};
                return;
            }
            store.beginTransaction(current.tool === 'eraser' ? 'Erase pixels' : 'Draw pixels');
            const strokeColor = current.tool === 'eraser' ? -1 : current.color;
            stroke.current = {pointer, tool: current.tool, last: p, color: strokeColor};
            store.updatePixelImage(imageId, draft => paintImageRegion(draft, current.region, p, p, strokeColor));
        },
        pointerMove: (point, pointer) => {
            const active = stroke.current; const current = options.current;
            if (!active || active.pointer !== pointer || !current.image) return;
            if (active.tool === 'move') {
                const dx = Math.round(point.x - active.origin.x), dy = Math.round(point.y - active.origin.y);
                store.updatePixelImage(imageId, draft => shiftImageRegion(draft, current.region, active.pixels, dx, dy));
                return;
            }
            const p = {x: Math.max(0, Math.min(current.image.width - 1, Math.floor(point.x))), y: Math.max(0, Math.min(current.image.height - 1, Math.floor(point.y)))};
            store.updatePixelImage(imageId, draft => paintImageRegion(draft, current.region, active.last, p, active.color)); active.last = p;
        },
        pointerUp: (point, pointer) => {
            const active = stroke.current; const current = options.current;
            if (!active || active.pointer !== pointer || !current.image) return;
            if (active.tool === 'move') {
                const dx = Math.round(point.x - active.origin.x), dy = Math.round(point.y - active.origin.y);
                store.updatePixelImage(imageId, draft => shiftImageRegion(draft, current.region, active.pixels, dx, dy));
                stroke.current = null; store.commitTransaction(); return;
            }
            const p = {x: Math.max(0, Math.min(current.image.width - 1, Math.floor(point.x))), y: Math.max(0, Math.min(current.image.height - 1, Math.floor(point.y)))};
            store.updatePixelImage(imageId, draft => paintImageRegion(draft, current.region, active.last, p, active.color));
            stroke.current = null; store.commitTransaction();
        },
        cancel: () => { if (stroke.current) { stroke.current = null; store.cancelTransaction(); } },
        isActive: pointer => stroke.current?.pointer === pointer,
        sample: point => { const current = options.current; if (current.image) { const p = {x: Math.max(0, Math.min(current.image.width - 1, Math.floor(point.x))), y: Math.max(0, Math.min(current.image.height - 1, Math.floor(point.y)))}; setColor(samplePixel(current.image, p) ?? -1); setTool('pencil'); } },
        setTool,
    };
    useEffect(() => { onController(controller.current); return () => { controller.current?.cancel(); onController(null); }; }, [onController, store]);
    useEffect(() => () => { if (stroke.current) { stroke.current = null; store.cancelTransaction(); } }, [store]);
    const close = () => { controller.current?.cancel(); onClose(); };
    useEffect(() => {
        const element = palette.current;
        const bounds = element?.parentElement?.getBoundingClientRect();
        if (!bounds) return;
        const width = element?.offsetWidth ?? 0;
        const height = element?.offsetHeight ?? 0;
        setPalettePosition(position => {
            const maxX = Math.max(0, bounds.width - width);
            const maxY = Math.max(0, bounds.height - height);
            let x = Math.max(0, Math.min(maxX, position.x));
            let y = Math.max(0, Math.min(maxY, position.y));
            if (imageScreenRect) {
                const gap = 8;
                const above = imageScreenRect.y - height - gap;
                const below = imageScreenRect.y + imageScreenRect.height + gap;
                y = above >= 0 ? above : Math.min(maxY, below);
                x = Math.max(0, Math.min(maxX, imageScreenRect.x));
                const overlapsX = x < imageScreenRect.x + imageScreenRect.width && x + width > imageScreenRect.x;
                const overlapsY = y < imageScreenRect.y + imageScreenRect.height && y + height > imageScreenRect.y;
                if (overlapsX && overlapsY) y = Math.max(0, Math.min(maxY, imageScreenRect.y - height - gap));
            }
            return {x, y};
        });
    }, [imageScreenRect]);
    const movePalette = (event: PointerEvent<HTMLElement>) => {
        const drag = paletteDrag.current;
        if (!drag || drag.pointer !== event.pointerId) return;
        const bounds = palette.current?.parentElement?.getBoundingClientRect();
        if (!bounds) return;
        const maxX = Math.max(0, bounds.width - (palette.current?.offsetWidth ?? 0));
        const maxY = Math.max(0, bounds.height - (palette.current?.offsetHeight ?? 0));
        setPalettePosition({x: Math.max(0, Math.min(maxX, drag.left + event.clientX - drag.x)), y: Math.max(0, Math.min(maxY, drag.top + event.clientY - drag.y))});
    };
    const stopPaletteDrag = (event: PointerEvent<HTMLElement>) => {
        if (paletteDrag.current?.pointer !== event.pointerId) return;
        paletteDrag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const linked = state.document.shapes.filter(shape => shape.type === 'pixel-image' && shape.components.image.imageId === imageId).length;
    if (!image) return <div className="pixel-floating-palette"><strong>Image unavailable</strong><button onClick={close}>Close</button></div>;
    return <div ref={palette} className="pixel-floating-palette" style={{left: palettePosition.x, top: palettePosition.y}} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); controller.current?.cancel(); close(); return; }
        if (event.target instanceof HTMLElement && event.target.matches('input, select, textarea')) return;
        if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
            event.preventDefault(); if (!state.transactionActive) { if (event.shiftKey || event.key.toLowerCase() === 'y') store.redo(); else store.undo(); } return;
        }
        if (!event.metaKey && !event.ctrlKey && !event.altKey && !state.transactionActive) {
            const shortcuts: Record<string, Tool> = {b: 'pencil', e: 'eraser', g: 'fill', i: 'picker', m: 'move'};
            const next = shortcuts[event.key.toLowerCase()]; if (next) { event.preventDefault(); setTool(next); }
        }
    }}>
        <header className="pixel-palette-title" onPointerDown={event => {
            if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
            event.preventDefault();
            paletteDrag.current = {pointer: event.pointerId, x: event.clientX, y: event.clientY, left: palettePosition.x, top: palettePosition.y};
            event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={movePalette} onPointerUp={stopPaletteDrag} onPointerCancel={stopPaletteDrag}>
            <strong>{`Editing ${image.name}`}</strong><button aria-label="Exit pixel editing" title="Exit pixel editing" onClick={close}>×</button>
        </header>
        <p>{image.width} × {image.height} px · {linked} linked {linked === 1 ? 'shape' : 'shapes'} · Click pixels to edit; canvas zoom applies.</p>
        <div className="pixel-tools" role="group" aria-label="Pixel tools">
            {(['pencil', 'eraser', 'fill', 'picker', 'move'] as const).map(value => <button key={value} disabled={state.transactionActive} aria-pressed={tool === value} onClick={() => setTool(value)}>{value === 'picker' ? 'Picker (I)' : value === 'fill' ? 'Fill (G)' : value === 'eraser' ? 'Eraser (E)' : value === 'move' ? 'Move (M)' : 'Pencil (B)'}</button>)}
            <button disabled={!state.canUndo} onClick={() => store.undo()}>Undo</button><button disabled={!state.canRedo} onClick={() => store.redo()}>Redo</button>
        </div>
        <div className="pixel-palette" role="group" aria-label="Palette colors">
            <button className="checkerboard" aria-label="Transparent" aria-pressed={color === -1} disabled={state.transactionActive} onClick={() => setColor(-1)}>×</button>
            {image.palette.map((entry, index) => <button key={index} style={{background: entry}} title={entry} aria-label={`Color ${index + 1}: ${entry}`} aria-pressed={color === index} disabled={state.transactionActive} onClick={() => setColor(index)}/>)}
        </div>
    </div>;
}
