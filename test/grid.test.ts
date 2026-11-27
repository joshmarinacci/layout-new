import {describe, expect, it} from 'vitest';
import {
    DEFAULT_GRID,
    effectiveGrid,
    gridDrawStep,
    MIN_GRID_SCREEN_SPACING,
    snapMoveDelta,
    snapRadius,
    snapResizeDelta,
    snapValue,
} from '../src/model/grid';
import {EditorStore, emptyDocument} from '../src/model/EditorStore';
import {deserializeDocument, serializeDocument, validateDocument} from '../src/io/serialization';
import {makeExampleDocument} from '../src/model/exampleDocument';

describe('grid snapping math', () => {
    it('rounds values to the nearest grid line', () => {
        expect(snapValue(14, 10)).toBe(10);
        expect(snapValue(15, 10)).toBe(20);
        expect(snapValue(-14, 10)).toBe(-10);
        expect(snapValue(7, 2.5)).toBe(7.5);
    });

    it("snaps a moved group's top-left corner and keeps the shapes' spacing", () => {
        const bounds = [
            {x: 3, y: 7, width: 20, height: 20},
            {x: 40, y: 2, width: 5, height: 5},
        ];
        // Corner is (3, 2); dragging by (12, 4) would put it at (15, 6), which snaps to (20, 10).
        expect(snapMoveDelta(bounds, 12, 4, 10)).toEqual({dx: 17, dy: 8});
        expect(snapMoveDelta([], 12, 4, 10)).toEqual({dx: 12, dy: 4});
    });

    it('snaps the dragged bottom-right corner when resizing', () => {
        const bounds = {x: 10, y: 10, width: 33, height: 20};
        // Corner is (43, 30); dragging by (4, 6) would put it at (47, 36), which snaps to (50, 40).
        expect(snapResizeDelta(bounds, 4, 6, 10)).toEqual({dx: 7, dy: 10});
    });

    it('snaps circle diameters to whole grid cells, never below one cell', () => {
        expect(snapRadius(12, 10)).toBe(10);
        expect(snapRadius(13, 10)).toBe(15);
        expect(snapRadius(0, 10)).toBe(5);
    });

    it('draws only real grid lines, thinned so they stay legible on screen', () => {
        expect(gridDrawStep(10, 1)).toBe(10);
        expect(gridDrawStep(10, 0.5)).toBe(20);
        expect(gridDrawStep(10, 0.25)).toBe(50);
        expect(gridDrawStep(10, 0.02)).toBe(500);
        expect(gridDrawStep(10, 64)).toBe(10);
        for (const zoom of [0.02, 0.05, 0.1, 0.33, 0.5, 1, 2, 64])
            for (const size of [1, 5, 10, 24, 100]) {
                const step = gridDrawStep(size, zoom);
                expect(step * zoom).toBeGreaterThanOrEqual(MIN_GRID_SCREEN_SPACING);
                expect((step / size) % 1).toBe(0);
            }
    });
});

