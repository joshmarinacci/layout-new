import type {Bounds} from '../model/types';

export interface Point {
    x: number;
    y: number;
}

/**
 * Where the canvas is looking: `x`/`y` is the document point at the viewport's
 * top-left corner, and `zoom` is screen pixels (CSS px) per document unit.
 */
export interface Camera {
    x: number;
    y: number;
    zoom: number;
}

export interface ViewportSize {
    width: number;
    height: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64;
export const ZOOM_STEP = 1.25;
export const DEFAULT_CAMERA: Camera = {x: 0, y: 0, zoom: 1};

export const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

export const screenToDocument = (camera: Camera, point: Point): Point => ({
    x: camera.x + point.x / camera.zoom,
    y: camera.y + point.y / camera.zoom,
});

export const documentToScreen = (camera: Camera, point: Point): Point => ({
    x: (point.x - camera.x) * camera.zoom,
    y: (point.y - camera.y) * camera.zoom,
});

/** Zooms to `zoom` while keeping the document point under the screen `anchor` fixed. */
export function zoomAt(camera: Camera, zoom: number, anchor: Point): Camera {
    const next = clampZoom(zoom);
    const pinned = screenToDocument(camera, anchor);
    return {x: pinned.x - anchor.x / next, y: pinned.y - anchor.y / next, zoom: next};
}

/** Moves the view by a screen-space distance, as when dragging the canvas or scrolling. */
export const panBy = (camera: Camera, dx: number, dy: number): Camera => ({
    ...camera,
    x: camera.x + dx / camera.zoom,
    y: camera.y + dy / camera.zoom,
});

export const visibleBounds = (camera: Camera, size: ViewportSize): Bounds => ({
    x: camera.x,
    y: camera.y,
    width: size.width / camera.zoom,
    height: size.height / camera.zoom,
});

/** A camera that centers `bounds` in the viewport, zoomed to fit but never past `maxZoom`. */
export function fitBounds(bounds: Bounds, size: ViewportSize, padding = 48, maxZoom = 1): Camera {
    const availableWidth = Math.max(1, size.width - padding * 2);
    const availableHeight = Math.max(1, size.height - padding * 2);
    const zoom = clampZoom(
        Math.min(maxZoom, availableWidth / Math.max(bounds.width, 1), availableHeight / Math.max(bounds.height, 1)),
    );
    return {
        x: bounds.x + bounds.width / 2 - size.width / 2 / zoom,
        y: bounds.y + bounds.height / 2 - size.height / 2 / zoom,
        zoom,
    };
}

export const intersects = (a: Bounds, b: Bounds) =>
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;

export function unionBounds(list: readonly Bounds[]): Bounds | null {
    if (!list.length) return null;
    const minX = Math.min(...list.map(b => b.x));
    const minY = Math.min(...list.map(b => b.y));
    const maxX = Math.max(...list.map(b => b.x + b.width));
    const maxY = Math.max(...list.map(b => b.y + b.height));
    return {x: minX, y: minY, width: maxX - minX, height: maxY - minY};
}

/**
 * View state for one document tab: a camera per page plus the canvas size.
 * It lives outside React so panning can redraw every frame without
 * re-rendering the app; components subscribe to what they display.
 */
export class CameraStore {
    private cameras = new Map<string, Camera>();
    private listeners = new Set<() => void>();
    private size: ViewportSize = {width: 0, height: 0};

    get(pageId: string): Camera {
        return this.cameras.get(pageId) ?? DEFAULT_CAMERA;
    }

    set(pageId: string, camera: Camera) {
        const current = this.get(pageId);
        const next = {...camera, zoom: clampZoom(camera.zoom)};
        if (current.x === next.x && current.y === next.y && current.zoom === next.zoom) return;
        this.cameras.set(pageId, next);
        this.listeners.forEach(listener => listener());
    }

    get viewport(): ViewportSize {
        return this.size;
    }

    setViewport(size: ViewportSize) {
        this.size = size;
    }

    /** The document point at the middle of the visible canvas. */
    center(pageId: string): Point {
        return screenToDocument(this.get(pageId), {x: this.size.width / 2, y: this.size.height / 2});
    }

    /** Zooms by a factor around the middle of the visible canvas. */
    zoomBy(pageId: string, factor: number) {
        const camera = this.get(pageId);
        this.set(pageId, zoomAt(camera, camera.zoom * factor, {x: this.size.width / 2, y: this.size.height / 2}));
    }

    setZoom(pageId: string, zoom: number) {
        this.set(pageId, zoomAt(this.get(pageId), zoom, {x: this.size.width / 2, y: this.size.height / 2}));
    }

    fit(pageId: string, bounds: Bounds | null) {
        this.set(pageId, bounds ? fitBounds(bounds, this.size) : DEFAULT_CAMERA);
    }

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
}

/** Bounds of a `width`×`height` box centered on `center`, for placing new shapes in view. */
export const centeredBounds = (center: Point, width: number, height: number): Bounds => ({
    x: Math.round(center.x - width / 2),
    y: Math.round(center.y - height / 2),
    width,
    height,
});
