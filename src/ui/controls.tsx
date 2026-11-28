// Thin wrappers over plain elements (and React Aria for menus); tooltheme styles them from their semantics.
import {type LucideIcon} from 'lucide-react';
import type {ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes} from 'react';
import {Keyboard, MenuItem as AriaMenuItem} from 'react-aria-components';

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

/** A menu item for a MenuPopover: its label, and the keyboard shortcut when it has one. */
export function MenuItem({
    label,
    shortcut,
    disabled,
    onAction,
    variant,
    title,
}: {
    label: string;
    shortcut?: string;
    disabled?: boolean;
    onAction?: () => void;
    variant?: 'danger';
    /** A tooltip, e.g. why the item is disabled. */
    title?: string;
}) {
    return (
        <AriaMenuItem textValue={label} isDisabled={disabled} onAction={onAction} data-variant={variant}>
            <span title={title}>{label}</span>
            {shortcut && <Keyboard>{shortcut}</Keyboard>}
        </AriaMenuItem>
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
