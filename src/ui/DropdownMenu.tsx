import {ChevronDown, type LucideIcon} from 'lucide-react';
import {type ReactNode, useEffect, useId, useRef, useState} from 'react';

export function DropdownMenu({title, children, icon: Icon}: {
    title: string;
    children: ReactNode;
    icon?: LucideIcon
}) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const id = useId();
    useEffect(() => {
        if (!open) return;
        const dismiss = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener('pointerdown', dismiss);
        return () => document.removeEventListener('pointerdown', dismiss);
    }, [open]);
    return <div className="file-menu" ref={root}
                onBlur={event => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
                }}
                onKeyDown={event => {
                    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                        event.preventDefault();
                        const focusItem = () => {
                            const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('.file-menu-actions button:not(:disabled)') ?? []);
                            if (!items.length) return;
                            const index = items.indexOf(document.activeElement as HTMLButtonElement);
                            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (index + 1) % items.length : (index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length);
                            items[next]?.focus();
                        };
                        if (!open) {
                            setOpen(true);
                            requestAnimationFrame(focusItem);
                        } else focusItem();
                    }
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        setOpen(false);
                        button.current?.focus();
                    }
                }}>
        <button ref={button} aria-expanded={open} aria-controls={id}
                onClick={() => setOpen(value => !value)}>
            {Icon && <Icon aria-hidden="true"/>}{title}<ChevronDown aria-hidden="true"/>
        </button>
        {open && <div id={id} className="file-menu-actions" onClick={event => {
            if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) {
                setOpen(false);
                button.current?.focus();
            }
        }}>{children}</div>}
    </div>;
}

export function Separator() {
    return <hr className="menu-separator" aria-hidden="true"/>
}