// Adapted from layout-mockup's icon toolbars, menu rows, property sections and custom select.
import {ChevronDown, type LucideIcon} from 'lucide-react';
import type {ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes} from 'react';

export function IconButton({label, icon: Icon, className = '', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {label: string; icon: LucideIcon}) {
    return <button type="button" {...props} className={`icon-button ghost ${className}`} aria-label={label} title={label}><Icon aria-hidden="true"/></button>;
}
export function ToolbarGroup({label, children}: {label: string; children: ReactNode}) {
    return <div className="toolbar-group" role="group" aria-label={label}>{children}</div>;
}
export function MenuItem({label, shortcut, ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {label: string; shortcut?: string}) {
    return <button type="button" {...props} className="menu-item"><span>{label}</span>{shortcut && <kbd>{shortcut}</kbd>}</button>;
}
export function PropertySection({title, children}: {title: string; children: ReactNode}) {
    return <details open className="property-section"><summary>{title}</summary><section className="prop-sheet-panel">{children}</section></details>;
}
/** Keep native selection, type-ahead and keyboard semantics behind the mockup's chevron control. */
export function SelectControl({children, ...props}: SelectHTMLAttributes<HTMLSelectElement>) {
    return <span className="custom-select"><select {...props}>{children}</select><ChevronDown aria-hidden="true"/></span>;
}
