import {describe, expect, it} from 'vitest';
import {EditorStore, emptyDocument} from '../src/model/EditorStore';
import {makeCircle, makeRect} from '../src/model/reducer';
import {
    EMPTY_PAGE_SIZE,
    PAGE_EXPORT_MARGIN,
    artworkBounds,
    artworkSvg,
    pageExportBounds,
} from '../src/io/exportArtwork';
import {makeTab, NewCircleCommand, NewRectCommand, NewTextCommand, viewCenter} from '../src/commands';
import type {CommandContext} from '../src/commands';
import {gridStep} from '../src/editor/VisualEditor';
import type {Shape} from '../src/model/types';

const viewBox = (svg: string) =>
    svg
        .match(/viewBox="([^"]+)"/)?.[1]
        .split(' ')
        .map(Number);

describe('page export on an infinite canvas', () => {
    const near = makeRect('Near', {x: 10, y: 20, width: 100, height: 50});
    const far = makeRect('Far', {x: -40_000, y: 90_000, width: 200, height: 100});

    it('covers all of the page content, including far from the origin, plus a margin', () => {
        const bounds = pageExportBounds([near, far]);
        const stroke = near.components.stroke.width / 2;
        expect(bounds.x).toBe(Math.floor(-40_000 - stroke - PAGE_EXPORT_MARGIN));
        expect(bounds.y).toBe(Math.floor(20 - stroke - PAGE_EXPORT_MARGIN));
        expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(110 + stroke + PAGE_EXPORT_MARGIN);
        expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(90_100 + stroke + PAGE_EXPORT_MARGIN);
    });

    it('is no longer limited to the old 1024×1024 page', () => {
        const svg = artworkSvg(emptyDocument(), [far], true);
        const [x, y, width, height] = viewBox(svg)!;
        expect(x).toBeLessThan(-40_000);
        expect(y).toBeGreaterThan(89_000);
        expect(width).toBeGreaterThan(200);
        expect(height).toBeGreaterThan(100);
        // The white background covers the exported area, wherever it is.
        expect(svg).toContain(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff"/>`);
        expect(svg).toContain('x="-40000"');
    });

    it('exports an empty page as a small blank square', () => {
        expect(pageExportBounds([])).toEqual({x: 0, y: 0, width: EMPTY_PAGE_SIZE, height: EMPTY_PAGE_SIZE});
        expect(viewBox(artworkSvg(emptyDocument(), [], true))).toEqual([0, 0, EMPTY_PAGE_SIZE, EMPTY_PAGE_SIZE]);
        expect(() => artworkSvg(emptyDocument(), [])).toThrow('There is no artwork to export');
    });

    it('keeps selection exports tight around the artwork', () => {
        const circle = makeCircle('Circle', {x: -500, y: -500}, 40);
        const bounds = artworkBounds([circle])!;
        const stroke = circle.components.stroke.width / 2;
        expect(bounds).toEqual({x: -540 - stroke, y: -540 - stroke, width: 80 + stroke * 2, height: 80 + stroke * 2});
        expect(viewBox(artworkSvg(emptyDocument(), [circle]))).toEqual([
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
        ]);
        expect(artworkBounds([])).toBeNull();
    });
});

function contextAt(center: {x: number; y: number} | null) {
    const store = new EditorStore(emptyDocument());
    const tab = makeTab(store.getSnapshot().document);
    tab.store = store;
    if (center) {
        tab.camera.setViewport({width: 800, height: 600});
        tab.camera.set(store.getSnapshot().selectedPageId, {x: center.x - 400, y: center.y - 300, zoom: 1});
    }
    const ctx = {
        store,
        get state() {
            return store.getSnapshot();
        },
        workspace: {tabs: [tab], activeId: tab.id},
    } as unknown as CommandContext;
    return {store, ctx};
}

const centerOf = (shape: Shape) => {
    if (shape.type === 'circle') return shape.components.circle.center;
    if (shape.type === 'rectangle' || shape.type === 'text') {
        const b = shape.components.rect.bounds;
        return {x: b.x + b.width / 2, y: b.y + b.height / 2};
    }
    throw new Error(`Unexpected ${shape.type}`);
};

describe('new shapes on an infinite canvas', () => {
    it.each([NewRectCommand, NewCircleCommand, NewTextCommand])('$id is centered on the visible canvas', command => {
        const {store, ctx} = contextAt({x: 25_000, y: -8_000});
        command.run(ctx);
        const shape = store.getSnapshot().document.shapes.at(-1)!;
        expect(centerOf(shape)).toEqual({x: 25_000, y: -8_000});
        expect(store.getSnapshot().selectedIds).toEqual([shape.id]);
    });

    it('falls back to near the origin before the canvas has been measured', () => {
        const {ctx} = contextAt(null);
        expect(viewCenter(ctx)).toEqual({x: 100, y: 90});
        NewRectCommand.run(ctx);
        expect(ctx.store.getSnapshot().document.shapes.at(-1)).toMatchObject({
            components: {rect: {bounds: {x: 50, y: 50, width: 100, height: 80}}},
        });
    });

    it('creates pixel images centered on a given point', () => {
        const store = new EditorStore(emptyDocument());
        const id = store.createPixelImage(16, 16, ['#000000', '#ffffff'], {x: -3000, y: 4000});
        const shape = store.getSnapshot().document.shapes.find(item => item.id === id);
        expect(shape?.type === 'pixel-image' && shape.components.rect.bounds).toEqual({
            x: -3064,
            y: 3936,
            width: 128,
            height: 128,
        });
    });
});

describe('canvas grid', () => {
    it('keeps grid lines 24–96 screen pixels apart at every zoom level', () => {
        for (const zoom of [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 16, 64]) {
            const spacing = gridStep(zoom) * zoom;
            const step = gridStep(zoom);
            if (step > 1) expect(spacing).toBeGreaterThanOrEqual(24);
            expect(spacing).toBeLessThanOrEqual(96);
        }
        expect(gridStep(1)).toBe(64);
        expect(gridStep(64)).toBe(1);
    });
});
