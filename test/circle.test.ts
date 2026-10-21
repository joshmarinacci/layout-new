import {describe, expect, it} from 'vitest';
import {makeCircle} from '../src/reducer';
import {
    circleContains,
    circleHandles,
    dragCircle
} from '../src/shapes/circleGeometry';
import {EditorStore} from '../src/EditorStore';
import {deserializeDocument} from '../src/io/serialization';

const circle = () => makeCircle('circle', {x: 100, y: 200}, 40);

describe('circles', () => {
    it('creates unique serializable circles with independent center data', () => {
        const center = {x: 100, y: 200};
        const shape = makeCircle('new', center, 40);
        center.x = 999;
        expect(shape.components.circle.center).toEqual({x: 100, y: 200});
        expect(shape.id).not.toBe(circle().id);
        const store = new EditorStore();
        store.addShape(shape);
        expect(deserializeDocument(store.toJSON()).shapes).toEqual([shape]);
        store.undo(); expect(store.getSnapshot().document.shapes).toEqual([]);
        store.redo(); expect(store.getSnapshot().document.shapes).toEqual([shape]);
    });
    it('hit tests the circular area including its boundary, excluding bounding-box corners', () => {
        const geometry = circle().components.circle;
        expect(circleContains(geometry, {x: 100, y: 200})).toBe(true);
        expect(circleContains(geometry, {x: 140, y: 200})).toBe(true);
        expect(circleContains(geometry, {x: 140, y: 240})).toBe(false);
        expect(circleContains(geometry, {x: 141, y: 200})).toBe(false);
    });
    it('moves from the gesture baseline without changing radius or mutating input', () => {
        const geometry = circle().components.circle;
        const result = dragCircle(geometry, {x: 110, y: 210}, {x: 80, y: 260}, false);
        expect(result.center).toEqual({x: 70, y: 250});
        expect(result.radius).toBe(40);
        expect(geometry).toEqual(circle().components.circle);
    });
    it.each([0, 1, 2, 3])('resizes from handle %i while preserving center', index => {
        const geometry = circle().components.circle;
        const start = circleHandles(geometry)[index];
        const end = {x: geometry.center.x + (start.x - geometry.center.x) * 2,
            y: geometry.center.y + (start.y - geometry.center.y) * 2};
        expect(dragCircle(geometry, start, end, true)).toEqual({...geometry, radius: 80});
        expect(dragCircle(geometry, start, start, true)).toEqual(geometry);
    });
    it('avoids a jump for off-center handle grabs and clamps radius to zero', () => {
        const geometry = circle().components.circle;
        const start = {x: 145, y: 200};
        expect(dragCircle(geometry, start, start, true).radius).toBe(40);
        expect(dragCircle(geometry, start, {x: 155, y: 200}, true).radius).toBe(50);
        expect(dragCircle(geometry, start, geometry.center, true).radius).toBe(0);
        const zero = {...geometry, radius: 0};
        expect(dragCircle(zero, zero.center, {x: 110, y: 200}, true).radius).toBe(10);
    });
    it.each([false, true])('groups circle gesture updates, undo/redo and cancellation (resize=%s)', resize => {
        const shape = circle();
        const store = new EditorStore({version: 5, images: [], title: 'circles', shapes: [shape], pages: [{id: 'page-1', name: 'Page 1', groups: []}]});
        const original = store.getSnapshot().document;
        const geometry = shape.components.circle;
        const start = circleHandles(geometry)[1];
        store.beginTransaction('circle gesture');
        for (let step = 1; step <= 100; step++) {
            store.updateShape(shape.id, draft => {
                if (draft.type === 'circle') draft.components.circle = dragCircle(geometry, start, {x: start.x + step, y: start.y}, resize);
            });
        }
        store.commitTransaction();
        const final = store.getSnapshot().document;
        expect(final.shapes[0]).not.toEqual(shape);
        store.undo();
        expect(store.getSnapshot().document).toEqual(original);
        expect(store.getSnapshot().canUndo).toBe(false);
        store.redo(); expect(store.getSnapshot().document).toEqual(final);
        store.undo();
        store.beginTransaction('cancel circle gesture');
        store.updateShape(shape.id, draft => {
            if (draft.type === 'circle') draft.components.circle = dragCircle(geometry, start, {x: 300, y: 200}, resize);
        });
        store.cancelTransaction();
        expect(store.getSnapshot().document).toEqual(original);
        expect(store.getSnapshot().canRedo).toBe(true);
    });
    it('rejects invalid circle geometry atomically', () => {
        const shape = circle();
        const store = new EditorStore({version: 5, images: [], title: 'circles', shapes: [shape], pages: [{id: 'page-1', name: 'Page 1', groups: []}]});
        const before = store.getSnapshot();
        for (const radius of [-1, Infinity, NaN]) {
            expect(() => store.updateShape(shape.id, draft => {
                if (draft.type === 'circle') draft.components.circle.radius = radius;
            })).toThrow();
            expect(store.getSnapshot()).toBe(before);
        }
    });
});
