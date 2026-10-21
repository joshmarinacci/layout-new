import {
    type MouseEvent,
    type PointerEvent,
    useEffect,
    useRef,
    useState
} from 'react';
import {
    circleContains,
    circleHandles,
    dragCircle
} from './shapes/circleGeometry';
import type {EditorStore} from './EditorStore';
import type {PixelEditorController} from './shapes/PixelImageEditor';
import {drawPixelImage, resizeImageBounds} from './shapes/pixelImages';
import type {
    Bounds,
    CircleLikeComponent,
    PixelImageData,
    PixelImageReferenceComponent,
    Shape,
    VectorNetwork
} from './types';
import {useEditorStore} from './useEditorStore';
import {useVectorEditor} from './shapes/VectorEditor';
import {
    drawVector,
    resizeVector,
    vectorBounds,
    vectorHit
} from './shapes/vectorNetworks';

export function selectionBounds(shape: Shape): Bounds {
    switch (shape.type) {
        case 'vector':
            return vectorBounds(shape.components.network);
        case 'pixel-image':
            return shape.components.rect.bounds;
        case 'repeating-image':
            return shape.components.rect.bounds;
        case 'rectangle':
            return shape.components.rect.bounds;
        case 'oval':
            return shape.components.oval.bounds;
        case 'circle': {
            const {center, radius} = shape.components.circle;
            return {
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2
            };
        }
    }
}

