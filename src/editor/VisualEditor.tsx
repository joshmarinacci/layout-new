import {
    type MouseEvent,
    type PointerEvent,
    useEffect,
    useEffectEvent,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import {circleContains, circleHandles, dragCircle} from '../shapes/circleGeometry';
import type {EditorStore} from '../model/EditorStore';
import type {PixelEditorController} from '../shapes/PixelImageEditor';
import {drawPixelImage, resizeImageBounds} from '../shapes/pixelImages';
import {gridDrawStep, snapMoveDelta, snapRadius, snapResizeDelta} from '../model/grid';
import type {
    Bounds,
    CircleLikeComponent,
    GridSettings,
    PixelImageData,
    PixelImageReferenceComponent,
    Point,
    Shape,
    VectorNetwork,
} from '../model/types';
import {useEditorStore} from '../model/useEditorStore';
import {useVectorEditor} from '../shapes/VectorEditor';
import {drawVector, resizeVector, vectorBounds, vectorHit} from '../shapes/vectorNetworks';
import {drawTextShape} from '../shapes/text';
import {installDocumentFonts} from '../shapes/googleFonts';
import {onPhotoDecoded, photoBitmap} from '../shapes/photos';
import {drawCropMode, usePhotoCrop} from './usePhotoCrop';
import {
    type Camera,
    type CameraStore,
    documentToScreen,
    intersects,
    panBy,
    screenToDocument,
    visibleBounds,
    wheelZoomFactor,
    zoomAt,
} from './camera';

/** WebKit's (Safari, Tauri) non-standard trackpad pinch event. */
interface GestureEvent extends UIEvent {
    scale: number;
    clientX: number;
    clientY: number;
}

const isGestureEvent = (event: Event): event is GestureEvent =>
    'scale' in event && typeof event.scale === 'number' && 'clientX' in event && 'clientY' in event;

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
        case 'text':
            return shape.components.rect.bounds;
        case 'photo':
            return shape.components.rect.bounds;
        case 'oval':
            return shape.components.oval.bounds;
        case 'circle': {
            const {center, radius} = shape.components.circle;
            return {
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2,
            };
        }
    }
}

/** Screen positions (CSS px, snapped to the pixel grid) of the grid lines crossing one axis of the viewport. */
function gridPositions(start: number, zoom: number, step: number, extent: number) {
    const positions: number[] = [];
    for (let value = Math.ceil(start / step) * step; ; value += step) {
        const screen = Math.round((value - start) * zoom);
        if (screen > extent) break;
        positions.push(screen);
    }
    return positions;
}

/**
 * Draws the snapping grid in screen space, so lines stay one pixel wide and dots one size at any zoom.
 * When the grid would be too dense on screen only every 2nd, 5th, 10th… line is drawn.
 */
function drawGrid(
    ctx: CanvasRenderingContext2D,
    view: Camera,
    width: number,
    height: number,
    grid: GridSettings,
    color: string,
) {
    if (grid.style === 'hidden') return;
    const step = gridDrawStep(grid.size, view.zoom);
    const xs = gridPositions(view.x, view.zoom, step, width);
    const ys = gridPositions(view.y, view.zoom, step, height);
    ctx.beginPath();
    if (grid.style === 'dots') {
        for (const x of xs) for (const y of ys) ctx.rect(x - 1, y - 1, 2, 2);
        ctx.fillStyle = color;
        ctx.fill();
        return;
    }
    for (const x of xs) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
    }
    for (const y of ys) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
}

