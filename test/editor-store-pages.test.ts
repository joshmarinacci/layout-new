import {describe, expect, it, vi} from 'vitest';
import {EditorStore, emptyDocument} from '../src/model/EditorStore';

describe('EditorStore.selectPage', () => {
    it('publishes a page change even when nothing is selected', () => {
        const store = new EditorStore(emptyDocument());
        const first = store.getSnapshot().selectedPageId;
        const second = store.createPage();
        expect(store.getSnapshot().selectedIds).toEqual([]);
        const listener = vi.fn();
        store.subscribe(listener);
        store.selectPage(first);
        expect(listener).toHaveBeenCalled();
        expect(store.getSnapshot().selectedPageId).toBe(first);
        store.selectPage(second);
        expect(store.getSnapshot().selectedPageId).toBe(second);
    });
});
