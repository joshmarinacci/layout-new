import {describe, expect, it, vi} from 'vitest';
import {EditorStore, emptyDocument} from '../src/model/EditorStore';
import {makeRect} from '../src/model/reducer';
import {deserializeDocument, serializeDocument} from '../src/io/serialization';
import {makeExampleDocument} from '../src/model/exampleDocument';

function setup() {
    const first = makeRect('first', {x: 0, y: 0, width: 100, height: 100});
    const second = makeRect('second', {x: 200, y: 0, width: 100, height: 100});
    const document = {...emptyDocument(), shapes: [first, second]};
    return {store: new EditorStore(document), document, first, second};
}
describe('EditorStore', () => {
    it('edits the second shape, preserves old snapshots and resolves selection by ID', () => {
        const {store, document, first, second} = setup();
        const old = store.getSnapshot(); store.select(second.id);
        store.updateShape(second.id, s => { s.name = 'edited'; if (s.type === 'rectangle' || s.type === 'circle' || s.type === 'oval') s.components.fill.fill.color = '#123456'; });
        expect(store.getSnapshot().document.shapes.map(s => s.name)).toEqual(['first', 'edited']);
        expect(old.document.shapes[1].name).toBe('second');
        expect(document.shapes[1].name).toBe('second');
        expect(store.getSnapshot().document.shapes[0].id).toBe(first.id);
        expect(store.getSnapshot().selectedId).toBe(second.id);
        expect(() => { store.getSnapshot().document.shapes[1].name = 'outside'; }).toThrow();
        store.undo(); expect(store.getSnapshot().document).toEqual(document);
        store.redo(); expect(store.getSnapshot().document.shapes[1].name).toBe('edited');
    });
    it('publishes stable snapshots only on changes and unsubscribes', () => {
        const {store} = setup(); const initial = store.getSnapshot(); const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        expect(store.getSnapshot()).toBe(initial);
        store.setTitle(initial.document.title); expect(listener).not.toHaveBeenCalled();
        store.setTitle('updated'); expect(listener).toHaveBeenCalledTimes(1);
        expect(store.getSnapshot()).not.toBe(initial);
        unsubscribe(); store.undo(); expect(listener).toHaveBeenCalledTimes(1);
    });
    it('adds/deletes and replays history in order; selection is transient', () => {
        const {store, second} = setup();
        const extra = makeRect('extra', {x: 1, y: 2, width: 3, height: 4});
        store.addShape(extra); store.select(second.id); store.removeShape(second.id);
        expect(store.getSnapshot().selectedId).toBeNull();
        store.undo(); expect(store.getSnapshot().document.shapes.map(s => s.name)).toEqual(['first', 'second', 'extra']);
        store.undo(); expect(store.getSnapshot().document.shapes).toHaveLength(2);
        store.redo(); store.redo(); expect(store.getSnapshot().document.shapes.map(s => s.name)).toEqual(['first', 'extra']);
    });
    it('groups 200 drag updates and another property into one history entry', () => {
        const {store, first, document} = setup();
        store.beginTransaction('drag');
        for (let x = 1; x <= 200; x++) store.updateShape(first.id, s => { if (s.type === 'rectangle') s.components.rect.bounds.x = x; });
        store.setTitle('moved');
        expect(store.getSnapshot().document.title).toBe('moved');
        expect(store.getSnapshot().canUndo).toBe(false);
        store.commitTransaction(); const final = store.getSnapshot().document;
        store.undo(); expect(store.getSnapshot().document).toEqual(document); expect(store.getSnapshot().canUndo).toBe(false);
        store.redo(); expect(store.getSnapshot().document).toEqual(final);
    });
    it('handles grouped add/remove/reorder and cancellation', () => {
        const {store, document, first} = setup(); store.select(first.id);
        store.beginTransaction('batch');
        store.removeShape(first.id); store.addShape(makeRect('new', {x: 1, y: 2, width: 3, height: 4}));
        store.edit('reorder', d => { d.shapes.reverse(); }); store.commitTransaction();
        const final = store.getSnapshot().document; store.undo(); expect(store.getSnapshot().document).toEqual(document);
        store.redo(); expect(store.getSnapshot().document).toEqual(final);
        store.select(final.shapes[0].id); store.beginTransaction('cancel'); store.removeShape(final.shapes[0].id); store.cancelTransaction();
        expect(store.getSnapshot().document).toEqual(final); expect(store.getSnapshot().selectedId).toBe(final.shapes[0].id);
    });
    it('preserves redo for no-ops and cancellation, invalidates it for committed edits', () => {
        const {store} = setup(); store.setTitle('new'); store.undo();
        store.beginTransaction('back and forth'); store.setTitle('temporary'); store.setTitle('Untitled'); store.commitTransaction();
        expect(store.getSnapshot().canRedo).toBe(true); expect(store.getSnapshot().canUndo).toBe(false);
        store.beginTransaction('cancel'); store.setTitle('temporary'); store.cancelTransaction();
        expect(store.getSnapshot().canRedo).toBe(true);
        store.setTitle('branch'); expect(store.getSnapshot().canRedo).toBe(false);
    });
    it('rejects invalid edits atomically and disallows conflicting transactions', () => {
        const {store, first} = setup(); const initial = store.getSnapshot();
        expect(() => store.addShape(first)).toThrow();
        expect(() => store.updateShape('missing', s => { s.name = 'no'; })).toThrow();
        expect(() => store.updateShape(first.id, s => { s.id = 'changed'; })).toThrow();
        expect(() => store.updateShape(first.id, s => { if (s.type === 'rectangle') s.components.rect.bounds.width = -1; })).toThrow();
        expect(store.getSnapshot()).toBe(initial);
        store.beginTransaction('active');
        expect(() => store.beginTransaction('nested')).toThrow(); expect(() => store.undo()).toThrow(); expect(() => store.redo()).toThrow();
        expect(() => store.replaceDocument(emptyDocument())).toThrow(); store.cancelTransaction();
    });
    it('bounds history and clones inputs', () => {
        const input = emptyDocument(); const store = new EditorStore(input, 2); input.title = 'external';
        expect(store.getSnapshot().document.title).toBe('Untitled');
        store.setTitle('1'); store.setTitle('2'); store.setTitle('3'); store.undo(); store.undo(); store.undo();
        expect(store.getSnapshot().document.title).toBe('1');
    });
});
describe('serialization', () => {
    it('round trips all supported shape variants with no editor state', () => {
        const document = makeExampleDocument(); const rectangle = makeRect('oval', {x: 2, y: 4, width: 80, height: 40});
        document.shapes.push({id: 'oval', name: 'oval', type: 'oval', pageId: 'page_1', components: {oval: rectangle.components.rect, fill: rectangle.components.fill, stroke: rectangle.components.stroke}});
        expect(deserializeDocument(serializeDocument(document))).toEqual(document);
        const store = new EditorStore(document); store.select(document.shapes[0].id); store.setTitle('updated');
        expect(Object.keys(JSON.parse(store.toJSON()))).toEqual(['version', 'images', 'pages', 'title', 'shapes']);
        store.loadJSON(serializeDocument(document)); expect(store.getSnapshot()).toMatchObject({document, selectedId: null, canUndo: false, canRedo: false});
    });
    it.each(['{', 'null', '{"version":1,"title":"x","shapes":[]}', '{"version":0,"title":"x","shapes":[{}]}'])('rejects malformed input: %s', json => {
        const {store} = setup(); const initial = store.getSnapshot(); expect(() => store.loadJSON(json)).toThrow(); expect(store.getSnapshot()).toBe(initial);
    });
    it('rejects duplicate IDs, non-finite geometry, unknown fields and components', () => {
        const {document, first} = setup(); document.shapes.push(first); expect(() => serializeDocument(document)).toThrow(); document.shapes.pop();
        first.components.rect.bounds.x = Infinity; expect(() => serializeDocument(document)).toThrow(); first.components.rect.bounds.x = 0;
        expect(() => serializeDocument({...document, callback: () => {}} as typeof document)).toThrow();
        const json = serializeDocument(document).replace('resizable-bounds-component', 'unknown'); expect(() => deserializeDocument(json)).toThrow();
    });
});
