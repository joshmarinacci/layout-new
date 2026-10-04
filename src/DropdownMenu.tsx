import {useEffect, useId, useRef, useState, type ReactNode} from 'react';

export function DropdownMenu({title, children}: {title: string; children: ReactNode}) {
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
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
        onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false); button.current?.focus(); }
        }}>
        <button ref={button} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
            {title} <span aria-hidden="true">▾</span>
        </button>
        {open && <div id={id} className="file-menu-actions" onClick={event => {
            if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) {
                setOpen(false); button.current?.focus();
            }
        }}>{children}</div>}
    </div>;
}
