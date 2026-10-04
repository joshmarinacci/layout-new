import {describe, expect, it, vi} from 'vitest';
import {EditorStore} from '../src/EditorStore';
import {makeExampleDocument} from '../src/exampleDocument';

// Opening the same document twice deliberately reuses shape IDs and input objects.
function setup() {
    const document = makeExampleDocument();
    return {document, a: new EditorStore(document), b: new EditorStore(document)};
}

describe('independent document stores', () => {
    it('isolates nested edits, deletion, selection, and subscriptions even with identical shape IDs', () => {
        const {document, a, b} = setup();
        const [rectangle, circle] = document.shapes;
        b.select(circle.id);
        const untouched = b.getSnapshot();
        const listener = vi.fn();
        b.subscribe(listener);

        a.select(rectangle.id);
        a.updateShape(rectangle.id, shape => {
            shape.components.fill.fill.color = '#abcdef';
            if (shape.type === 'rectangle') shape.components.rect.bounds.x = 500;
        });
        a.removeShape(circle.id);
        a.setTitle('Document A');

        expect(a.getSnapshot().document.shapes).toHaveLength(1);
        expect(a.getSnapshot().selectedId).toBe(rectangle.id);
        expect(b.getSnapshot()).toBe(untouched);
        expect(b.getSnapshot().document).toEqual(document);
        expect(b.getSnapshot().selectedId).toBe(circle.id);
        expect(listener).not.toHaveBeenCalled();
        expect(document).toEqual(makeExampleDocument());
    });

    it('keeps interleaved undo/redo and history branches independent', () => {
        const {document, a, b} = setup();
        a.setTitle('A1');
        b.setTitle('B1');
        a.setTitle('A2');
        b.setTitle('B2');
        a.undo();
        b.undo();
        const bWithRedo = b.getSnapshot();
        a.setTitle('A branch');
        expect(a.getSnapshot().canRedo).toBe(false);
        expect(b.getSnapshot()).toBe(bWithRedo);
        expect(b.getSnapshot().canRedo).toBe(true);

        b.redo();
        expect(b.getSnapshot().document.title).toBe('B2');
        expect(a.getSnapshot().document.title).toBe('A branch');
        a.undo();
        expect(a.getSnapshot().document.title).toBe('A1');
        a.undo();
        expect(a.getSnapshot().document).toEqual(document);
        expect(a.getSnapshot().canUndo).toBe(false);
        expect(b.getSnapshot().document.title).toBe('B2');
        b.undo();
        b.undo();
        expect(b.getSnapshot().document).toEqual(document);
        expect(b.getSnapshot().canUndo).toBe(false);
        a.redo();
        expect(a.getSnapshot().document.title).toBe('A1');
        expect(b.getSnapshot().document).toEqual(document);
    });

    it('allows simultaneous transactions and isolates commit from cancellation', () => {
        const {document, a, b} = setup();
        a.beginTransaction('A gesture');
        b.beginTransaction('B gesture');
        a.setTitle('A committed');
        b.removeShape(document.shapes[0].id);
        const bDuringGesture = b.getSnapshot();
        a.commitTransaction();
        expect(b.getSnapshot()).toBe(bDuringGesture);
        expect(b.getSnapshot().transactionActive).toBe(true);
        const aCommitted = a.getSnapshot();
        b.cancelTransaction();
        expect(a.getSnapshot()).toBe(aCommitted);
        expect(b.getSnapshot().document).toEqual(document);
        expect(b.getSnapshot().canUndo).toBe(false);
        a.undo();
        expect(a.getSnapshot().document).toEqual(document);
        a.redo();
        expect(a.getSnapshot().document.title).toBe('A committed');
        expect(b.getSnapshot().document).toEqual(document);
    });

    it('loads and resets one store without changing another store or its redo history', () => {
        const {document, a, b} = setup();
        a.select(document.shapes[0].id);
        a.setTitle('A edited');
        b.select(document.shapes[1].id);
        b.setTitle('B edited');
        b.undo();
        const untouched = b.getSnapshot();
        const listener = vi.fn();
        b.subscribe(listener);
        const loaded = {...makeExampleDocument(), title: 'Loaded document'};
        a.loadJSON(JSON.stringify(loaded));
        expect(a.getSnapshot()).toMatchObject({document: loaded, selectedId: null, canUndo: false, canRedo: false});
        expect(b.getSnapshot()).toBe(untouched);
        expect(listener).not.toHaveBeenCalled();
        b.redo();
        expect(b.getSnapshot().document.title).toBe('B edited');
        expect(b.getSnapshot().selectedId).toBe(document.shapes[1].id);
        expect(a.getSnapshot().document).toEqual(loaded);
    });

    it('opening another copy from JSON preserves existing edits, selection, and history', () => {
        const {document, a, b} = setup();
        a.setTitle('A edited');
        a.select(document.shapes[0].id);
        b.setTitle('B edited');
        b.undo();
        const beforeA = a.getSnapshot();
        const beforeB = b.getSnapshot();
        const opened = new EditorStore();
        opened.loadJSON(a.toJSON());
        opened.updateShape(document.shapes[0].id, shape => { shape.name = 'Only in new copy'; });
        expect(opened.getSnapshot().document.shapes[0].name).toBe('Only in new copy');
        expect(a.getSnapshot()).toBe(beforeA);
        expect(b.getSnapshot()).toBe(beforeB);
        a.undo();
        b.redo();
        expect(a.getSnapshot().document.title).toBe(document.title);
        expect(b.getSnapshot().document.title).toBe('B edited');
        expect(opened.getSnapshot().document.title).toBe('A edited');
    });

    it('rejects invalid loads without changing either open document', () => {
        const {a, b} = setup();
        a.setTitle('A edited');
        b.setTitle('B edited');
        const beforeA = a.getSnapshot();
        const beforeB = b.getSnapshot();
        expect(() => a.loadJSON('{')).toThrow();
        expect(() => a.loadJSON('{"version":99,"title":"bad","shapes":[]}')).toThrow();
        expect(a.getSnapshot()).toBe(beforeA);
        expect(b.getSnapshot()).toBe(beforeB);
    });
});
