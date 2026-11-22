// Thin wrappers over plain elements; tooltheme styles them from their semantics.
import {type LucideIcon} from 'lucide-react';
import type {ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes} from 'react';

/** A square icon-only button: tooltheme sizes `button[aria-label]` holding just an svg. */
export function IconButton({
    label,
    icon: Icon,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    icon: LucideIcon;
}) {
    return (
        <button type="button" {...props} aria-label={label} title={label}>
            <Icon aria-hidden="true" />
        </button>
    );
}

export function ToolbarGroup({label, children}: {label: string; children: ReactNode}) {
    return (
        <div className="toolbar-group" role="group" aria-label={label}>
            {children}
        </div>
    );
}

export function MenuItem({
    label,
    shortcut,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    shortcut?: string;
}) {
    return (
        <button type="button" role="menuitem" {...props}>
            <span>{label}</span>
            {shortcut && <kbd>{shortcut}</kbd>}
        </button>
    );
}

/** A collapsible inspector panel (tooltheme's `details > summary`). */
export function PropertySection({title, children}: {title: string; children: ReactNode}) {
    return (
        <details open>
            <summary>{title}</summary>
            <div className="prop-sheet-panel">{children}</div>
        </details>
    );
}

/** A native select; tooltheme draws its chevron. */
export function SelectControl({children, ...props}: SelectHTMLAttributes<HTMLSelectElement>) {
    return <select {...props}>{children}</select>;
}
