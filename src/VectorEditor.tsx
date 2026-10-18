import {useEffect, useRef, useState} from 'react';
import type {EditorStore} from './EditorStore';
import type {Point, VectorNetwork, VectorShape} from './types';
import {addPoint, connect, controls, joinCrossing, curveSegment, deleteParts, distance, faceContains, facesFor, mergePoints, movePoints, moveHandle, nearestSegment, regionPath, smoothPair, splitSegment} from './vectorNetworks';

type Tool = 'select' | 'pen' | 'curve' | 'split' | 'junction' | 'fill';
type Gesture = {pointer: number; start: Point; baseline: VectorNetwork; kind: 'move' | 'handle' | 'pen' | 'marquee'; ids: string[]; segment?: string; handle?: 'c1' | 'c2'; end?: Point; additive?: boolean};
export function useVectorEditor(store: EditorStore, shape: VectorShape | undefined, zoom: number, onClose: () => void) {
    const [tool, setTool] = useState<Tool>('select'), [color, setColor] = useState('#4f9fff'), [erase, setErase] = useState(false);
    const [colorText, setColorText] = useState('#4f9fff');
    const [points, setPoints] = useState<string[]>([]), [segments, setSegments] = useState<string[]>([]);
    const [pen, setPen] = useState<string | null>(null), [hover, setHover] = useState<Point | null>(null);
    const [message, setMessage] = useState(''), [, redraw] = useState(0);
    const [position, setPosition] = useState({x: 12, y: 12});
    const paletteDrag = useRef<{pointer: number; x: number; y: number; start: Point} | null>(null);
    const gesture = useRef<Gesture | null>(null);
    const penHandle = useRef<{id: string; point: Point} | null>(null);
    useEffect(() => { setTool(shape && !shape.components.network.points.length ? 'pen' : 'select'); setPoints([]); setSegments([]); setPen(null); setHover(null); setPosition({x: 12, y: 12}); penHandle.current = null; }, [shape?.id]);
    const local = (p: Point): Point => ({x: p.x - (shape?.components.network.origin.x ?? 0), y: p.y - (shape?.components.network.origin.y ?? 0)});
    const cancel = () => {
        const g = gesture.current; if (!g) return false;
        gesture.current = null;
        if (g.kind !== 'marquee' && store.getSnapshot().transactionActive) store.cancelTransaction();
        if (g.kind === 'pen') { setPen(null); penHandle.current = null; }
        redraw(x => x + 1); return true;
    };
    const close = () => { cancel(); onClose(); };
    const edit = (recipe: (n: VectorNetwork) => void) => {
        if (!shape || store.getSnapshot().transactionActive) return;
        try { setMessage(''); store.updateVector(shape.id, recipe); } catch (error) { setMessage(String(error)); }
    };
    const remove = () => { edit(n => deleteParts(n, points, segments)); setPoints([]); setSegments([]); setPen(null); };
    useEffect(() => () => { const g = gesture.current; gesture.current = null; if (g && g.kind !== 'marquee' && store.getSnapshot().transactionActive) store.cancelTransaction(); }, [store, shape?.id]);
    useEffect(() => { const blur = () => cancel(); window.addEventListener('blur', blur); return () => window.removeEventListener('blur', blur); });
    useEffect(() => {
        if (!shape) return;
        const keydown = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable)) return;
            const key = event.key.toLowerCase();
            if (key === 'escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!cancel()) { if (pen) setPen(null); else close(); } return; }
            if (store.getSnapshot().transactionActive) return;
            if (key === 'delete' || key === 'backspace') { event.preventDefault(); event.stopImmediatePropagation(); remove(); return; }
            if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(key)) {
                event.preventDefault(); event.stopImmediatePropagation(); setPen(null); if (event.shiftKey || key === 'y') store.redo(); else store.undo(); return;
            }
            if (!event.metaKey && !event.ctrlKey && !event.altKey) {
                const shortcuts: Record<string, Tool> = {v: 'select', p: 'pen', b: 'curve', g: 'fill'};
                if (shortcuts[key]) { event.preventDefault(); event.stopImmediatePropagation(); setTool(shortcuts[key]); setPen(null); }
            }
        };
        window.addEventListener('keydown', keydown, true); return () => window.removeEventListener('keydown', keydown, true);
    });
    const pointerDown = (world: Point, pointer: number, shift: boolean) => {
        if (!shape || gesture.current || store.getSnapshot().transactionActive) return;
        const n = shape.components.network, p = local(world), tolerance = 9 / zoom;
        const hit = n.points.find(q => distance(q, p) <= tolerance), edge = nearestSegment(n, p, tolerance);
        setMessage('');
        if (tool === 'fill') {
            const face = facesFor(n).find(f => faceContains(f, p));
            if (face) store.updateShape(shape.id, s => { if (s.type === 'vector') { const r = s.components.network.regions.find(r => r.key === face.key); if (r) r.fill = erase ? null : color; } });
            else setMessage('No enclosed region here. Close the boundary to fill it.');
            return;
        }
        if (tool === 'junction') {
            edit(d => { const id = joinCrossing(d, p, tolerance); if (id) setPoints([id]); else setMessage('Click a crossing of two segments to join them.'); }); return;
        }
        if (tool === 'split') { if (edge) edit(d => { const id = splitSegment(d, edge.segment, edge.t); setPoints([id]); setSegments([]); }); return; }
        if (tool === 'curve') { if (edge) { edit(d => curveSegment(d, edge.segment)); setSegments([edge.segment]); setTool('select'); } return; }
        if (tool === 'pen') {
            store.beginTransaction('Draw vector segment');
            let id = hit?.id ?? '', newSegment: string | null = null;
            try {
                store.updateVector(shape.id, d => {
                    if (!id) id = edge ? splitSegment(d, edge.segment, edge.t) : addPoint(d, p);
                    if (pen && d.points.some(p => p.id === pen)) {
                        newSegment = connect(d, pen, id);
                        if (newSegment && penHandle.current?.id === pen) d.segments.find(s => s.id === newSegment)!.c1 = {...penHandle.current.point};
                        const incoming = d.segments.find(s => s.b === pen && s.c2 && s.id !== newSegment);
                        if (newSegment && incoming?.c2 && penHandle.current?.id !== pen) { const start = d.points.find(p => p.id === pen)!; const s = d.segments.find(s => s.id === newSegment)!; s.c1 = {x: 2 * start.x - incoming.c2.x, y: 2 * start.y - incoming.c2.y}; }
                    }
                });
                setPoints([id]); setSegments(newSegment ? [newSegment] : []); setPen(hit && pen ? null : id);
                const current = store.getSnapshot().document.shapes.find(s => s.id === shape.id) as VectorShape;
                gesture.current = {pointer, start: p, baseline: current.components.network, kind: 'pen', ids: [id], segment: newSegment ?? undefined};
            } catch (error) { store.cancelTransaction(); setMessage(String(error)); }
            return;
        }
        // Handles take precedence over edges, but anchors take precedence over handles.
        if (!hit) for (const s of n.segments.filter(s => segments.includes(s.id) || points.includes(s.a) || points.includes(s.b))) for (const handle of ['c1', 'c2'] as const) {
            if (s[handle] && distance(s[handle], p) < tolerance) {
                store.beginTransaction('Move curve handle'); gesture.current = {pointer, start: p, baseline: n, kind: 'handle', ids: [], segment: s.id, handle}; return;
            }
        }
        if (hit) {
            const ids = shift ? points.includes(hit.id) ? points.filter(id => id !== hit.id) : [...points, hit.id] : points.includes(hit.id) ? points : [hit.id];
            setPoints(ids); if (!shift) setSegments([]);
            store.beginTransaction('Move vector points'); gesture.current = {pointer, start: p, baseline: n, kind: 'move', ids}; return;
        }
        if (edge) { setSegments(shift ? segments.includes(edge.segment) ? segments.filter(id => id !== edge.segment) : [...segments, edge.segment] : [edge.segment]); if (!shift) setPoints([]); return; }
        if (!shift) { setPoints([]); setSegments([]); }
        gesture.current = {pointer, start: p, end: p, baseline: n, kind: 'marquee', ids: shift ? points : [], additive: shift};
    };
    const pointerMove = (world: Point, pointer: number) => {
        const p = local(world); setHover(p);
        const g = gesture.current; if (!g || g.pointer !== pointer || !shape) return;
        if (g.kind === 'marquee') { g.end = p; redraw(x => x + 1); return; }
        try {
            store.updateVector(shape.id, n => {
                n.points = g.baseline.points.map(p => ({...p})); n.segments = g.baseline.segments.map(s => ({...s, c1: s.c1 && {...s.c1}, c2: s.c2 && {...s.c2}}));
                if (g.kind === 'move') movePoints(n, g.ids, {x: p.x - g.start.x, y: p.y - g.start.y});
                if (g.kind === 'handle') { const original = g.baseline.segments.find(s => s.id === g.segment)![g.handle!]!; moveHandle(n, g.segment!, g.handle!, {x: original.x + p.x - g.start.x, y: original.y + p.y - g.start.y}); }
                if (g.kind === 'pen' && distance(p, g.start) > 2 / zoom) penHandle.current = {id: g.ids[0], point: p};
                if (g.kind === 'pen' && g.segment && distance(p, g.start) > 2 / zoom) {
                    const end = n.points.find(q => q.id === g.ids[0])!;
                    n.segments.find(s => s.id === g.segment)!.c2 = {x: 2 * end.x - p.x, y: 2 * end.y - p.y};
                }
            }, g.baseline);
        } catch (error) { cancel(); setMessage(String(error)); }
    };
    const pointerUp = (world: Point, pointer: number) => {
        const g = gesture.current; if (!g || g.pointer !== pointer) return;
        pointerMove(world, pointer); if (!gesture.current) return;
        gesture.current = null;
        if (g.kind === 'marquee') {
            const p = local(world);
            setPoints([...new Set([...g.ids, ...g.baseline.points.filter(q => q.x >= Math.min(p.x, g.start.x) && q.x <= Math.max(p.x, g.start.x) && q.y >= Math.min(p.y, g.start.y) && q.y <= Math.max(p.y, g.start.y)).map(q => q.id)])]);
        } else if (store.getSnapshot().transactionActive) store.commitTransaction();
        redraw(x => x + 1);
    };
    const draw = (ctx: CanvasRenderingContext2D) => {
        if (!shape) return;
        const n = shape.components.network; ctx.save(); ctx.translate(n.origin.x, n.origin.y);
        ctx.lineWidth = 1 / zoom;
        if (tool === 'fill' && hover) { const face = facesFor(n).find(f => faceContains(f, hover)); if (face) { regionPath(n, face.loops, ctx); ctx.fillStyle = erase ? '#ff776655' : color + '66'; ctx.fill('evenodd'); ctx.strokeStyle = '#ffffff'; ctx.stroke(); } }
        for (const s of n.segments) {
            const c = controls(n, s); ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); ctx.bezierCurveTo(c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y); ctx.strokeStyle = segments.includes(s.id) ? '#ffe168' : '#69c8ff'; ctx.lineWidth = (segments.includes(s.id) ? 3 : 1) / zoom; ctx.stroke();
            if (segments.includes(s.id) || points.includes(s.a) || points.includes(s.b)) for (const [handle, end] of [[s.c1, c[0]], [s.c2, c[3]]]) if (handle && end) {
                ctx.beginPath(); ctx.moveTo(end.x, end.y); ctx.lineTo(handle.x, handle.y); ctx.lineWidth = 1 / zoom; ctx.strokeStyle = '#bbbbbb'; ctx.stroke();
                ctx.beginPath(); ctx.arc(handle.x, handle.y, 4 / zoom, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
            }
        }
        for (const p of n.points) { ctx.fillStyle = points.includes(p.id) ? '#ffe168' : '#ffffff'; ctx.fillRect(p.x - 4 / zoom, p.y - 4 / zoom, 8 / zoom, 8 / zoom); }
        if (pen && hover && tool === 'pen') { const p = n.points.find(p => p.id === pen); if (p) { ctx.beginPath(); ctx.setLineDash([4 / zoom, 4 / zoom]); ctx.moveTo(p.x, p.y); ctx.lineTo(hover.x, hover.y); ctx.strokeStyle = '#69c8ff'; ctx.stroke(); ctx.setLineDash([]); } }
        const g = gesture.current;
        if (g?.kind === 'marquee' && g.end) { ctx.strokeStyle = '#ffe168'; ctx.strokeRect(g.start.x, g.start.y, g.end.x - g.start.x, g.end.y - g.start.y); }
        ctx.restore();
    };
    const n = shape?.components.network;
    const livePoints = points.filter(id => n?.points.some(p => p.id === id)), liveSegments = segments.filter(id => n?.segments.some(s => s.id === id));
    const busy = store.getSnapshot().transactionActive;
    const tips: Record<Tool, string> = {select: 'Select points or edges. Shift-click adds to selection. Drag points or handles; drag empty space to select points.', pen: 'Click to draw. Drag a new endpoint for a curve. Click an existing point to close or join. New path starts another branch or island.', curve: 'Click a straight segment to bend it, then drag its handles.', split: 'Click a segment to insert a point without changing its curve.', junction: 'Click an intersection to join its two paths at an editable point.', fill: 'Hover an enclosed region, then click to fill it. Choose No fill to make a hole.'};
    const palette = shape && <div className="vector-palette" style={{left: position.x, top: position.y}} aria-label="Vector editor">
        <header onPointerDown={event => { if ((event.target as HTMLElement).closest('button')) return; paletteDrag.current = {pointer: event.pointerId, x: event.clientX, y: event.clientY, start: position}; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { const d = paletteDrag.current; if (d?.pointer === event.pointerId) { const panel = event.currentTarget.parentElement!, parent = panel.offsetParent as HTMLElement; setPosition({x: Math.max(0, Math.min(parent.clientWidth - panel.offsetWidth, d.start.x + event.clientX - d.x)), y: Math.max(0, Math.min(parent.clientHeight - panel.offsetHeight, d.start.y + event.clientY - d.y))}); } }} onPointerUp={() => { paletteDrag.current = null; }} onPointerCancel={() => { paletteDrag.current = null; }}><strong>Editing {shape.name}</strong><button onClick={close}>Done</button></header>
        <div className="vector-tools" role="group" aria-label="Vector tools">{(['select', 'pen', 'curve', 'split', 'junction', 'fill'] as Tool[]).map(t => <button key={t} aria-pressed={tool === t} disabled={busy} onClick={() => { setTool(t); setPen(null); }}>{({select: 'Select (V)', pen: 'Pen (P)', curve: 'Curve (B)', split: 'Insert point', junction: 'Join crossing', fill: 'Fill (G)'})[t]}</button>)}</div>
        <p>{tips[tool]}</p>
        <div className="vector-tools">
            <button disabled={busy} onClick={() => { setPen(null); setPoints([]); setSegments([]); setTool('pen'); }}>New path</button>
            <button disabled={busy || livePoints.length !== 2} onClick={() => edit(d => { connect(d, livePoints[0], livePoints[1]); })}>Connect points</button>
            <button disabled={busy || livePoints.length < 2} onClick={() => { edit(d => mergePoints(d, livePoints)); setPoints(livePoints.slice(0, 1)); }}>Merge points</button>
            <button disabled={busy || !liveSegments.length} onClick={() => edit(d => { for (const s of d.segments.filter(s => liveSegments.includes(s.id))) { s.c1 = null; s.c2 = null; } d.smooth = d.smooth.filter(pair => !pair.segments.some(id => liveSegments.includes(id))); })}>Straighten</button>
            <button disabled={busy || livePoints.length !== 1 || (n?.segments.filter(s => (s.a === livePoints[0] || s.b === livePoints[0]) && (!liveSegments.length || liveSegments.includes(s.id))).length !== 2)} onClick={() => edit(d => smoothPair(d, livePoints[0], liveSegments.length ? liveSegments : d.segments.filter(s => s.a === livePoints[0] || s.b === livePoints[0]).map(s => s.id)))}>Smooth pair</button>
            <button disabled={busy || !livePoints.length} onClick={() => edit(d => { d.smooth = d.smooth.filter(pair => !livePoints.includes(pair.point) || liveSegments.length > 0 && !pair.segments.some(id => liveSegments.includes(id))); })}>Corner</button>
            <button disabled={busy || !livePoints.length && !liveSegments.length} onClick={remove}>Delete selected</button>
        </div>
        <div className="vector-tools"><label>Fill <input aria-label="Region fill color" type="color" value={color} onChange={e => { setColor(e.target.value); setColorText(e.target.value); setErase(false); }}/></label><input aria-label="Region fill hex" className="vector-hex" value={colorText} onChange={e => { setColorText(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { setColor(e.target.value); setErase(false); } }} onBlur={() => setColorText(color)} maxLength={7}/><label><input type="checkbox" checked={erase} onChange={e => setErase(e.target.checked)}/>No fill</label>
            <label>Stroke <input aria-label="Vector stroke color" type="color" value={shape.components.stroke.color} disabled={busy} onChange={e => store.updateShape(shape.id, s => { if (s.type === 'vector') s.components.stroke.color = e.target.value; })}/></label>
            <label>Width <input aria-label="Vector stroke width" type="number" min="0" step="0.5" value={shape.components.stroke.width} disabled={busy} onChange={e => { const width = e.target.valueAsNumber; if (Number.isFinite(width) && width >= 0) store.updateShape(shape.id, s => { if (s.type === 'vector') s.components.stroke.width = width; }); }}/></label>
        </div>
        <div className="vector-tools"><button disabled={!store.getSnapshot().canUndo} onClick={() => { setPen(null); store.undo(); }}>Undo</button><button disabled={!store.getSnapshot().canRedo} onClick={() => { setPen(null); store.redo(); }}>Redo</button><span>{livePoints.length} points · {liveSegments.length} segments selected</span></div>
        {message && <p role="alert">{message}</p>}
    </div>;
    return {palette, pointerDown, pointerMove, pointerUp, cancel, draw, active: (pointer: number) => gesture.current?.pointer === pointer, hover};
}
