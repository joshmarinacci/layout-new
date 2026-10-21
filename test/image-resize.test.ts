import {describe, expect, it} from 'vitest';
import {PALETTES, resizeImageBounds} from '../src/shapes/pixelImages';
import {EditorStore} from '../src/EditorStore';

describe('image resizing', () => {
    const bounds = {x: 10, y: 20, width: 100, height: 50};
    it('resizes freely without Shift', () => {
        expect(resizeImageBounds(bounds, 20, 30, false)).toEqual({...bounds, width: 120, height: 80});
    });
    it.each([[50, 10, 150, 75], [10, 50, 200, 100], [-50, -10, 50, 25]])(
        'locks the initial aspect ratio for drag %s,%s', (dx, dy, width, height) => {
            expect(resizeImageBounds(bounds, dx, dy, true)).toEqual({...bounds, width, height});
        });
    it('clamps both dimensions while preserving the ratio when dragged past the origin', () => {
        expect(resizeImageBounds(bounds, -200, -100, true)).toEqual({...bounds, width: 2, height: 1});
        expect(resizeImageBounds({...bounds, width: 50, height: 100}, -200, -100, true))
            .toEqual({...bounds, width: 1, height: 2});
    });
    it('can release Shift during a gesture and handles zero-size bounds without NaN', () => {
        resizeImageBounds(bounds, 20, 30, true);
        expect(resizeImageBounds(bounds, 20, 30, false)).toEqual({...bounds, width: 120, height: 80});
        expect(bounds).toEqual({x: 10, y: 20, width: 100, height: 50});
        expect(resizeImageBounds({...bounds, width: 0}, 20, 30, true)).toEqual({...bounds, width: 20, height: 80});
    });
    it('undoes a constrained resize without changing shared pixel data', () => {
        const store = new EditorStore();
        const id = store.createPixelImage(16, 16, PALETTES['PICO-8']);
        store.linkImageShape(id);
        const before = store.getSnapshot().document;
        store.beginTransaction('resize');
        store.updateShape(id, shape => {
            if (shape.type === 'pixel-image') shape.components.rect.bounds = resizeImageBounds(shape.components.rect.bounds, 50, 20, true);
        });
        store.commitTransaction();
        const after = store.getSnapshot().document;
        expect(after.images).toEqual(before.images);
        expect(after.shapes[1]).toEqual(before.shapes[1]);
        expect(after.shapes[0]).not.toEqual(before.shapes[0]);
        store.undo(); expect(store.getSnapshot().document).toEqual(before);
        store.redo(); expect(store.getSnapshot().document).toEqual(after);
    });
});