/** How far past its bounds a shape may paint (strokes are centered on the outline). */
function paintMargin(shape: Shape, zoom: number) {
    const stroke =
        shape.type === 'vector' || shape.type === 'circle' || shape.type === 'oval' || shape.type === 'rectangle'
            ? shape.components.stroke.width
            : 0;
    return stroke + 12 / zoom;
}
export default function VisualEditor({
    store,
    grid,
    onEditImage,
    onShapeContextMenu,
    onCanvasContextMenu,
    camera,
    pixelEditor,
    vectorId,
    onEditVector,
    cropId,
    onStartCrop,
    onFinishCrop,
    onImportFiles,
}: {
    store: EditorStore;
    /** The grid to draw and snap to, or null while the grid is off. */
    grid: GridSettings | null;
    onEditImage: (
        reference: PixelImageReferenceComponent,
        position: {
            x: number;
            y: number;
        },
        imageRect: Bounds,
    ) => void;
    onShapeContextMenu: (event: MouseEvent<HTMLCanvasElement>, shape: Shape) => void;
    onCanvasContextMenu: (event: MouseEvent<HTMLCanvasElement>) => void;
    camera: CameraStore;
    pixelEditor?: PixelEditorController | null;
    vectorId: string | null;
    onEditVector: (id: string | null) => void;
    /** The photo shape in crop mode, if any. */
    cropId: string | null;
    onStartCrop: (id: string) => void;
    onFinishCrop: (commit: boolean) => void;
    /** Image files dropped on (with the document point) or pasted into the canvas. */
    onImportFiles: (files: File[], at?: Point) => void;
}) {
    const state = useEditorStore(store);
    const pageId = state.selectedPageId;
    // Re-render on zoom changes (hit tolerances depend on it) but not on panning,
    // which only redraws the canvas.
    const zoom = useSyncExternalStore(camera.subscribe, () => camera.get(pageId).zoom);
    const vectorShape = state.document.shapes.find(
        s => s.id === vectorId && s.type === 'vector' && s.pageId === pageId,
    );
    const vector = useVectorEditor(store, vectorShape?.type === 'vector' ? vectorShape : undefined, zoom, () =>
        onEditVector(null),
    );
    const cropShape = state.document.shapes.find(s => s.id === cropId && s.type === 'photo' && s.pageId === pageId);
    const cropPhoto =
        cropShape?.type === 'photo'
            ? state.document.photos.find(photo => photo.id === cropShape.components.photo.photoId)
            : undefined;
    const crop = usePhotoCrop(
        store,
        cropShape?.type === 'photo' ? cropShape : undefined,
        cropPhoto,
        zoom,
        onFinishCrop,
    );
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
        camera?: Camera;
        duplicate?: boolean;
        duplicateStarted?: boolean;
    } | null>(null);
    const [marquee, setMarquee] = useState<Bounds | null>(null);
    const [, setFontEpoch] = useState(0);
    const patterns = useRef(new WeakMap<PixelImageData, Map<string, CanvasPattern | null>>());
    const frame = useRef(0);
    useEffect(() => {
        let active = true;
        const fonts = state.document.fonts;
        installDocumentFonts(fonts);
        void Promise.all(fonts.map(font => document.fonts.load(`400 16px ${JSON.stringify(font.family)}`))).then(() => {
            if (active) setFontEpoch(value => value + 1);
        });
        return () => {
            active = false;
        };
    }, [state.document.fonts]);
    const draw = useEffectEvent(() => {
        const canvas = ref.current;
        const element = viewport.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas || !element) return;
        const width = element.clientWidth;
        const height = element.clientHeight;
        const pixelRatio = window.devicePixelRatio || 1;
        const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
        const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
        }
        const view = camera.get(pageId);
        const {zoom} = view;
        // Read by the end-to-end tests to map document points to the screen.
        canvas.dataset.camera = `${view.x},${view.y},${zoom}`;
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        canvas.dataset.grid = grid ? `${grid.size},${grid.style}` : 'off';
        if (grid) drawGrid(ctx, view, width, height, grid, getComputedStyle(canvas).color);
        ctx.setTransform(
            zoom * pixelRatio,
            0,
            0,
            zoom * pixelRatio,
            -view.x * zoom * pixelRatio,
            -view.y * zoom * pixelRatio,
        );
        const visible = visibleBounds(view, {width, height});
        const images = new Map(
            state.document.images.map(image => {
                const cached = bitmaps.current.get(image);
                if (cached) return [image.id, cached];
                const bitmap = document.createElement('canvas');
                bitmap.width = image.width;
                bitmap.height = image.height;
                const context = bitmap.getContext('2d');
                if (context) drawPixelImage(context, image);
                bitmaps.current.set(image, bitmap);
                return [image.id, bitmap];
            }),
        );
        const photos = new Map(state.document.photos.map(photo => [photo.id, photo]));
        ctx.imageSmoothingEnabled = false;
        state.document.shapes
            .filter(shape => shape.pageId === pageId)
            .forEach(shape => {
                const b = selectionBounds(shape);
                const margin = paintMargin(shape, zoom);
                // Text may paint outside its box, and is cheap to keep.
                if (
                    shape.type !== 'text' &&
                    shape.id !== cropId &&
                    !intersects(
                        {x: b.x - margin, y: b.y - margin, width: b.width + margin * 2, height: b.height + margin * 2},
                        visible,
                    )
                )
                    return;
                if (shape.type === 'vector') {
                    drawVector(ctx, shape);
                } else if (shape.type === 'text') {
                    drawTextShape(ctx, shape, state.document.fonts);
                } else if (shape.type === 'pixel-image') {
                    const bitmap = images.get(shape.components.image.imageId);
                    if (bitmap) {
                        const region = shape.components.image.source ?? {
                            x: 0,
                            y: 0,
                            width: bitmap.width,
                            height: bitmap.height,
                        };
                        ctx.drawImage(
                            bitmap,
                            region.x,
                            region.y,
                            region.width,
                            region.height,
                            b.x,
                            b.y,
                            b.width,
                            b.height,
                        );
                    }
                    // A faint boundary keeps a fully transparent new image discoverable.
                    ctx.strokeStyle = '#657b83';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(b.x, b.y, b.width, b.height);
                } else if (shape.type === 'photo') {
                    const photo = photos.get(shape.components.photo.photoId);
                    const bitmap = photo ? photoBitmap(photo) : null;
                    if (photo && shape.id === cropId) drawCropMode(ctx, shape, photo, bitmap, zoom);
                    else if (bitmap) {
                        const c = shape.components.photo.crop;
                        // Photos are scaled smoothly; pixel art (the default here) stays crisp.
                        ctx.save();
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(bitmap, c.x, c.y, c.width, c.height, b.x, b.y, b.width, b.height);
                        ctx.restore();
                    } else {
                        // Still decoding (or unreadable): a placeholder keeps the shape visible.
                        ctx.fillStyle = '#8882';
                        ctx.fillRect(b.x, b.y, b.width, b.height);
                    }
                } else if (shape.type === 'repeating-image') {
                    const image = state.document.images.find(item => item.id === shape.components.image.imageId);
                    const bitmap = images.get(shape.components.image.imageId);
                    if (image && bitmap) {
                        const region = shape.components.image.source;
                        const {width: tileWidth, height: tileHeight} = shape.components.pattern;
                        // Patterns are rebuilt only when the image or tile changes, not every frame.
                        const key = `${region.x},${region.y},${region.width},${region.height}:${tileWidth}x${tileHeight}`;
                        let cache = patterns.current.get(image);
                        if (!cache) patterns.current.set(image, (cache = new Map()));
                        if (!cache.has(key)) {
                            const tile = document.createElement('canvas');
                            tile.width = tileWidth;
                            tile.height = tileHeight;
                            const tileCtx = tile.getContext('2d');
                            if (tileCtx) {
                                tileCtx.imageSmoothingEnabled = false;
                                tileCtx.drawImage(
                                    bitmap,
                                    region.x,
                                    region.y,
                                    region.width,
                                    region.height,
                                    0,
                                    0,
                                    tile.width,
                                    tile.height,
                                );
                            }
                            cache.set(key, tileCtx ? ctx.createPattern(tile, 'repeat') : null);
                        }
                        const pattern = cache.get(key);
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
                    ctx.strokeStyle = '#657b83';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(b.x, b.y, b.width, b.height);
                } else {
                    ctx.beginPath();
                    if (shape.type === 'rectangle') ctx.rect(b.x, b.y, b.width, b.height);
                    else
                        ctx.ellipse(
                            b.x + b.width / 2,
                            b.y + b.height / 2,
                            b.width / 2,
                            b.height / 2,
                            0,
                            0,
                            Math.PI * 2,
                        );
                    ctx.fillStyle = shape.components.fill.fill.color;
                    ctx.fill();
                    ctx.lineWidth = shape.components.stroke.width;
                    ctx.strokeStyle = shape.components.stroke.color;
                    if (ctx.lineWidth > 0 && shape.components.stroke.width > 0) ctx.stroke();
                }
                if (state.selectedIds.includes(shape.id) && !pixelEditor && !vectorShape && shape.id !== cropId) {
                    ctx.strokeStyle = 'yellow';
                    ctx.lineWidth = 2 / zoom;
                    ctx.strokeRect(b.x, b.y, b.width, b.height);
                    if (shape.id === state.selectedId && shape.type === 'circle') {
                        ctx.fillStyle = '#1684e8';
                        circleHandles(shape.components.circle).forEach(handle =>
                            ctx.fillRect(handle.x - 5 / zoom, handle.y - 5 / zoom, 10 / zoom, 10 / zoom),
                        );
                    }
                    if (
                        shape.id === state.selectedId &&
                        (shape.type === 'vector' ||
                            shape.type === 'rectangle' ||
                            shape.type === 'text' ||
                            shape.type === 'photo' ||
                            shape.type === 'pixel-image' ||
                            shape.type === 'repeating-image')
                    ) {
                        ctx.fillStyle = 'yellow';
                        ctx.fillRect(b.x + b.width - 5 / zoom, b.y + b.height - 5 / zoom, 10 / zoom, 10 / zoom);
                    }
                }
                if (
                    pixelEditor?.imageId === (shape.type === 'pixel-image' ? shape.components.image.imageId : '') &&
                    pixelEditor.grid
                ) {
                    const editingImage = pixelEditor.image;
                    if (editingImage) {
                        ctx.save();
                        ctx.strokeStyle = '#8889';
                        ctx.lineWidth = 1 / zoom;
                        ctx.beginPath();
                        for (let x = 0; x <= editingImage.width; x++) {
                            const px = b.x + (x * b.width) / editingImage.width;
                            ctx.moveTo(px, b.y);
                            ctx.lineTo(px, b.y + b.height);
                        }
                        for (let y = 0; y <= editingImage.height; y++) {
                            const py = b.y + (y * b.height) / editingImage.height;
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
    });
    const scheduleDraw = useEffectEvent(() => {
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            draw();
        });
    });
    // The document, selection, editor overlays and fonts are all render state,
    // so redraw after every render; frames coalesce to one per animation frame.
    useEffect(() => scheduleDraw());
    useEffect(() => camera.subscribe(() => scheduleDraw()), [camera]);
    // Photos decode asynchronously; redraw when one is ready.
    useEffect(() => onPhotoDecoded(() => scheduleDraw()), []);
    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const measure = () => {
            camera.setViewport({width: element.clientWidth, height: element.clientHeight});
            scheduleDraw();
        };
        measure();
        const resize = new ResizeObserver(measure);
        resize.observe(element);
        // Theme changes restyle the grid colour without a React render here.
        const theme = new MutationObserver(() => scheduleDraw());
        theme.observe(document.documentElement, {attributes: true});
        const scheme = window.matchMedia('(prefers-color-scheme: dark)');
        const onScheme = () => scheduleDraw();
        scheme.addEventListener('change', onScheme);
        return () => {
            resize.disconnect();
            theme.disconnect();
            scheme.removeEventListener('change', onScheme);
            cancelAnimationFrame(frame.current);
            frame.current = 0;
        };
    }, [camera]);
    useEffect(
        () => () => {
            if (gesture.current) {
                gesture.current = null;
                if (store.getSnapshot().transactionActive) store.cancelTransaction();
            }
        },
        [store],
    );
    const point = (event: PointerEvent<HTMLCanvasElement> | MouseEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return screenToDocument(camera.get(pageId), {x: event.clientX - rect.left, y: event.clientY - rect.top});
    };
    const finish = (cancel: boolean) => {
        if (!gesture.current) return;
        const current = gesture.current;
        const pointer = current.pointer;
        gesture.current = null;
        if (current.kind === 'marquee') setMarquee(null);
        else if (current.kind === 'pan') {
            /* viewport offsets already reflect the pan */
        } else if (store.getSnapshot().transactionActive) {
            if (cancel) store.cancelTransaction();
            else store.commitTransaction();
        }
        if (ref.current?.hasPointerCapture(pointer)) ref.current.releasePointerCapture(pointer);
    };
    /** The zoom when a WebKit pinch gesture began, while one is in progress. */
    const pinchStart = useRef<number | null>(null);
    const onWheel = useEffectEvent((event: WheelEvent) => {
        event.preventDefault();
        const rect = viewport.current?.getBoundingClientRect();
        if (!rect) return;
        const view = camera.get(pageId);
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
        if (event.ctrlKey || event.metaKey) {
            // WebKit reports the same pinch through gesture events below; don't zoom twice.
            if (pinchStart.current) return;
            const factor = wheelZoomFactor(event.deltaY * unit, {pinch: event.ctrlKey && !event.metaKey});
            camera.set(
                pageId,
                zoomAt(view, view.zoom * factor, {x: event.clientX - rect.left, y: event.clientY - rect.top}),
            );
        } else camera.set(pageId, panBy(view, event.deltaX * unit, event.deltaY * unit));
    });
    /**
     * Safari and Tauri's WebKit report a trackpad pinch as gesture events whose
     * `scale` is relative to where the pinch began, so zooming to start × scale
     * keeps the content under the fingers, like a native app.
     */
    const onGesture = useEffectEvent((event: Event) => {
        event.preventDefault();
        const rect = viewport.current?.getBoundingClientRect();
        if (!rect || !isGestureEvent(event)) return;
        if (event.type === 'gesturestart') pinchStart.current = camera.get(pageId).zoom;
        else if (event.type === 'gestureend') pinchStart.current = null;
        else if (pinchStart.current !== null)
            camera.set(
                pageId,
                zoomAt(camera.get(pageId), pinchStart.current * event.scale, {
                    x: event.clientX - rect.left,
                    y: event.clientY - rect.top,
                }),
            );
    });
    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const handleWheel = (event: WheelEvent) => onWheel(event);
        const handleGesture = (event: Event) => onGesture(event);
        const gestures = ['gesturestart', 'gesturechange', 'gestureend'];
        element.addEventListener('wheel', handleWheel, {passive: false});
        for (const type of gestures) element.addEventListener(type, handleGesture, {passive: false});
        return () => {
            element.removeEventListener('wheel', handleWheel);
            for (const type of gestures) element.removeEventListener(type, handleGesture);
        };
    }, []);
    return (
        <div className="canvas-viewport" ref={viewport}>
            <canvas
                aria-label="Drawing canvas"
                tabIndex={0}
                ref={ref}
                style={{touchAction: 'none'}}
                onDragOver={event => {
                    if (event.dataTransfer.types.includes('Files')) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'copy';
                    }
                }}
                onDrop={event => {
                    const files = [...event.dataTransfer.files].filter(file => file.type.startsWith('image/'));
                    if (!files.length) return;
                    event.preventDefault();
                    onImportFiles(files, point(event));
                }}
                onPaste={event => {
                    const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
                    if (!files.length) return;
                    event.preventDefault();
                    onImportFiles(files);
                }}
                onContextMenu={event => {
                    event.preventDefault();
                    if (vectorShape) return;
                    const p = point(event);
                    const shape = [...state.document.shapes]
                        .reverse()
                        .filter(item => item.pageId === pageId)
                        .find(item => {
                            if (item.type === 'vector') return vectorHit(item, p, 8 / zoom);
                            if (item.type === 'circle') return circleContains(item.components.circle, p);
                            const b = selectionBounds(item);
                            return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
                        });
                    if (
                        pixelEditor &&
                        shape?.type === 'pixel-image' &&
                        shape.components.image.imageId === pixelEditor.imageId
                    ) {
                        const b = shape.components.rect.bounds;
                        const editingImage = pixelEditor.image;
                        if (editingImage)
                            pixelEditor.sample({
                                x: ((p.x - b.x) * editingImage.width) / b.width,
                                y: ((p.y - b.y) * editingImage.height) / b.height,
                            });
                        return;
                    }
                    if (shape) onShapeContextMenu(event, shape);
                    else onCanvasContextMenu(event);
                }}
                onDoubleClick={event => {
                    if (pixelEditor || vectorShape) return;
                    const p = point(event);
                    const shape = [...store.getSnapshot().document.shapes]
                        .reverse()
                        .filter(s => s.pageId === pageId)
                        .find(s => {
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
                    if (shape?.type === 'photo') {
                        finish(false);
                        if (cropId) return;
                        store.select(shape.id);
                        onStartCrop(shape.id);
                        return;
                    }
                    if (shape?.type === 'pixel-image') {
                        finish(false);
                        const view = viewport.current;
                        const viewRect = view?.getBoundingClientRect();
                        const parentRect = view?.parentElement?.getBoundingClientRect();
                        const bounds = shape.components.rect.bounds;
                        // Both positions are relative to the viewport's parent, where the palette is placed.
                        const screen = documentToScreen(camera.get(pageId), bounds);
                        const offset =
                            viewRect && parentRect
                                ? {x: viewRect.left - parentRect.left, y: viewRect.top - parentRect.top}
                                : {x: 0, y: 0};
                        const position = {x: offset.x + screen.x, y: offset.y + screen.y};
                        onEditImage(shape.components.image, position, {
                            ...position,
                            width: bounds.width * zoom,
                            height: bounds.height * zoom,
                        });
                    }
                }}
                onKeyDown={event => {
                    if (crop.active) {
                        if (crop.keyDown(event)) event.preventDefault();
                        return;
                    }
                    if (event.key === 'Enter' && !vectorShape) {
                        const s = state.document.shapes.find(s => s.id === state.selectedId);
                        if (s?.type === 'vector') {
                            event.preventDefault();
                            onEditVector(s.id);
                        }
                        if (s?.type === 'photo' && !store.getSnapshot().transactionActive) {
                            event.preventDefault();
                            onStartCrop(s.id);
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
                        gesture.current = {
                            kind: 'pan',
                            ids: [],
                            pointer: event.pointerId,
                            x: event.clientX,
                            y: event.clientY,
                            bounds: [],
                            camera: camera.get(pageId),
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
                    if (crop.active) {
                        if (crop.pointerDown(point(event), event.pointerId) && crop.isDragging(event.pointerId))
                            event.currentTarget.setPointerCapture(event.pointerId);
                        return;
                    }
                    if (pixelEditor) {
                        if (store.getSnapshot().transactionActive) return;
                        const p = point(event);
                        const target = [...state.document.shapes]
                            .reverse()
                            .find(
                                shape =>
                                    shape.type === 'pixel-image' &&
                                    shape.components.image.imageId === pixelEditor.imageId &&
                                    shape.pageId === pageId &&
                                    p.x >= shape.components.rect.bounds.x &&
                                    p.y >= shape.components.rect.bounds.y &&
                                    p.x <= shape.components.rect.bounds.x + shape.components.rect.bounds.width &&
                                    p.y <= shape.components.rect.bounds.y + shape.components.rect.bounds.height,
                            );
                        if (!target || target.type !== 'pixel-image') return;
                        const bounds = target.components.rect.bounds;
                        pixelTargetId.current = target.id;
                        pixelEditor.pointerDown(
                            {
                                x: ((p.x - bounds.x) * pixelEditor.image.width) / bounds.width,
                                y: ((p.y - bounds.y) * pixelEditor.image.height) / bounds.height,
                            },
                            event.pointerId,
                        );
                        if (pixelEditor.isActive(event.pointerId))
                            event.currentTarget.setPointerCapture(event.pointerId);
                        return;
                    }
                    if (store.getSnapshot().transactionActive) return;
                    const p = point(event);
                    const hitTolerance = 10 / zoom;
                    const selected = state.document.shapes.find(s => s.id === state.selectedId);
                    const selectedShapes = state.document.shapes.filter(
                        shape => shape.pageId === pageId && state.selectedIds.includes(shape.id),
                    );
                    const circleHandle =
                        selected?.type === 'circle' &&
                        circleHandles(selected.components.circle).some(
                            handle =>
                                Math.abs(p.x - handle.x) <= hitTolerance && Math.abs(p.y - handle.y) <= hitTolerance,
                        );
                    const selectedBounds = selected ? selectionBounds(selected) : null;
                    const boxHandle =
                        (selected?.type === 'vector' ||
                            selected?.type === 'rectangle' ||
                            selected?.type === 'text' ||
                            selected?.type === 'photo' ||
                            selected?.type === 'pixel-image' ||
                            selected?.type === 'repeating-image') &&
                        selectedBounds &&
                        Math.abs(p.x - selectedBounds.x - selectedBounds.width) <= hitTolerance &&
                        Math.abs(p.y - selectedBounds.y - selectedBounds.height) <= hitTolerance;
                    const shape =
                        circleHandle || boxHandle
                            ? selected
                            : [...state.document.shapes]
                                  .reverse()
                                  .filter(s => s.pageId === pageId)
                                  .find(s => {
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
                            pointer: event.pointerId,
                            ...p,
                            bounds: [],
                            additive: event.shiftKey,
                        };
                        setMarquee({x: p.x, y: p.y, width: 0, height: 0});
                        event.currentTarget.setPointerCapture(event.pointerId);
                        return;
                    }
                    if (!state.selectedIds.includes(shape.id)) store.select(shape.id);
                    if (shape.type === 'oval') return;
                    const bounds = selectionBounds(shape);
                    const resize =
                        shape.type === 'circle'
                            ? !!circleHandle
                            : Math.abs(p.x - bounds.x - bounds.width) <= hitTolerance &&
                              Math.abs(p.y - bounds.y - bounds.height) <= hitTolerance;
                    const targets =
                        !resize && state.selectedIds.includes(shape.id) && selectedShapes.length > 1
                            ? selectedShapes
                            : [shape];
                    const duplicate = !resize && event.altKey && targets.every(target => target.type !== 'oval');
                    if (duplicate) store.duplicateShapes(targets.map(target => target.id));
                    store.beginTransaction(
                        duplicate
                            ? 'Duplicate and move selection'
                            : `${resize ? 'Resize' : 'Move'} ${targets.length > 1 ? 'selection' : shape.type}`,
                    );
                    const gestureTargets = duplicate
                        ? store
                              .getSnapshot()
                              .document.shapes.filter(item => store.getSnapshot().selectedIds.includes(item.id))
                        : targets;
                    gesture.current = {
                        kind: resize ? 'resize' : 'move',
                        ids: gestureTargets.map(target => target.id),
                        pointer: event.pointerId,
                        ...p,
                        bounds: gestureTargets.map(selectionBounds),
                        vectors: new Map(
                            gestureTargets.flatMap(t =>
                                t.type === 'vector' ? [[t.id, t.components.network] as const] : [],
                            ),
                        ),
                        circles: new Map(
                            gestureTargets.flatMap(target =>
                                target.type === 'circle' ? [[target.id, target.components.circle] as const] : [],
                            ),
                        ),
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={event => {
                    if (vectorShape && gesture.current?.kind !== 'pan') {
                        vector.pointerMove(point(event), event.pointerId);
                        return;
                    }
                    if (crop.isDragging(event.pointerId)) {
                        crop.pointerMove(point(event), event.pointerId);
                        return;
                    }
                    if (pixelEditor?.isActive(event.pointerId)) {
                        const pointOnCanvas = point(event);
                        const shape = state.document.shapes.find(item => item.id === pixelTargetId.current);
                        if (shape?.type === 'pixel-image') {
                            const b = shape.components.rect.bounds;
                            pixelEditor.pointerMove(
                                {
                                    x: ((pointOnCanvas.x - b.x) * pixelEditor.image.width) / b.width,
                                    y: ((pointOnCanvas.y - b.y) * pixelEditor.image.height) / b.height,
                                },
                                event.pointerId,
                            );
                        }
                        return;
                    }
                    const g = gesture.current;
                    if (!g || g.pointer !== event.pointerId) return;
                    if (g.kind === 'pan') {
                        if (g.camera) camera.set(pageId, panBy(g.camera, g.x - event.clientX, g.y - event.clientY));
                        return;
                    }
                    const p = point(event);
                    const rawDx = p.x - g.x,
                        rawDy = p.y - g.y;
                    if (g.kind === 'marquee') {
                        setMarquee({
                            x: Math.min(g.x, p.x),
                            y: Math.min(g.y, p.y),
                            width: Math.abs(rawDx),
                            height: Math.abs(rawDy),
                        });
                        return;
                    }
                    // Moves snap the selection's top-left corner to the grid; resizes snap the dragged corner.
                    const moved = grid && g.kind === 'move' ? snapMoveDelta(g.bounds, rawDx, rawDy, grid.size) : null;
                    g.ids.forEach((id, index) =>
                        store.updateShape(id, shape => {
                            const bounds = g.bounds[index];
                            const {dx, dy} =
                                moved ??
                                (grid && g.kind === 'resize'
                                    ? snapResizeDelta(bounds, rawDx, rawDy, grid.size)
                                    : {dx: rawDx, dy: rawDy});
                            const network = g.vectors?.get(id);
                            if (shape.type === 'vector' && network) {
                                if (g.kind === 'resize')
                                    resizeVector(
                                        shape.components.network,
                                        network,
                                        bounds.width + dx,
                                        bounds.height + dy,
                                    );
                                else
                                    shape.components.network.origin = {
                                        x: network.origin.x + dx,
                                        y: network.origin.y + dy,
                                    };
                                return;
                            }
                            const circle = g.circles?.get(id);
                            if (shape.type === 'circle' && circle) {
                                const resize = g.kind === 'resize' && g.ids.length === 1;
                                // A moved circle follows the snapped offset; a resized one snaps its diameter.
                                const dragged = dragCircle(circle, g, resize ? p : {x: g.x + dx, y: g.y + dy}, resize);
                                shape.components.circle =
                                    resize && grid
                                        ? {...dragged, radius: snapRadius(dragged.radius, grid.size)}
                                        : dragged;
                                return;
                            }
                            if (
                                shape.type === 'rectangle' ||
                                shape.type === 'text' ||
                                shape.type === 'photo' ||
                                shape.type === 'pixel-image' ||
                                shape.type === 'repeating-image'
                            )
                                shape.components.rect.bounds =
                                    g.kind === 'resize'
                                        ? resizeImageBounds(
                                              bounds,
                                              dx,
                                              dy,
                                              // Photos keep their proportions unless Shift is held;
                                              // pixel art is the reverse.
                                              shape.type === 'photo'
                                                  ? !event.shiftKey
                                                  : (shape.type === 'pixel-image' ||
                                                        shape.type === 'repeating-image') &&
                                                        event.shiftKey,
                                          )
                                        : {...bounds, x: bounds.x + dx, y: bounds.y + dy};
                        }),
                    );
                }}
                onPointerUp={event => {
                    if (crop.isDragging(event.pointerId)) {
                        crop.pointerUp(event.pointerId);
                        if (ref.current?.hasPointerCapture(event.pointerId))
                            ref.current.releasePointerCapture(event.pointerId);
                        return;
                    }
                    if (vector.active(event.pointerId)) {
                        vector.pointerUp(point(event), event.pointerId);
                        if (ref.current?.hasPointerCapture(event.pointerId))
                            ref.current.releasePointerCapture(event.pointerId);
                        return;
                    }
                    if (pixelEditor?.isActive(event.pointerId)) {
                        const pointOnCanvas = point(event);
                        const shape = state.document.shapes.find(item => item.id === pixelTargetId.current);
                        if (shape?.type === 'pixel-image') {
                            const b = shape.components.rect.bounds;
                            pixelEditor.pointerUp(
                                {
                                    x: ((pointOnCanvas.x - b.x) * pixelEditor.image.width) / b.width,
                                    y: ((pointOnCanvas.y - b.y) * pixelEditor.image.height) / b.height,
                                },
                                event.pointerId,
                            );
                        } else pixelEditor.cancel();
                        pixelTargetId.current = null;
                        if (ref.current?.hasPointerCapture(event.pointerId))
                            ref.current.releasePointerCapture(event.pointerId);
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
                            height: Math.abs(p.y - g.y),
                        };
                        const hits =
                            box.width < 2 && box.height < 2
                                ? []
                                : state.document.shapes
                                      .filter(shape => shape.pageId === pageId)
                                      .filter(shape => {
                                          const b = selectionBounds(shape);
                                          return (
                                              b.x <= box.x + box.width &&
                                              b.x + b.width >= box.x &&
                                              b.y <= box.y + box.height &&
                                              b.y + b.height >= box.y
                                          );
                                      })
                                      .map(shape => shape.id);
                        store.setSelection(g.additive ? [...g.ids, ...hits] : hits);
                        setMarquee(null);
                    } else finish(false);
                    gesture.current = null;
                    if (ref.current?.hasPointerCapture(event.pointerId))
                        ref.current.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => {
                    crop.cancelDrag();
                    pixelEditor?.cancel();
                    vector.cancel();
                    finish(true);
                }}
                onLostPointerCapture={() => {
                    crop.cancelDrag();
                    pixelEditor?.cancel();
                    vector.cancel();
                    finish(true);
                }}
                onBlur={() => {
                    crop.cancelDrag();
                    pixelEditor?.cancel();
                    vector.cancel();
                    finish(true);
                }}
            />
            {vector.palette}
        </div>
    );
}
