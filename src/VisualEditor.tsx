import {useEffect, useRef, type PointerEvent} from 'react';
import type {Bounds, Shape, CircleLikeComponent} from './types';
import type {EditorStore} from './EditorStore';
import {useEditorStore} from './useEditorStore';
import {circleContains, circleHandles, dragCircle} from './circleGeometry';

export function selectionBounds(shape: Shape): Bounds {
    switch (shape.type) {
        case 'rectangle': return shape.components.rect.bounds;
        case 'oval': return shape.components.oval.bounds;
        case 'circle': { const {center, radius} = shape.components.circle; return {x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2}; }
    }
}
export default function VisualEditor({store}: {store: EditorStore}) {
    const state = useEditorStore(store);
    const ref = useRef<HTMLCanvasElement>(null);
    const gesture = useRef<{id: string; pointer: number; x: number; y: number; bounds: Bounds; circle?: CircleLikeComponent; resize: boolean} | null>(null);
    useEffect(() => {
        const canvas = ref.current; const ctx = canvas?.getContext('2d'); if (!ctx || !canvas) return;
        ctx.fillStyle = '#333'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        state.document.shapes.forEach(shape => {
            const b = selectionBounds(shape);
            ctx.beginPath();
            if (shape.type === 'rectangle') ctx.rect(b.x, b.y, b.width, b.height);
            else ctx.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
            ctx.fillStyle = shape.components.fill.fill.color; ctx.fill();
            ctx.lineWidth = shape.components.stroke.width; ctx.strokeStyle = shape.components.stroke.color;
            if (ctx.lineWidth > 0 && shape.components.stroke.width > 0) ctx.stroke();
            if (shape.id === state.selectedId) {
                ctx.strokeStyle = 'yellow'; ctx.lineWidth = 3; ctx.strokeRect(b.x, b.y, b.width, b.height);
                if (shape.type === 'circle') {
                    ctx.fillStyle = 'yellow';
                    circleHandles(shape.components.circle).forEach(handle => ctx.fillRect(handle.x - 5, handle.y - 5, 10, 10));
                }
                if (shape.type === 'rectangle') { ctx.fillStyle = 'yellow'; ctx.fillRect(b.x + b.width - 5, b.y + b.height - 5, 10, 10); }
            }
        });
    }, [state.document, state.selectedId]);
    useEffect(() => () => { if (gesture.current) { gesture.current = null; store.cancelTransaction(); } }, [store]);
    const point = (event: PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return {x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height};
    };
    const finish = (cancel: boolean) => {
        if (!gesture.current) return;
        const pointer = gesture.current.pointer; gesture.current = null;
        if (cancel) store.cancelTransaction(); else store.commitTransaction();
        if (ref.current?.hasPointerCapture(pointer)) ref.current.releasePointerCapture(pointer);
    };
    return <canvas aria-label="Drawing canvas" tabIndex={0} ref={ref} width={1024} height={1024} style={{touchAction: 'none'}}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); finish(true); } }}
        onPointerDown={event => {
            if (event.button !== 0 || gesture.current) return;
            event.preventDefault();
            event.currentTarget.focus({preventScroll: true});
            if (store.getSnapshot().transactionActive) return;
            const p = point(event);
            const selected = state.document.shapes.find(s => s.id === state.selectedId);
            const circleHandle = selected?.type === 'circle' && circleHandles(selected.components.circle)
                .some(handle => Math.abs(p.x - handle.x) <= 10 && Math.abs(p.y - handle.y) <= 10);
            const shape = circleHandle ? selected : [...state.document.shapes].reverse().find(s => {
                if (s.type === 'circle') return circleContains(s.components.circle, p);
                const b = selectionBounds(s);
                return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
            });
            store.select(shape?.id ?? null);
            if (!shape || shape.type === 'oval') return;
            const bounds = selectionBounds(shape);
            const resize = shape.type === 'circle' ? !!circleHandle
                : Math.abs(p.x - bounds.x - bounds.width) <= 10 && Math.abs(p.y - bounds.y - bounds.height) <= 10;
            store.beginTransaction(`${resize ? 'Resize' : 'Move'} ${shape.type}`);
            gesture.current = {id: shape.id, pointer: event.pointerId, ...p, bounds, resize,
                circle: shape.type === 'circle' ? shape.components.circle : undefined};
            event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
            const g = gesture.current; if (!g || g.pointer !== event.pointerId) return;
            const p = point(event); const dx = p.x - g.x, dy = p.y - g.y;
            store.updateShape(g.id, shape => {
                if (shape.type === 'circle' && g.circle) {
                    shape.components.circle = dragCircle(g.circle, g, p, g.resize);
                    return;
                }
                if (shape.type !== 'rectangle') return;
                shape.components.rect.bounds = g.resize
                    ? {...g.bounds, width: Math.max(1, g.bounds.width + dx), height: Math.max(1, g.bounds.height + dy)}
                    : {...g.bounds, x: g.bounds.x + dx, y: g.bounds.y + dy};
            });
        }}
        onPointerUp={event => { if (gesture.current?.pointer === event.pointerId) finish(false); }}
        onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)} onBlur={() => finish(true)}/>;
}
