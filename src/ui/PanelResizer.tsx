import {type KeyboardEvent, type PointerEvent, type RefObject, useRef} from 'react';

export const PANEL_MIN_WIDTH = 160;
export const PANEL_MAX_WIDTH = 560;

export function clampPanelWidth(width: number) {
    return Math.round(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, width)));
}

/**
 * A vertical drag handle on a side panel's inner edge. While dragging it previews the
 * width through a CSS variable on `target` (no React render per pointer move) and
 * commits the final width on release. Escape or a lost pointer cancels the drag.
 */
export function PanelResizer({side, label, width, target, onCommit}: {
    side: 'left' | 'right';
    label: string;
    width: number;
    target: RefObject<HTMLElement | null>;
    onCommit: (width: number) => void;
}) {
    const variable = side === 'left' ? '--left-width' : '--right-width';
    const drag = useRef<{pointerId: number; startX: number; startWidth: number; width: number} | null>(null);
    const preview = (next: number) => target.current?.style.setProperty(variable, `${next}px`);
    const end = (element: HTMLElement, commit: boolean) => {
        const active = drag.current;
        if (!active) return;
        drag.current = null;
        if (element.hasPointerCapture(active.pointerId)) element.releasePointerCapture(active.pointerId);
        if (commit) onCommit(active.width);
        else preview(width);
    };
    const step = (event: KeyboardEvent<HTMLDivElement>) => {
        const amount = event.shiftKey ? 50 : 10;
        const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
        const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
        if (event.key === 'Escape' && drag.current) { event.preventDefault(); end(event.currentTarget, false); return; }
        if (event.key !== grow && event.key !== shrink) return;
        event.preventDefault();
        onCommit(clampPanelWidth(width + (event.key === grow ? amount : -amount)));
    };
    return <div className={`panel-resizer panel-resizer-${side}`} role="separator" tabIndex={0}
                aria-label={label} aria-orientation="vertical"
                aria-valuenow={width} aria-valuemin={PANEL_MIN_WIDTH} aria-valuemax={PANEL_MAX_WIDTH}
                onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    event.currentTarget.focus();
                    drag.current = {pointerId: event.pointerId, startX: event.clientX, startWidth: width, width};
                }}
                onPointerMove={event => {
                    const active = drag.current;
                    if (!active || active.pointerId !== event.pointerId) return;
                    const delta = event.clientX - active.startX;
                    active.width = clampPanelWidth(active.startWidth + (side === 'left' ? delta : -delta));
                    preview(active.width);
                }}
                onPointerUp={event => end(event.currentTarget, true)}
                onPointerCancel={event => end(event.currentTarget, false)}
                onLostPointerCapture={event => end(event.currentTarget, false)}
                onKeyDown={step}/>;
}
