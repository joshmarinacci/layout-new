import {useSyncExternalStore} from 'react';
import type {EditorStore} from './EditorStore';

export function useEditorStore(store: EditorStore) {
    return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
