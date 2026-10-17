import type {KeyboardEvent} from 'react';
import type {EditorStore} from './EditorStore';

export function NameField({store, label, value, rename}: {
    store: EditorStore; label: string; value: string; rename: (name: string) => void;
}) {
    const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
            if (store.getSnapshot().transactionActive) store.cancelTransaction();
            event.currentTarget.blur();
        }
    };
    return <label className="name-field"><span>{label}</span><input aria-label={label} value={value}
        onFocus={() => store.beginTransaction('Rename item')}
        onChange={event => rename(event.target.value)}
        onKeyDown={keyDown}
        onBlur={() => { if (store.getSnapshot().transactionActive) store.commitTransaction(); }}/></label>;
}
