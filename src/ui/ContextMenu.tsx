import type {MouseEvent, ReactNode} from 'react';

/** A floating context menu that closes itself after any enabled item runs. */
export function ContextMenu({x, y, label, onClose, children}: {
    x: number;
    y: number;
    label: string;
    onClose: () => void;
    children: ReactNode;
}) {
    // Item handlers run first; the click then bubbles here and closes the menu.
    const closeAfterItem = (event: MouseEvent<HTMLDivElement>) => {
        if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) onClose();
    };
    return <div className="shape-context-menu" style={{left: x, top: y}} role="menu" aria-label={label}
                onContextMenu={event => event.preventDefault()}
                onPointerDown={event => event.stopPropagation()}
                onClick={closeAfterItem}>
        {children}
    </div>;
}
