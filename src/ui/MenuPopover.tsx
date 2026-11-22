import {type CSSProperties, type HTMLAttributes, type ReactNode, useEffectEvent, useLayoutEffect, useRef} from 'react';

/**
 * A menu shown in the browser's top layer with the Popover API, so it's never clipped by a
 * scrolling panel or header. tooltheme styles `[popover] > menu` as a dropdown menu.
 * The caller decides when it's mounted and where it sits (fixed, viewport coordinates).
 * `onShown` runs once, right after the menu opens, e.g. to move focus into it.
 */
export function MenuPopover({label, style, onShown, children, ...props}: HTMLAttributes<HTMLDivElement> & {
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
        shown(element);
    }, []);
    return <div ref={popover} popover="manual" className="menu-popover" style={style} {...props}>
        <menu role="menu" aria-label={label}>{children}</menu>
    </div>;
}
