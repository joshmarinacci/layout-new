import {type CSSProperties, type HTMLAttributes, type ReactNode, useLayoutEffect, useRef} from 'react';

/**
 * A menu shown in the browser's top layer with the Popover API, so it's never clipped by a
 * scrolling panel or header. tooltheme styles `[popover] > menu` as a dropdown menu.
 * The caller decides when it's mounted and where it sits (fixed, viewport coordinates).
 */
export function MenuPopover({label, style, children, ...props}: HTMLAttributes<HTMLDivElement> & {
    label: string;
    style: CSSProperties;
    children: ReactNode;
}) {
    const popover = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const element = popover.current;
        // Removing the element on unmount hides it again; older engines just render it in place.
        if (element && typeof element.showPopover === 'function') element.showPopover();
    }, []);
    return <div ref={popover} popover="manual" className="menu-popover" style={style} {...props}>
        <menu role="menu" aria-label={label}>{children}</menu>
    </div>;
}
