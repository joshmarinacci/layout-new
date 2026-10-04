import {useEffect, useRef, useState, type PointerEvent} from 'react';
import type {Bounds, Shape, CircleLikeComponent, PixelImageReferenceComponent, PixelImageData} from './types';
import type {EditorStore} from './EditorStore';
import {useEditorStore} from './useEditorStore';
import {drawPixelImage, resizeImageBounds} from './pixelImages';
import {circleContains, circleHandles, dragCircle} from './circleGeometry';

export function selectionBounds(shape: Shape): Bounds {
    switch (shape.type) {
        case 'pixel-image': return shape.components.rect.bounds;
        case 'rectangle': return shape.components.rect.bounds;
        case 'oval': return shape.components.oval.bounds;
        case 'circle': { const {center, radius} = shape.components.circle; return {x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2}; }
    }
}
export default function VisualEditor({store, onEditImage}: {store: EditorStore; onEditImage: (reference: PixelImageReferenceComponent) => void}) {
    const state = useEditorStore(store);
    const ref = useRef<HTMLCanvasElement>(null);
    const bitmaps = useRef(new WeakMap<PixelImageData, HTMLCanvasElement>());
    const gesture = useRef<{kind: 'move' | 'resize' | 'marquee'; ids: string[]; pointer: number; x: number; y: number; bounds: Bounds[]; circles?: Map<string, CircleLikeComponent>; additive?: boolean} | null>(null);
    const [marquee, setMarquee] = useState<Bounds | null>(null);
    useEffect(() => {
        const canvas = ref.current; const ctx = canvas?.getContext('2d'); if (!ctx || !canvas) return;
        ctx.fillStyle = '#333'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const images = new Map(state.document.images.map(image => {
            const cached = bitmaps.current.get(image);
            if (cached) return [image.id, cached];
            const bitmap = document.createElement('canvas');
            bitmap.width = image.width; bitmap.height = image.height;
            const context = bitmap.getContext('2d');
            if (context) drawPixelImage(context, image);
            bitmaps.current.set(image, bitmap);
            return [image.id, bitmap];
        }));
        ctx.imageSmoothingEnabled = false;
        state.document.shapes.forEach(shape => {
            const b = selectionBounds(shape);
            if (shape.type === 'pixel-image') {
                const bitmap = images.get(shape.components.image.imageId);
                if (bitmap) {
                    const region = shape.components.image.source ?? {x: 0, y: 0, width: bitmap.width, height: bitmap.height};
                    ctx.drawImage(bitmap, region.x, region.y, region.width, region.height, b.x, b.y, b.width, b.height);
                }
                // A faint boundary keeps a fully transparent new image discoverable.
                ctx.strokeStyle = '#657b83'; ctx.lineWidth = 1;
                ctx.strokeRect(b.x, b.y, b.width, b.height);
            } else {
                ctx.beginPath();
                if (shape.type === 'rectangle') ctx.rect(b.x, b.y, b.width, b.height);
                else ctx.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = shape.components.fill.fill.color; ctx.fill();
                ctx.lineWidth = shape.components.stroke.width; ctx.strokeStyle = shape.components.stroke.color;
                if (ctx.lineWidth > 0 && shape.components.stroke.width > 0) ctx.stroke();
            }
            if (state.selectedIds.includes(shape.id)) {
                ctx.strokeStyle = 'yellow'; ctx.lineWidth = 3; ctx.strokeRect(b.x, b.y, b.width, b.height);
                if (shape.id === state.selectedId && shape.type === 'circle') {
                    ctx.fillStyle = 'yellow';
                    circleHandles(shape.components.circle).forEach(handle => ctx.fillRect(handle.x - 5, handle.y - 5, 10, 10));
                }
                if (shape.id === state.selectedId && (shape.type === 'rectangle' || shape.type === 'pixel-image')) { ctx.fillStyle = 'yellow'; ctx.fillRect(b.x + b.width - 5, b.y + b.height - 5, 10, 10); }
            }
        });
        if (marquee) { ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#f0df00'; ctx.fillStyle = '#f0df0030'; ctx.lineWidth = 1; ctx.fillRect(marquee.x, marquee.y, marquee.width, marquee.height); ctx.strokeRect(marquee.x, marquee.y, marquee.width, marquee.height); ctx.restore(); }
    }, [state.document, state.selectedId, state.selectedIds, marquee]);
    useEffect(() => () => { if (gesture.current) { gesture.current = null; if (store.getSnapshot().transactionActive) store.cancelTransaction(); } }, [store]);
    const point = (event: PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return {x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height};
    };
    const finish = (cancel: boolean) => {
        if (!gesture.current) return;
        const current = gesture.current; const pointer = current.pointer; gesture.current = null;
        if (current.kind === 'marquee') setMarquee(null);
        else if (store.getSnapshot().transactionActive) { if (cancel) store.cancelTransaction(); else store.commitTransaction(); }
        if (ref.current?.hasPointerCapture(pointer)) ref.current.releasePointerCapture(pointer);
    };
    return <canvas aria-label="Drawing canvas" tabIndex={0} ref={ref} width={1024} height={1024} style={{touchAction: 'none'}}
        onDoubleClick={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            const p = {x: (event.clientX - rect.left) * event.currentTarget.width / rect.width,
                y: (event.clientY - rect.top) * event.currentTarget.height / rect.height};
            const shape = [...store.getSnapshot().document.shapes].reverse().find(s => {
                if (s.type === 'circle') return circleContains(s.components.circle, p);
                const b = selectionBounds(s);
                return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
            });
            if (shape?.type === 'pixel-image') { finish(false); onEditImage(shape.components.image); }
        }}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); finish(true); } }}
        onPointerDown={event => {
            if (event.button !== 0 || gesture.current) return;
            event.preventDefault();
            event.currentTarget.focus({preventScroll: true});
            if (store.getSnapshot().transactionActive) return;
            const p = point(event);
            const selected = state.document.shapes.find(s => s.id === state.selectedId);
            const selectedShapes = state.document.shapes.filter(shape => state.selectedIds.includes(shape.id));
            const circleHandle = selected?.type === 'circle' && circleHandles(selected.components.circle)
                .some(handle => Math.abs(p.x - handle.x) <= 10 && Math.abs(p.y - handle.y) <= 10);
            const selectedBounds = selected ? selectionBounds(selected) : null;
            const boxHandle = (selected?.type === 'rectangle' || selected?.type === 'pixel-image') && selectedBounds &&
                Math.abs(p.x - selectedBounds.x - selectedBounds.width) <= 10 && Math.abs(p.y - selectedBounds.y - selectedBounds.height) <= 10;
            const shape = circleHandle || boxHandle ? selected : [...state.document.shapes].reverse().find(s => {
                if (s.type === 'circle') return circleContains(s.components.circle, p);
                const b = selectionBounds(s);
                return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
            });
            if (shape && event.shiftKey) {
                store.toggleSelection(shape.id);
                return;
            }
            if (!shape) {
                if (!event.shiftKey) store.select(null);
                gesture.current = {kind: 'marquee', ids: event.shiftKey ? [...state.selectedIds] : [], pointer: event.pointerId, ...p, bounds: [], additive: event.shiftKey};
                setMarquee({x: p.x, y: p.y, width: 0, height: 0});
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
            }
            if (!state.selectedIds.includes(shape.id)) store.select(shape.id);
            if (shape.type === 'oval') return;
            const bounds = selectionBounds(shape);
            const resize = shape.type === 'circle' ? !!circleHandle
                : Math.abs(p.x - bounds.x - bounds.width) <= 10 && Math.abs(p.y - bounds.y - bounds.height) <= 10;
            const targets = !resize && state.selectedIds.includes(shape.id) && selectedShapes.length > 1 ? selectedShapes : [shape];
            store.beginTransaction(`${resize ? 'Resize' : 'Move'} ${targets.length > 1 ? 'selection' : shape.type}`);
            gesture.current = {kind: resize ? 'resize' : 'move', ids: targets.map(target => target.id), pointer: event.pointerId, ...p,
                bounds: targets.map(selectionBounds), circles: new Map(targets.flatMap(target => target.type === 'circle' ? [[target.id, target.components.circle] as const] : []))};
            event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
            const g = gesture.current; if (!g || g.pointer !== event.pointerId) return;
            const p = point(event); const dx = p.x - g.x, dy = p.y - g.y;
            if (g.kind === 'marquee') { setMarquee({x: Math.min(g.x, p.x), y: Math.min(g.y, p.y), width: Math.abs(dx), height: Math.abs(dy)}); return; }
            g.ids.forEach((id, index) => store.updateShape(id, shape => {
                const bounds = g.bounds[index];
                const circle = g.circles?.get(id);
                if (shape.type === 'circle' && circle) {
                    shape.components.circle = dragCircle(circle, g, p, g.kind === 'resize' && g.ids.length === 1);
                    return;
                }
                if (shape.type === 'rectangle' || shape.type === 'pixel-image') shape.components.rect.bounds = g.kind === 'resize'
                    ? resizeImageBounds(bounds, dx, dy, shape.type === 'pixel-image' && event.shiftKey)
                    : {...bounds, x: bounds.x + dx, y: bounds.y + dy};
            }));
        }}
        onPointerUp={event => {
            const g = gesture.current;
            if (!g || g.pointer !== event.pointerId) return;
            if (g.kind === 'marquee') {
                const p = point(event); const box = {x: Math.min(g.x, p.x), y: Math.min(g.y, p.y), width: Math.abs(p.x - g.x), height: Math.abs(p.y - g.y)};
                const hits = box.width < 2 && box.height < 2 ? [] : state.document.shapes.filter(shape => { const b = selectionBounds(shape); return b.x <= box.x + box.width && b.x + b.width >= box.x && b.y <= box.y + box.height && b.y + b.height >= box.y; }).map(shape => shape.id);
                store.setSelection(g.additive ? [...g.ids, ...hits] : hits); setMarquee(null);
            } else finish(false);
            gesture.current = null;
            if (ref.current?.hasPointerCapture(event.pointerId)) ref.current.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)} onBlur={() => finish(true)}/>;
}
