import {type KeyboardEvent, type MouseEvent, type ReactNode, useRef} from 'react';
import {MenuPopover} from './MenuPopover';

const ITEM_SELECTOR = 'button:not(:disabled)';

/**
 * A floating context menu that closes itself after any enabled item runs.
 * On open it focuses the first enabled item; arrow keys, Home and End move between
 * items, and Escape or Tab closes the menu. Escape returns focus to where it was.
 */
export function ContextMenu({
    x,
    y,
    label,
    onClose,
    children,
}: {
    x: number;
    y: number;
    label: string;
    onClose: () => void;
    children: ReactNode;
}) {
    const returnFocus = useRef<HTMLElement | null>(null);
    const focusFirstItem = (popover: HTMLDivElement) => {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        popover.querySelector<HTMLButtonElement>(ITEM_SELECTOR)?.focus();
    };
    const closeAndRestoreFocus = () => {
        onClose();
        if (returnFocus.current?.isConnected) returnFocus.current.focus();
    };
    // Item handlers run first; the click then bubbles here and closes the menu.
    const closeAfterItem = (event: MouseEvent<HTMLDivElement>) => {
        if (event.target instanceof Element && event.target.closest(ITEM_SELECTOR)) onClose();
    };
    const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeAndRestoreFocus();
            return;
        }
        if (event.key === 'Tab') {
            event.preventDefault();
            closeAndRestoreFocus();
            return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR));
        if (!items.length) return;
        const index = items.findIndex(item => item === document.activeElement);
        const next =
            event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : event.key === 'ArrowDown'
                    ? (index + 1) % items.length
                    : index <= 0
                      ? items.length - 1
                      : index - 1;
        items[next]?.focus();
    };
    return (
        <MenuPopover
            label={label}
            style={{left: x, top: y}}
            onShown={focusFirstItem}
            onContextMenu={event => event.preventDefault()}
            onPointerDown={event => event.stopPropagation()}
            onClick={closeAfterItem}
            onKeyDown={navigate}
        >
            {children}
        </MenuPopover>
    );
}