const clampZoom = (zoom: number) => Math.max(0.25, Math.min(4, zoom));
export default function VisualEditor({
                                         store,
                                         onEditImage,
                                         onShapeContextMenu,
                                         onCanvasContextMenu,
                                         zoom,
                                         onZoomChange,
                                         pixelEditor,
                                         vectorId,
                                         onEditVector
                                     }: {
    store: EditorStore;
    onEditImage: (reference: PixelImageReferenceComponent, position: {
        x: number;
        y: number
    }, imageRect: Bounds) => void;
    onShapeContextMenu: (event: MouseEvent<HTMLCanvasElement>, shape: Shape) => void;
    onCanvasContextMenu: (event: MouseEvent<HTMLCanvasElement>) => void;
    zoom: number;
    onZoomChange: (zoom: number) => void;
    pixelEditor?: PixelEditorController | null;
    vectorId: string | null;
    onEditVector: (id: string | null) => void
}) {
    const state = useEditorStore(store);
    const vectorShape = state.document.shapes.find(s => s.id === vectorId && s.type === 'vector' && s.pageId === state.selectedPageId);
    const vector = useVectorEditor(store, vectorShape?.type === 'vector' ? vectorShape : undefined, zoom, () => onEditVector(null));
    const ref = useRef<HTMLCanvasElement>(null);
    const viewport = useRef<HTMLDivElement>(null);
    const spacePan = useRef(false);
    const bitmaps = useRef(new WeakMap<PixelImageData, HTMLCanvasElement>());
    const pixelTargetId = useRef<string | null>(null);
    const gesture = useRef<{
        kind: 'move' | 'resize' | 'marquee' | 'pan';
        ids: string[];
        pointer: number;
        x: number;
        y: number;
        bounds: Bounds[];
        vectors?: Map<string, VectorNetwork>;
        circles?: Map<string, CircleLikeComponent>;
        additive?: boolean;
        scrollX?: number;
        scrollY?: number;
        duplicate?: boolean;
        duplicateStarted?: boolean
    } | null>(null);
    const [marquee, setMarquee] = useState<Bounds | null>(null);
    useEffect(() => {
        const canvas = ref.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;
        const pixelRatio = window.devicePixelRatio || 1;
        const resolution = 1024 * zoom * pixelRatio;
        if (canvas.width !== resolution || canvas.height !== resolution) {
            canvas.width = resolution;
            canvas.height = resolution;
        }
        ctx.setTransform(zoom * pixelRatio, 0, 0, zoom * pixelRatio, 0, 0);
        ctx.clearRect(0, 0, 1024, 1024);
        const images = new Map(state.document.images.map(image => {
            const cached = bitmaps.current.get(image);
            if (cached) return [image.id, cached];
            const bitmap = document.createElement('canvas');
            bitmap.width = image.width;
            bitmap.height = image.height;
            const context = bitmap.getContext('2d');
            if (context) drawPixelImage(context, image);
            bitmaps.current.set(image, bitmap);
            return [image.id, bitmap];
        }));
        ctx.imageSmoothingEnabled = false;
        state.document.shapes.filter(shape => shape.pageId === state.selectedPageId).forEach(shape => {
            const b = selectionBounds(shape);
            if (shape.type === 'vector') {
                drawVector(ctx, shape);
            } else if (shape.type === 'pixel-image') {
                const bitmap = images.get(shape.components.image.imageId);
                if (bitmap) {
                    const region = shape.components.image.source ?? {
                        x: 0,
                        y: 0,
                        width: bitmap.width,
                        height: bitmap.height
                    };
                    ctx.drawImage(bitmap, region.x, region.y, region.width, region.height, b.x, b.y, b.width, b.height);
                }
                // A faint boundary keeps a fully transparent new image discoverable.
                ctx.strokeStyle = '#657b83';
                ctx.lineWidth = 1;
                ctx.strokeRect(b.x, b.y, b.width, b.height);
            } else if (shape.type === 'repeating-image') {
                const bitmap = images.get(shape.components.image.imageId);
                if (bitmap) {
                    const region = shape.components.image.source;
                    const tile = document.createElement('canvas');
                    tile.width = shape.components.pattern.width;
                    tile.height = shape.components.pattern.height;
                    const tileCtx = tile.getContext('2d');
                    if (tileCtx) {
                        tileCtx.imageSmoothingEnabled = false;
                        tileCtx.drawImage(bitmap, region.x, region.y, region.width, region.height, 0, 0, tile.width, tile.height);
                        const pattern = ctx.createPattern(tile, 'repeat');
                        if (pattern) {
                            pattern.setTransform(new DOMMatrix().translate(b.x, b.y));
                            ctx.save();
                            ctx.beginPath();
                            ctx.rect(b.x, b.y, b.width, b.height);
                            ctx.clip();
                            ctx.fillStyle = pattern;
                            ctx.fillRect(b.x, b.y, b.width, b.height);
                            ctx.restore();
                        }
                    }
                }
                ctx.strokeStyle = '#657b83';
                ctx.lineWidth = 1;
                ctx.strokeRect(b.x, b.y, b.width, b.height);
            } else {
                ctx.beginPath();
                if (shape.type === 'rectangle') ctx.rect(b.x, b.y, b.width, b.height);
                else ctx.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = shape.components.fill.fill.color;
                ctx.fill();
                ctx.lineWidth = shape.components.stroke.width;
                ctx.strokeStyle = shape.components.stroke.color;
                if (ctx.lineWidth > 0 && shape.components.stroke.width > 0) ctx.stroke();
            }
            if (state.selectedIds.includes(shape.id) && !pixelEditor && !vectorShape) {
                ctx.strokeStyle = 'yellow';
                ctx.lineWidth = 2 / zoom;
                ctx.strokeRect(b.x, b.y, b.width, b.height);
                if (shape.id === state.selectedId && shape.type === 'circle') {
                    ctx.fillStyle = '#1684e8';
                    circleHandles(shape.components.circle).forEach(handle => ctx.fillRect(handle.x - 5 / zoom, handle.y - 5 / zoom, 10 / zoom, 10 / zoom));
                }
                if (shape.id === state.selectedId && (shape.type === 'vector' || shape.type === 'rectangle' || shape.type === 'pixel-image' || shape.type === 'repeating-image')) {
                    ctx.fillStyle = 'yellow';
                    ctx.fillRect(b.x + b.width - 5 / zoom, b.y + b.height - 5 / zoom, 10 / zoom, 10 / zoom);
                }
            }
            if (pixelEditor?.imageId === (shape.type === 'pixel-image' ? shape.components.image.imageId : '') && pixelEditor.grid) {
                const editingImage = pixelEditor.image;
                if (editingImage) {
                    ctx.save();
                    ctx.strokeStyle = '#8889';
                    ctx.lineWidth = 1 / zoom;
                    ctx.beginPath();
                    for (let x = 0; x <= editingImage.width; x++) {
                        const px = b.x + x * b.width / editingImage.width;
                        ctx.moveTo(px, b.y);
                        ctx.lineTo(px, b.y + b.height);
                    }
                    for (let y = 0; y <= editingImage.height; y++) {
                        const py = b.y + y * b.height / editingImage.height;
                        ctx.moveTo(b.x, py);
                        ctx.lineTo(b.x + b.width, py);
                    }
                    ctx.stroke();
                    ctx.restore();
                }
            }
        });
        vector.draw(ctx);
        if (marquee) {
            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = '#f0df00';
            ctx.fillStyle = '#f0df0030';
            ctx.lineWidth = 1;
            ctx.fillRect(marquee.x, marquee.y, marquee.width, marquee.height);
            ctx.strokeRect(marquee.x, marquee.y, marquee.width, marquee.height);
            ctx.restore();
        }
    }, [state.document, state.selectedId, state.selectedIds, state.selectedPageId, marquee, zoom, pixelEditor, vector]);
    useEffect(() => () => {
        if (gesture.current) {
            gesture.current = null;
            if (store.getSnapshot().transactionActive) store.cancelTransaction();
        }
    }, [store]);
    const point = (event: PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return {x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom};
    };
    const finish = (cancel: boolean) => {
        if (!gesture.current) return;
        const current = gesture.current;
        const pointer = current.pointer;
        gesture.current = null;
        if (current.kind === 'marquee') setMarquee(null);
        else if (current.kind === 'pan') { /* viewport offsets already reflect the pan */
        } else if (store.getSnapshot().transactionActive) {
            if (cancel) store.cancelTransaction(); else store.commitTransaction();
        }
        if (ref.current?.hasPointerCapture(pointer)) ref.current.releasePointerCapture(pointer);
    };
    const setZoomAt = (nextZoom: number, clientX?: number, clientY?: number) => {
        const element = viewport.current;
        const oldZoom = zoom, next = clampZoom(nextZoom);
        if (next === oldZoom) return;
        if (element && clientX !== undefined && clientY !== undefined) {
            const rect = element.getBoundingClientRect();
            const anchorX = clientX - rect.left, anchorY = clientY - rect.top;
            const docX = (element.scrollLeft + anchorX) / oldZoom;
            const docY = (element.scrollTop + anchorY) / oldZoom;
            onZoomChange(next);
            requestAnimationFrame(() => {
                element.scrollLeft = docX * next - anchorX;
                element.scrollTop = docY * next - anchorY;
            });
        } else onZoomChange(next);
    };
    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const handleWheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            setZoomAt(zoom * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
        };
        element.addEventListener('wheel', handleWheel, {passive: false});
        return () => element.removeEventListener('wheel', handleWheel);
    }, [zoom, onZoomChange]);
    return <div className="canvas-viewport" ref={viewport}>
        <canvas aria-label="Drawing canvas" tabIndex={0} ref={ref}
                width={1024 * zoom * (window.devicePixelRatio || 1)}
                height={1024 * zoom * (window.devicePixelRatio || 1)} style={{
            width: 1024 * zoom,
            height: 1024 * zoom,
            backgroundSize: `${64 * zoom}px ${64 * zoom}px`,
            touchAction: 'none'
        }}
                onContextMenu={event => {
                    event.preventDefault();
                    if (vectorShape) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const p = {
                        x: (event.clientX - rect.left) / zoom,
                        y: (event.clientY - rect.top) / zoom
                    };
                    const shape = [...state.document.shapes].reverse().filter(item => item.pageId === state.selectedPageId).find(item => {
                        if (item.type === 'vector') return vectorHit(item, p, 8 / zoom);
                        if (item.type === 'circle') return circleContains(item.components.circle, p);
                        const b = selectionBounds(item);
                        return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
                    });
                    if (pixelEditor && shape?.type === 'pixel-image' && shape.components.image.imageId === pixelEditor.imageId) {
                        const b = shape.components.rect.bounds;
                        const editingImage = pixelEditor.image;
                        if (editingImage) pixelEditor.sample({
                            x: (p.x - b.x) * editingImage.width / b.width,
                            y: (p.y - b.y) * editingImage.height / b.height
                        });
                        return;
                    }
                    if (shape) onShapeContextMenu(event, shape);
                    else onCanvasContextMenu(event);
                }}
                onDoubleClick={event => {
                    if (pixelEditor || vectorShape) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const p = {
                        x: (event.clientX - rect.left) / zoom,
                        y: (event.clientY - rect.top) / zoom
                    };
                    const shape = [...store.getSnapshot().document.shapes].reverse().filter(s => s.pageId === state.selectedPageId).find(s => {
                        if (s.type === 'vector') return vectorHit(s, p, 8 / zoom);
                        if (s.type === 'circle') return circleContains(s.components.circle, p);
                        const b = selectionBounds(s);
                        return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
                    });
                    if (shape?.type === 'vector') {
                        finish(false);
                        store.select(shape.id);
                        onEditVector(shape.id);
                        return;
                    }
                    if (shape?.type === 'pixel-image') {
                        finish(false);
                        const view = viewport.current;
                        const parent = view?.parentElement;
                        const viewRect = view?.getBoundingClientRect();
                        const parentRect = parent?.getBoundingClientRect();
                        const bounds = shape.components.rect.bounds;
                        const position = view && viewRect && parentRect ? {
                            x: viewRect.left - parentRect.left + bounds.x * zoom - view.scrollLeft,
                            y: viewRect.top - parentRect.top + bounds.y * zoom - view.scrollTop,
                        } : {x: 12, y: 12};
                        onEditImage(shape.components.image, position, {
                            x: bounds.x * zoom,
                            y: bounds.y * zoom,
                            width: bounds.width * zoom,
                            height: bounds.height * zoom
                        });
                    }
                }}
                onKeyDown={event => {
                    if (event.key === 'Enter' && !vectorShape) {
                        const s = state.document.shapes.find(s => s.id === state.selectedId);
                        if (s?.type === 'vector') {
                            event.preventDefault();
                            onEditVector(s.id);
                        }
                    }
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        finish(true);
                    }
                }}
                onKeyDownCapture={event => {
                    if (event.code === 'Space') {
                        spacePan.current = true;
                        event.preventDefault();
                    }
                }}
                onKeyUpCapture={event => {
                    if (event.code === 'Space') spacePan.current = false;
                }}
                onPointerDown={event => {
                    if (gesture.current) return;
                    const isPan = event.button === 1 || (event.button === 0 && spacePan.current);
                    if (isPan) {
                        event.preventDefault();
                        const element = viewport.current;
                        if (!element) return;
                        gesture.current = {
                            kind: 'pan',
                            ids: [],
                            pointer: event.pointerId,
                            x: event.clientX,
                            y: event.clientY,
                            bounds: [],
                            scrollX: element.scrollLeft,
                            scrollY: element.scrollTop
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                        return;
                    }
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.currentTarget.focus({preventScroll: true});
                    if (vectorShape) {
                        vector.pointerDown(point(event), event.pointerId, event.shiftKey);
                        if (vector.active(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
                        return;
                    }
                    if (pixelEditor) {
                        if (store.getSnapshot().transactionActive) return;
                        const p = point(event);
                        const target = [...state.document.shapes].reverse().find(shape => shape.type === 'pixel-image' && shape.components.image.imageId === pixelEditor.imageId && shape.pageId === state.selectedPageId && p.x >= shape.components.rect.bounds.x && p.y >= shape.components.rect.bounds.y && p.x <= shape.components.rect.bounds.x + shape.components.rect.bounds.width && p.y <= shape.components.rect.bounds.y + shape.components.rect.bounds.height);
                        if (!target || target.type !== 'pixel-image') return;
                        const bounds = target.components.rect.bounds;
                        pixelTargetId.current = target.id;
                        pixelEditor.pointerDown({
                            x: (p.x - bounds.x) * pixelEditor.image.width / bounds.width,
                            y: (p.y - bounds.y) * pixelEditor.image.height / bounds.height
                        }, event.pointerId);
                        if (pixelEditor.isActive(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
                        return;
                    }
                    if (store.getSnapshot().transactionActive) return;
                    const p = point(event);
                    const hitTolerance = 10 / zoom;
                    const selected = state.document.shapes.find(s => s.id === state.selectedId);
                    const selectedShapes = state.document.shapes.filter(shape => shape.pageId === state.selectedPageId && state.selectedIds.includes(shape.id));
                    const circleHandle = selected?.type === 'circle' && circleHandles(selected.components.circle)
                        .some(handle => Math.abs(p.x - handle.x) <= hitTolerance && Math.abs(p.y - handle.y) <= hitTolerance);
                    const selectedBounds = selected ? selectionBounds(selected) : null;
                    const boxHandle = (selected?.type === 'vector' || selected?.type === 'rectangle' || selected?.type === 'pixel-image' || selected?.type === 'repeating-image') && selectedBounds &&
                        Math.abs(p.x - selectedBounds.x - selectedBounds.width) <= hitTolerance && Math.abs(p.y - selectedBounds.y - selectedBounds.height) <= hitTolerance;
                    const shape = circleHandle || boxHandle ? selected : [...state.document.shapes].reverse().filter(s => s.pageId === state.selectedPageId).find(s => {
                        if (s.type === 'vector') return vectorHit(s, p, 8 / zoom);
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
                        gesture.current = {
                            kind: 'marquee',
                            ids: event.shiftKey ? [...state.selectedIds] : [],
                            pointer: event.pointerId, ...p,
                            bounds: [],
                            additive: event.shiftKey
                        };
                        setMarquee({x: p.x, y: p.y, width: 0, height: 0});
                        event.currentTarget.setPointerCapture(event.pointerId);
                        return;
                    }
                    if (!state.selectedIds.includes(shape.id)) store.select(shape.id);
                    if (shape.type === 'oval') return;
                    const bounds = selectionBounds(shape);
                    const resize = shape.type === 'circle' ? !!circleHandle
                        : Math.abs(p.x - bounds.x - bounds.width) <= hitTolerance && Math.abs(p.y - bounds.y - bounds.height) <= hitTolerance;
                    const targets = !resize && state.selectedIds.includes(shape.id) && selectedShapes.length > 1 ? selectedShapes : [shape];
                    const duplicate = !resize && event.altKey && targets.every(target => target.type !== 'oval');
                    if (duplicate) store.duplicateShapes(targets.map(target => target.id));
                    store.beginTransaction(duplicate ? 'Duplicate and move selection' : `${resize ? 'Resize' : 'Move'} ${targets.length > 1 ? 'selection' : shape.type}`);
                    const gestureTargets = duplicate
                        ? store.getSnapshot().document.shapes.filter(item => store.getSnapshot().selectedIds.includes(item.id))
                        : targets;
                    gesture.current = {
                        kind: resize ? 'resize' : 'move',
                        ids: gestureTargets.map(target => target.id),
                        pointer: event.pointerId, ...p,
                        bounds: gestureTargets.map(selectionBounds),
                        vectors: new Map(gestureTargets.flatMap(t => t.type === 'vector' ? [[t.id, t.components.network] as const] : [])),
                        circles: new Map(gestureTargets.flatMap(target => target.type === 'circle' ? [[target.id, target.components.circle] as const] : []))
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={event => {
                    if (vectorShape && gesture.current?.kind !== 'pan') {
                        vector.pointerMove(point(event), event.pointerId);
                        return;
                    }
                    if (pixelEditor?.isActive(event.pointerId)) {
                        const pointOnCanvas = point(event);
                        const shape = state.document.shapes.find(item => item.id === pixelTargetId.current);
                        if (shape?.type === 'pixel-image') {
                            const b = shape.components.rect.bounds;
                            pixelEditor.pointerMove({
                                x: (pointOnCanvas.x - b.x) * pixelEditor.image.width / b.width,
                                y: (pointOnCanvas.y - b.y) * pixelEditor.image.height / b.height
                            }, event.pointerId);
                        }
                        return;
                    }
                    const g = gesture.current;
                    if (!g || g.pointer !== event.pointerId) return;
                    if (g.kind === 'pan') {
                        if (viewport.current) {
                            viewport.current.scrollLeft = (g.scrollX ?? 0) - (event.clientX - g.x);
                            viewport.current.scrollTop = (g.scrollY ?? 0) - (event.clientY - g.y);
                        }
                        return;
                    }
                    const p = point(event);
                    const dx = p.x - g.x, dy = p.y - g.y;
                    if (g.kind === 'marquee') {
                        setMarquee({
                            x: Math.min(g.x, p.x),
                            y: Math.min(g.y, p.y),
                            width: Math.abs(dx),
                            height: Math.abs(dy)
                        });
                        return;
                    }
                    g.ids.forEach((id, index) => store.updateShape(id, shape => {
                        const bounds = g.bounds[index];
                        const network = g.vectors?.get(id);
                        if (shape.type === 'vector' && network) {
                            if (g.kind === 'resize') resizeVector(shape.components.network, network, bounds.width + dx, bounds.height + dy);
                            else shape.components.network.origin = {
                                x: network.origin.x + dx,
                                y: network.origin.y + dy
                            };
                            return;
                        }
                        const circle = g.circles?.get(id);
                        if (shape.type === 'circle' && circle) {
                            shape.components.circle = dragCircle(circle, g, p, g.kind === 'resize' && g.ids.length === 1);
                            return;
                        }
                        if (shape.type === 'rectangle' || shape.type === 'pixel-image' || shape.type === 'repeating-image') shape.components.rect.bounds = g.kind === 'resize'
                            ? resizeImageBounds(bounds, dx, dy, (shape.type === 'pixel-image' || shape.type === 'repeating-image') && event.shiftKey)
                            : {...bounds, x: bounds.x + dx, y: bounds.y + dy};
                    }));
                }}
                onPointerUp={event => {
                    if (vector.active(event.pointerId)) {
                        vector.pointerUp(point(event), event.pointerId);
                        if (ref.current?.hasPointerCapture(event.pointerId)) ref.current.releasePointerCapture(event.pointerId);
                        return;
                    }
                    if (pixelEditor?.isActive(event.pointerId)) {
                        const pointOnCanvas = point(event);
                        const shape = state.document.shapes.find(item => item.id === pixelTargetId.current);
                        if (shape?.type === 'pixel-image') {
                            const b = shape.components.rect.bounds;
                            pixelEditor.pointerUp({
                                x: (pointOnCanvas.x - b.x) * pixelEditor.image.width / b.width,
                                y: (pointOnCanvas.y - b.y) * pixelEditor.image.height / b.height
                            }, event.pointerId);
                        } else pixelEditor.cancel();
                        pixelTargetId.current = null;
                        if (ref.current?.hasPointerCapture(event.pointerId)) ref.current.releasePointerCapture(event.pointerId);
                        return;
                    }
                    const g = gesture.current;
                    if (!g || g.pointer !== event.pointerId) return;
                    if (g.kind === 'marquee') {
                        const p = point(event);
                        const box = {
                            x: Math.min(g.x, p.x),
                            y: Math.min(g.y, p.y),
                            width: Math.abs(p.x - g.x),
                            height: Math.abs(p.y - g.y)
                        };
                        const hits = box.width < 2 && box.height < 2 ? [] : state.document.shapes.filter(shape => shape.pageId === state.selectedPageId).filter(shape => {
                            const b = selectionBounds(shape);
                            return b.x <= box.x + box.width && b.x + b.width >= box.x && b.y <= box.y + box.height && b.y + b.height >= box.y;
                        }).map(shape => shape.id);
                        store.setSelection(g.additive ? [...g.ids, ...hits] : hits);
                        setMarquee(null);
                    } else finish(false);
                    gesture.current = null;
                    if (ref.current?.hasPointerCapture(event.pointerId)) ref.current.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={event => {
                    pixelEditor?.cancel();
                    vector.cancel();
                    finish(true);
                }} onLostPointerCapture={() => {
            pixelEditor?.cancel();
            vector.cancel();
            finish(true);
        }} onBlur={() => {
            pixelEditor?.cancel();
            vector.cancel();
            finish(true);
        }}/>
        {vector.palette}</div>;
}
