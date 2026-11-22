import {type KeyboardEvent, type ReactNode, useLayoutEffect, useRef} from 'react';

const ITEM_SELECTOR = 'button:not(:disabled)';

/**
 * A horizontal ARIA toolbar: one Tab stop for the whole bar (the last focused button, else the
 * first), and Left/Right/Home/End move between enabled buttons. Buttons come and go with the
 * selection, so tab stops are re-assigned after every render rather than tracked in state.
 */
export function Toolbar({label, className, children}: {label: string; className?: string; children: ReactNode}) {
    const bar = useRef<HTMLDivElement>(null);
    const active = useRef<HTMLButtonElement | null>(null);
    const items = () => Array.from(bar.current?.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR) ?? []);
    useLayoutEffect(() => {
        const buttons = items();
        const current = active.current && buttons.includes(active.current) ? active.current : buttons[0];
        for (const button of buttons) button.tabIndex = button === current ? 0 : -1;
    });
    const move = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const buttons = items();
        if (!buttons.length) return;
        event.preventDefault();
        const index = buttons.findIndex(button => button === document.activeElement);
        const next =
            event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : event.key === 'ArrowRight'
                    ? (index + 1) % buttons.length
                    : index <= 0
                      ? buttons.length - 1
                      : index - 1;
        buttons[next].focus();
    };
    return (
        <div
            ref={bar}
            className={className}
            role="toolbar"
            aria-label={label}
            aria-orientation="horizontal"
            onKeyDown={move}
            onFocus={event => {
                if (!(event.target instanceof HTMLButtonElement) || !event.target.matches(ITEM_SELECTOR)) return;
                active.current = event.target;
                for (const button of items()) button.tabIndex = button === event.target ? 0 : -1;
            }}
        >
            {children}
        </div>
    );
}
