import {type ReactNode, useRef} from 'react';
import {MenuPopover} from './MenuPopover';

/**
 * A context menu at (x, y) in viewport coordinates. It closes itself after an enabled item runs,
 * on Escape, or on a click outside; React Aria handles focus and keyboard navigation.
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
    // React Aria positions popovers against an element, so an empty one marks the click point.
    const anchor = useRef<HTMLSpanElement>(null);
    return (
        <>
            <span ref={anchor} className="context-menu-anchor" style={{left: x, top: y}} />
            <MenuPopover
                label={label}
                triggerRef={anchor}
                isOpen
                offset={0}
                onOpenChange={open => {
                    if (!open) onClose();
                }}
                onClose={onClose}
            >
                {children}
            </MenuPopover>
        </>
    );
}