describe('grid settings in the document', () => {
    it('defaults to a 10 unit grid drawn as lines', () => {
        expect(emptyDocument().settings.grid).toEqual({size: 10, style: 'lines'});
        expect(DEFAULT_GRID).toEqual({size: 10, style: 'lines'});
    });

    it('uses a page override when present, else the document grid', () => {
        const document = emptyDocument();
        document.pages.push({id: 'p2', name: 'Two', groups: [], grid: {size: 25, style: 'dots'}});
        expect(effectiveGrid(document, 'page_1')).toEqual({size: 10, style: 'lines'});
        expect(effectiveGrid(document, 'p2')).toEqual({size: 25, style: 'dots'});
    });

    it('migrates version 10 documents to the default grid with no page overrides', () => {
        const v10: Record<string, unknown> = {...makeExampleDocument(), version: 10};
        delete v10.settings;
        const loaded = deserializeDocument(JSON.stringify(v10));
        expect(loaded.version).toBe(11);
        expect(loaded.settings).toEqual({grid: {size: 10, style: 'lines'}});
        expect(loaded.pages.every(page => page.grid === undefined)).toBe(true);
    });

    it('round trips document and page grids', () => {
        const store = new EditorStore(makeExampleDocument());
        store.setDocumentGrid({size: 8, style: 'dots'});
        store.setPageGrid('page_1', {size: 32, style: 'hidden'});
        const loaded = deserializeDocument(store.toJSON());
        expect(loaded.settings.grid).toEqual({size: 8, style: 'dots'});
        expect(loaded.pages[0].grid).toEqual({size: 32, style: 'hidden'});
    });

    it.each([
        ['a zero size', {size: 0, style: 'lines'}],
        ['a huge size', {size: 5000, style: 'lines'}],
        ['an unknown style', {size: 10, style: 'stripes'}],
        ['an extra field', {size: 10, style: 'lines', color: 'red'}],
    ])('rejects %s', (_, grid) => {
        const document = {...makeExampleDocument(), settings: {grid}};
        expect(() => validateDocument(document)).toThrow();
        const page = {...makeExampleDocument(), pages: [{id: 'page_1', name: 'Page 1', groups: [], grid}]};
        expect(() => validateDocument(page)).toThrow();
    });

    it('rejects page grids in documents older than version 11', () => {
        const v10 = {...makeExampleDocument(), version: 10} as Record<string, unknown>;
        delete v10.settings;
        v10.pages = [{id: 'page_1', name: 'Page 1', groups: [], grid: {size: 10, style: 'lines'}}];
        expect(() => deserializeDocument(JSON.stringify(v10))).toThrow(/Expected fields/);
    });
});

describe('editing grid settings', () => {
    it('changes the document grid and page overrides as undoable edits', () => {
        const store = new EditorStore(makeExampleDocument());
        store.setDocumentGrid({size: 20, style: 'dots'});
        store.setPageGrid('page_1', {size: 5, style: 'lines'});
        expect(effectiveGrid(store.getSnapshot().document, 'page_1')).toEqual({size: 5, style: 'lines'});
        store.setPageGrid('page_1', null);
        expect(store.getSnapshot().document.pages[0].grid).toBeUndefined();
        expect(effectiveGrid(store.getSnapshot().document, 'page_1')).toEqual({size: 20, style: 'dots'});
        store.undo();
        expect(store.getSnapshot().document.pages[0].grid).toEqual({size: 5, style: 'lines'});
        store.undo();
        store.undo();
        expect(store.getSnapshot().document.settings.grid).toEqual(DEFAULT_GRID);
    });

    it('keeps settings changed inside a transaction as one undo step', () => {
        const store = new EditorStore(makeExampleDocument());
        store.beginTransaction('Document settings');
        store.setDocumentGrid({size: 12, style: 'lines'});
        store.setDocumentGrid({size: 16, style: 'dots'});
        store.setPageGrid('page_1', {size: 4, style: 'hidden'});
        store.commitTransaction();
        expect(store.getSnapshot().document.settings.grid).toEqual({size: 16, style: 'dots'});
        expect(store.getSnapshot().document.pages[0].grid).toEqual({size: 4, style: 'hidden'});
        store.undo();
        expect(store.getSnapshot().document.settings.grid).toEqual(DEFAULT_GRID);
        expect(store.getSnapshot().document.pages[0].grid).toBeUndefined();
        store.redo();
        expect(store.getSnapshot().document.settings.grid).toEqual({size: 16, style: 'dots'});
    });

    it('rejects invalid sizes without changing the document', () => {
        const store = new EditorStore(makeExampleDocument());
        expect(() => store.setDocumentGrid({size: 0, style: 'lines'})).toThrow();
        expect(store.getSnapshot().document.settings.grid).toEqual(DEFAULT_GRID);
        expect(serializeDocument(store.getSnapshot().document)).toContain('"settings"');
    });
});
