import {describe, expect, it, vi} from 'vitest';
import {
    CameraStore,
    MAX_ZOOM,
    MIN_ZOOM,
    centeredBounds,
    clampZoom,
    documentToScreen,
    fitBounds,
    intersects,
    panBy,
    screenToDocument,
    unionBounds,
    visibleBounds,
    wheelZoomFactor,
    zoomAt,
} from '../src/editor/camera';

describe('camera math', () => {
    const camera = {x: -200, y: 300, zoom: 2};

    it('converts between screen and document coordinates', () => {
        expect(screenToDocument(camera, {x: 0, y: 0})).toEqual({x: -200, y: 300});
        expect(screenToDocument(camera, {x: 100, y: 50})).toEqual({x: -150, y: 325});
        expect(documentToScreen(camera, {x: -150, y: 325})).toEqual({x: 100, y: 50});
    });

    it('reaches far from the origin in every direction', () => {
        const far = {x: -1_000_000, y: 2_500_000, zoom: 0.5};
        const point = screenToDocument(far, {x: 40, y: 80});
        expect(point).toEqual({x: -999_920, y: 2_500_160});
        expect(documentToScreen(far, point)).toEqual({x: 40, y: 80});
    });

    it('keeps the document point under the cursor fixed while zooming', () => {
        const anchor = {x: 320, y: 180};
        const before = screenToDocument(camera, anchor);
        for (const zoom of [0.05, 0.5, 3, 40]) {
            const next = zoomAt(camera, zoom, anchor);
            expect(next.zoom).toBe(zoom);
            const after = screenToDocument(next, anchor);
            expect(after.x).toBeCloseTo(before.x, 9);
            expect(after.y).toBeCloseTo(before.y, 9);
        }
    });

    it('limits zoom to 2%–6400%', () => {
        expect(MIN_ZOOM).toBe(0.02);
        expect(MAX_ZOOM).toBe(64);
        expect(clampZoom(0.001)).toBe(0.02);
        expect(clampZoom(1000)).toBe(64);
        expect(zoomAt(camera, 0, {x: 0, y: 0}).zoom).toBe(0.02);
    });

    it('pans by screen distance regardless of zoom', () => {
        expect(panBy(camera, 100, -40)).toEqual({x: -150, y: 280, zoom: 2});
        expect(panBy({x: 0, y: 0, zoom: 0.25}, 100, 0).x).toBe(400);
    });

    it('reports the visible document area', () => {
        expect(visibleBounds(camera, {width: 800, height: 600})).toEqual({x: -200, y: 300, width: 400, height: 300});
    });

    it('fits bounds in the viewport, centered, without zooming past 100%', () => {
        const size = {width: 1000, height: 600};
        const big = fitBounds({x: -5000, y: -5000, width: 10000, height: 4000}, size, 50);
        expect(big.zoom).toBeCloseTo(0.09);
        const center = screenToDocument(big, {x: 500, y: 300});
        expect(center.x).toBeCloseTo(0);
        expect(center.y).toBeCloseTo(-3000);
        expect(fitBounds({x: 10, y: 10, width: 20, height: 20}, size).zoom).toBe(1);
    });

    it('measures overlap and unions of bounds', () => {
        expect(intersects({x: 0, y: 0, width: 10, height: 10}, {x: 10, y: 10, width: 5, height: 5})).toBe(true);
        expect(intersects({x: 0, y: 0, width: 10, height: 10}, {x: 11, y: 0, width: 5, height: 5})).toBe(false);
        expect(unionBounds([])).toBeNull();
        expect(
            unionBounds([
                {x: -10, y: 5, width: 10, height: 10},
                {x: 100, y: -50, width: 20, height: 20},
            ]),
        ).toEqual({x: -10, y: -50, width: 130, height: 65});
    });

    it('centers new shape bounds on a point', () => {
        expect(centeredBounds({x: 1000.4, y: -500}, 100, 80)).toEqual({x: 950, y: -540, width: 100, height: 80});
    });
});

describe('CameraStore', () => {
    it('keeps a separate camera for each page, starting at the origin', () => {
        const store = new CameraStore();
        expect(store.get('page-1')).toEqual({x: 0, y: 0, zoom: 1});
        store.set('page-1', {x: 50, y: 60, zoom: 2});
        expect(store.get('page-1')).toEqual({x: 50, y: 60, zoom: 2});
        expect(store.get('page-2')).toEqual({x: 0, y: 0, zoom: 1});
    });

    it('notifies subscribers only when the camera changes', () => {
        const store = new CameraStore();
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        store.set('p', {x: 0, y: 0, zoom: 1});
        expect(listener).not.toHaveBeenCalled();
        store.set('p', {x: 1, y: 0, zoom: 1});
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        store.set('p', {x: 2, y: 0, zoom: 1});
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('zooms around the middle of the viewport and reports the view center', () => {
        const store = new CameraStore();
        store.setViewport({width: 800, height: 600});
        store.set('p', {x: 1000, y: 2000, zoom: 1});
        expect(store.center('p')).toEqual({x: 1400, y: 2300});
        store.zoomBy('p', 2);
        expect(store.get('p').zoom).toBe(2);
        expect(store.center('p')).toEqual({x: 1400, y: 2300});
        store.setZoom('p', 1000);
        expect(store.get('p').zoom).toBe(64);
    });

    it('fits content, or returns to the origin for an empty page', () => {
        const store = new CameraStore();
        store.setViewport({width: 800, height: 600});
        store.fit('p', {x: 5000, y: 5000, width: 100, height: 100});
        expect(store.center('p')).toEqual({x: 5050, y: 5050});
        store.fit('p', null);
        expect(store.get('p')).toEqual({x: 0, y: 0, zoom: 1});
    });
});

describe('wheel zoom', () => {
    it('follows a Chromium trackpad pinch exactly', () => {
        // Chromium sends deltaY = -100·ln(scale change) for each step of a pinch.
        for (const scale of [0.7, 0.9, 1.02, 1.3, 1.6]) {
            expect(wheelZoomFactor(-100 * Math.log(scale), {pinch: true})).toBeCloseTo(scale, 10);
        }
    });

    it('caps a Ctrl+mouse-wheel notch to a moderate step', () => {
        expect(wheelZoomFactor(-100, {pinch: true})).toBeCloseTo(Math.exp(0.5));
        expect(wheelZoomFactor(100, {pinch: true})).toBeCloseTo(Math.exp(-0.5));
    });

    it('zooms more gently for ⌘+scroll', () => {
        expect(wheelZoomFactor(-100, {pinch: false})).toBeCloseTo(Math.exp(0.2));
        expect(wheelZoomFactor(0, {pinch: false})).toBe(1);
    });
});
