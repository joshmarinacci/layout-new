import {useEffect, useMemo, useRef, useState, type PointerEvent} from 'react';
import type {EditorStore} from './EditorStore';
import type {Point, Bounds} from './types';
import {useEditorStore} from './useEditorStore';
import {EditorDialog} from './EditorDialog';
import {drawPixelImage, fillImageRegion, paintImageRegion, readImageRegion, samplePixel} from './pixelImages';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker';
export function PixelImageEditor({store, imageId, source, onClose}: {store: EditorStore; imageId: string; source?: Bounds; onClose: () => void}) {
    const state = useEditorStore(store);
    const asset = state.document.images.find(item => item.id === imageId);
    const region = useMemo(() => source ?? {x: 0, y: 0, width: asset?.width ?? 1, height: asset?.height ?? 1}, [source, asset?.width, asset?.height]);
    const image = useMemo(() => asset ? readImageRegion(asset, region) : undefined, [asset, region]);
    const [tool, setTool] = useState<Tool>('pencil');
    const [color, setColor] = useState(0);
    const [zoom, setZoom] = useState(() => image ? Math.max(1, Math.min(24, Math.floor(480 / Math.max(image.width, image.height)))) : 16);
    const [grid, setGrid] = useState(true);
    const canvas = useRef<HTMLCanvasElement>(null);
    const stroke = useRef<{pointer: number; last: Point; color: number} | null>(null);
    useEffect(() => {
        const ctx = canvas.current?.getContext('2d');
        if (!ctx || !image) return;
        const bitmap = document.createElement('canvas'); bitmap.width = image.width; bitmap.height = image.height;
        const bitmapCtx = bitmap.getContext('2d');
        if (!bitmapCtx) return;
        drawPixelImage(bitmapCtx, image);
        ctx.clearRect(0, 0, image.width * zoom, image.height * zoom);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bitmap, 0, 0, image.width * zoom, image.height * zoom);
        if (grid && zoom >= 8) {
            ctx.strokeStyle = '#8888'; ctx.lineWidth = 1; ctx.beginPath();
            for (let x = 0; x <= image.width; x++) { ctx.moveTo(x * zoom + 0.5, 0); ctx.lineTo(x * zoom + 0.5, image.height * zoom); }
            for (let y = 0; y <= image.height; y++) { ctx.moveTo(0, y * zoom + 0.5); ctx.lineTo(image.width * zoom, y * zoom + 0.5); }
            ctx.stroke();
        }
    }, [image, zoom, grid]);
    useEffect(() => () => {
        if (stroke.current) { stroke.current = null; store.cancelTransaction(); }
    }, [store]);
    const finish = (cancel: boolean) => {
        const active = stroke.current;
        if (!active) return;
        stroke.current = null;
        if (cancel) store.cancelTransaction(); else store.commitTransaction();
        if (canvas.current?.hasPointerCapture(active.pointer)) canvas.current.releasePointerCapture(active.pointer);
    };
    const close = () => { finish(true); onClose(); };
    const point = (event: PointerEvent<HTMLCanvasElement>): Point => {
        const rect = event.currentTarget.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(image!.width - 1, Math.floor((event.clientX - rect.left) * image!.width / rect.width))),
            y: Math.max(0, Math.min(image!.height - 1, Math.floor((event.clientY - rect.top) * image!.height / rect.height))),
        };
    };
    const linked = state.document.shapes.filter(shape => shape.type === 'pixel-image' && shape.components.image.imageId === imageId).length;
    return <EditorDialog title={image ? `Edit ${image.name}` : 'Image unavailable'} onClose={close}>
        {!image ? <div><p>This image is no longer in the document.</p><button disabled={!state.canRedo} onClick={() => store.redo()}>Redo</button></div> : <div onKeyDown={event => {
            if (event.key === 'Escape' && stroke.current) { event.preventDefault(); event.stopPropagation(); finish(true); return; }
            if (event.target instanceof HTMLElement && event.target.matches('input, select, textarea')) return;
            if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
                event.preventDefault(); event.stopPropagation();
                if (!state.transactionActive) {
                    if (event.shiftKey || event.key.toLowerCase() === 'y') store.redo(); else store.undo();
                }
                return;
            }
            if (!event.metaKey && !event.ctrlKey && !event.altKey && !state.transactionActive) {
                const shortcuts: Record<string, Tool> = {b: 'pencil', e: 'eraser', g: 'fill', i: 'picker'};
                const next = shortcuts[event.key.toLowerCase()];
                if (next) { event.preventDefault(); setTool(next); }
            }
        }}>
            <p>{image.width} × {image.height} pixels · {linked} linked {linked === 1 ? 'shape' : 'shapes'}. Editing region ({region.x}, {region.y}) in the shared asset. Shapes showing these pixels update together.</p>
            <div className="pixel-tools" role="group" aria-label="Pixel tools">
                {(['pencil', 'eraser', 'fill', 'picker'] as const).map(value => <button key={value} disabled={state.transactionActive}
                    aria-pressed={tool === value} onClick={() => setTool(value)}>{value === 'picker' ? 'Color picker (I)' : value === 'fill' ? 'Flood fill (G)' : value === 'eraser' ? 'Eraser (E)' : 'Pencil (B)'}</button>)}
                <button disabled={!state.canUndo} onClick={() => store.undo()}>Undo</button>
                <button disabled={!state.canRedo} onClick={() => store.redo()}>Redo</button>
            </div>
            <div className="pixel-palette" role="group" aria-label="Palette colors">
                <button className="checkerboard" aria-label="Transparent" aria-pressed={color === -1} disabled={state.transactionActive} onClick={() => setColor(-1)}>×</button>
                {image.palette.map((entry, index) => <button key={index} style={{background: entry}} title={entry}
                    aria-label={`Color ${index + 1}: ${entry}`} aria-pressed={color === index} disabled={state.transactionActive} onClick={() => setColor(index)}/>)}
            </div>
            <div className="pixel-tools">
                <label>Zoom <select aria-label="Pixel zoom" value={zoom} disabled={state.transactionActive} onChange={event => setZoom(Number(event.target.value))}>
                    {[...new Set([1, 2, 4, 8, 12, 16, 24, 32, zoom])].filter(value => value * Math.max(image.width, image.height) <= 4096).sort((a, b) => a - b).map(value => <option key={value} value={value}>{value}×</option>)}
                </select></label>
                <label><input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)}/> Grid (8× and above)</label>
            </div>
            <div className="pixel-viewport">
                <canvas ref={canvas} className="pixel-canvas checkerboard" aria-label="Pixel editing canvas" tabIndex={0}
                    width={image.width * zoom} height={image.height * zoom}
                    onContextMenu={event => event.preventDefault()}
                    onPointerDown={event => {
                        if (stroke.current || store.getSnapshot().transactionActive) return;
                        if (event.button === 2) {
                            event.preventDefault();
                            setColor(samplePixel(image, point(event)) ?? -1);
                            setTool('pencil');
                            return;
                        }
                        if (event.button !== 0) return;
                        event.preventDefault(); event.currentTarget.focus();
                        const p = point(event);
                        if (tool === 'picker') { setColor(samplePixel(image, p)!); setTool('pencil'); return; }
                        if (tool === 'fill') { store.updatePixelImage(imageId, draft => fillImageRegion(draft, region, p, color)); return; }
                        store.beginTransaction(tool === 'eraser' ? 'Erase pixels' : 'Draw pixels');
                        stroke.current = {pointer: event.pointerId, last: p, color: tool === 'eraser' ? -1 : color};
                        event.currentTarget.setPointerCapture(event.pointerId);
                        store.updatePixelImage(imageId, draft => paintImageRegion(draft, region, p, p, stroke.current!.color));
                    }}
                    onPointerMove={event => {
                        const active = stroke.current;
                        if (!active || active.pointer !== event.pointerId) return;
                        const p = point(event);
                        store.updatePixelImage(imageId, draft => paintImageRegion(draft, region, active.last, p, active.color));
                        active.last = p;
                    }}
                    onPointerUp={event => {
                        const active = stroke.current;
                        if (!active || active.pointer !== event.pointerId) return;
                        const p = point(event);
                        store.updatePixelImage(imageId, draft => paintImageRegion(draft, region, active.last, p, active.color));
                        finish(false);
                    }}
                    onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)} onBlur={() => finish(true)}/>
            </div>
            <p>One stroke or fill is one undo step. Escape cancels an active stroke; otherwise it closes the editor. Undo/redo uses this document’s history.</p>
        </div>}
    </EditorDialog>;
}
