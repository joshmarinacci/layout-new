import {describe, expect, it} from 'vitest';
import {EditorStore, emptyDocument} from '../src/model/EditorStore';
import {makeCircle, makeRect} from '../src/model/reducer';
import {makeVector} from '../src/shapes/vectorNetworks';
import {unionBounds} from '../src/editor/camera';
import {
    EMPTY_PAGE_SIZE,
    PAGE_EXPORT_MARGIN,
    artworkBounds,
    artworkSvg,
    pageExportBounds,
} from '../src/io/exportArtwork';
import {makeTab, NewCircleCommand, NewRectCommand, NewTextCommand, viewCenter} from '../src/commands';
import type {CommandContext} from '../src/commands';
import {selectionBounds} from '../src/editor/VisualEditor';
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

describe('imports, pastes and linked copies on an infinite canvas', () => {
    const view = {x: 10_000, y: -5_000, width: 800, height: 600};
    const viewMiddle = {x: 10_400, y: -4_700};
    const middleOf = (b: {x: number; y: number; width: number; height: number}) => ({
        x: b.x + b.width / 2,
        y: b.y + b.height / 2,
    });

    it('centers imported PNG images on the view', () => {
        const store = new EditorStore(emptyDocument());
        const source = {width: 4, height: 2, rgba: new Uint8ClampedArray(4 * 2 * 4).fill(255)};
        const [id] = store.importPixelImages(source, 'Imported', undefined, null, viewMiddle);
        const shape = store.getSnapshot().document.shapes.find(item => item.id === id)!;
        expect(shape.type === 'pixel-image' && middleOf(shape.components.rect.bounds)).toEqual(viewMiddle);
    });

    it('centers imported SVG shapes on the view, keeping their layout', () => {
        const store = new EditorStore(emptyDocument());
        const page = store.getSnapshot().selectedPageId;
        const shapes = [makeVector(), makeVector()];
        shapes[1].components.network.origin.x += 300;
        const ids = store.importVectorNetworks(shapes, page, 'Logo', viewMiddle);
        const imported = store.getSnapshot().document.shapes.filter(shape => ids.includes(shape.id));
        const box = unionBounds(imported.map(selectionBounds))!;
        expect(Math.abs(middleOf(box).x - viewMiddle.x)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(middleOf(box).y - viewMiddle.y)).toBeLessThanOrEqual(0.5);
        const [a, b] = imported.map(shape => shape.type === 'vector' && shape.components.network.origin.x);
        expect(Number(b) - Number(a)).toBe(300);
    });

    it('pastes beside the originals when they are in view, and into view when they are not', () => {
        const store = new EditorStore(emptyDocument());
        const rect = makeRect('Rect', {x: 10_100, y: -4_900, width: 100, height: 80});
        expect(store.pasteShapes([rect], [], [], view)).toHaveLength(1);
        expect(store.getSnapshot().document.shapes.at(-1)).toMatchObject({
            components: {rect: {bounds: {x: 10_120, y: -4_880}}},
        });
        const far = makeRect('Far', {x: 0, y: 0, width: 100, height: 80});
        store.pasteShapes([far], [], [], view);
        const pasted = store.getSnapshot().document.shapes.at(-1)!;
        expect(pasted.type === 'rectangle' && middleOf(pasted.components.rect.bounds)).toEqual(viewMiddle);
    });

    it('puts a linked copy beside its image, or in view if that spot is out of sight', () => {
        const store = new EditorStore(emptyDocument());
        const id = store.createPixelImage(8, 8, ['#000000'], {x: 0, y: 0});
        const besides = store.linkImageShape(id, {x: -100, y: -100, width: 800, height: 600});
        const bounds = (shapeId: string) => {
            const shape = store.getSnapshot().document.shapes.find(item => item.id === shapeId)!;
            return shape.type === 'pixel-image' ? shape.components.rect.bounds : null;
        };
        expect(bounds(besides)).toMatchObject({x: bounds(id)!.x + 20, y: bounds(id)!.y + 20});
        const inView = store.linkImageShape(id, view);
        expect(middleOf(bounds(inView)!)).toEqual(viewMiddle);
    });
});
