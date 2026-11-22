import {type CSSProperties, type HTMLAttributes, type ReactNode, useEffectEvent, useLayoutEffect, useRef} from 'react';

const VIEWPORT_MARGIN = 8;

/**
 * Nudge an open menu up or left so it stays fully on screen (a context menu opened near the
 * bottom of the window, for example). Its size is only known once it's laid out, so this
 * measures it and adjusts its position directly, before the first paint.
 */
export function keepInViewport(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const maxBottom = window.innerHeight - VIEWPORT_MARGIN;
    const maxRight = window.innerWidth - VIEWPORT_MARGIN;
    if (rect.bottom > maxBottom) element.style.top = `${Math.max(VIEWPORT_MARGIN, maxBottom - rect.height)}px`;
    if (rect.right > maxRight) {
        element.style.left = `${Math.max(VIEWPORT_MARGIN, maxRight - rect.width)}px`;
        element.style.right = 'auto';
    }
}

/**
 * A menu shown in the browser's top layer with the Popover API, so it's never clipped by a
 * scrolling panel or header. tooltheme styles `[popover] > menu` as a dropdown menu.
 * The caller decides when it's mounted and where it sits (fixed, viewport coordinates).
 * `onShown` runs once, right after the menu opens, e.g. to move focus into it.
 */
export function MenuPopover({
    label,
    style,
    onShown,
    children,
    ...props
}: HTMLAttributes<HTMLDivElement> & {
    label: string;
    style: CSSProperties;
    onShown?: (popover: HTMLDivElement) => void;
    children: ReactNode;
}) {
    const popover = useRef<HTMLDivElement>(null);
    const shown = useEffectEvent((element: HTMLDivElement) => onShown?.(element));
    useLayoutEffect(() => {
        const element = popover.current;
        if (!element) return;
        // Removing the element on unmount hides it again; older engines just render it in place.
        if (typeof element.showPopover === 'function') element.showPopover();
        keepInViewport(element);
        shown(element);
    }, []);
    return (
        <div ref={popover} popover="manual" className="menu-popover" style={style} {...props}>
            <menu role="menu" aria-label={label}>
                {children}
            </menu>
        </div>
    );
}
